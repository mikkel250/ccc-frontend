import { z } from "zod";
import { getPrisma } from "./prisma";

export const JOB_STATUSES = ["applied", "interview", "offer", "rejected"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobRecord = {
  id: string;
  userId: string;
  company: string;
  title: string;
  url: string | null;
  notes: string | null;
  status: JobStatus;
  position: number;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type JobsStore = {
  job: {
    findMany: (args: {
      where: { userId: string; status?: JobStatus };
      orderBy?: Array<Record<string, "asc" | "desc">>;
    }) => Promise<JobRecord[]>;
    findFirst: (args: { where: { id: string; userId?: string } }) => Promise<JobRecord | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<JobRecord>;
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<JobRecord>;
    delete: (args: { where: { id: string } }) => Promise<JobRecord>;
    aggregate: (args: {
      where: { userId: string; status?: JobStatus };
      _max: { position: true };
    }) => Promise<{ _max: { position: number | null } }>;
  };
};

export type JobDeps = {
  db?: JobsStore;
};

export type JobFailure = {
  ok: false;
  code: "not_found" | "invalid";
  error: string;
};

export type CreateJobInput = {
  company: string;
  title: string;
  url?: string | null;
  notes?: string | null;
  appliedAt?: Date | string | null;
  status?: string;
};

export type UpdateJobInput = {
  company?: string;
  title?: string;
  url?: string | null;
  notes?: string | null;
  appliedAt?: Date | string | null;
  status?: string;
};

const jobStatusSchema = z.enum(JOB_STATUSES);

const httpUrlSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  })
  .refine((value) => {
    if (value == null) {
      return true;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }, "URL must be http or https");

const notesSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  })
  .refine((value) => value == null || value.length <= 4000, "Notes are too long");

const createJobSchema = z.object({
  company: z.string().trim().min(1).max(200),
  title: z.string().trim().min(1).max(200),
  url: httpUrlSchema.optional(),
  notes: notesSchema.optional(),
  status: jobStatusSchema.optional().default("applied"),
  appliedAt: z.union([z.date(), z.string(), z.null(), z.undefined()]).optional(),
});

function getDb(deps?: JobDeps): JobsStore {
  return deps?.db ?? (getPrisma() as unknown as JobsStore);
}

function requireUserId(userId: string): JobFailure | null {
  if (!userId.trim()) {
    return { ok: false, code: "invalid", error: "Sign in required." };
  }
  return null;
}

function parseAppliedAt(value: Date | string | null | undefined): Date | undefined | "invalid" {
  if (value == null || value === "") {
    return undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "invalid" : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "invalid" : parsed;
}

async function nextPosition(db: JobsStore, userId: string, status: JobStatus): Promise<number> {
  const agg = await db.job.aggregate({
    where: { userId, status },
    _max: { position: true },
  });
  return (agg._max.position ?? -1) + 1;
}

export async function listJobs(
  userId: string,
  deps?: JobDeps
): Promise<{ ok: true; jobs: JobRecord[] } | JobFailure> {
  const authError = requireUserId(userId);
  if (authError) {
    return authError;
  }
  const jobs = await getDb(deps).job.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { position: "asc" }],
  });
  return { ok: true, jobs };
}

export async function createJob(
  userId: string,
  input: CreateJobInput,
  deps?: JobDeps
): Promise<{ ok: true; job: JobRecord } | JobFailure> {
  const authError = requireUserId(userId);
  if (authError) {
    return authError;
  }
  const parsed = createJobSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", error: "Check the company, title, URL, and notes." };
  }
  const appliedAt = parseAppliedAt(parsed.data.appliedAt);
  if (appliedAt === "invalid") {
    return { ok: false, code: "invalid", error: "Check the applied date." };
  }
  const db = getDb(deps);
  const position = await nextPosition(db, userId, parsed.data.status);
  const job = await db.job.create({
    data: {
      userId,
      company: parsed.data.company,
      title: parsed.data.title,
      url: parsed.data.url ?? null,
      notes: parsed.data.notes ?? null,
      status: parsed.data.status,
      position,
      ...(appliedAt ? { appliedAt } : {}),
    },
  });
  return { ok: true, job };
}

export async function updateJob(
  userId: string,
  jobId: string,
  input: UpdateJobInput,
  deps?: JobDeps
): Promise<{ ok: true; job: JobRecord } | JobFailure> {
  const authError = requireUserId(userId);
  if (authError) {
    return authError;
  }
  if (!jobId.trim()) {
    return { ok: false, code: "invalid", error: "Job is required." };
  }
  const db = getDb(deps);
  const existing = await db.job.findFirst({ where: { id: jobId, userId } });
  if (!existing) {
    return { ok: false, code: "not_found", error: "Job not found." };
  }
  const patch: Record<string, unknown> = {};
  if (input.company !== undefined) {
    const company = z.string().trim().min(1).max(200).safeParse(input.company);
    if (!company.success) {
      return { ok: false, code: "invalid", error: "Check the company, title, URL, and notes." };
    }
    patch.company = company.data;
  }
  if (input.title !== undefined) {
    const title = z.string().trim().min(1).max(200).safeParse(input.title);
    if (!title.success) {
      return { ok: false, code: "invalid", error: "Check the company, title, URL, and notes." };
    }
    patch.title = title.data;
  }
  if (input.url !== undefined) {
    const url = httpUrlSchema.safeParse(input.url);
    if (!url.success) {
      return { ok: false, code: "invalid", error: "Check the company, title, URL, and notes." };
    }
    patch.url = url.data;
  }
  if (input.notes !== undefined) {
    const notes = notesSchema.safeParse(input.notes);
    if (!notes.success) {
      return { ok: false, code: "invalid", error: "Check the company, title, URL, and notes." };
    }
    patch.notes = notes.data;
  }
  if (input.appliedAt !== undefined) {
    const appliedAt = parseAppliedAt(input.appliedAt);
    if (appliedAt === "invalid") {
      return { ok: false, code: "invalid", error: "Check the applied date." };
    }
    if (appliedAt) {
      patch.appliedAt = appliedAt;
    }
  }
  if (input.status !== undefined) {
    const status = jobStatusSchema.safeParse(input.status);
    if (!status.success) {
      return { ok: false, code: "invalid", error: "Choose a valid column." };
    }
    if (status.data !== existing.status) {
      patch.status = status.data;
      patch.position = await nextPosition(db, userId, status.data);
    }
  }
  const job = await db.job.update({
    where: { id: existing.id },
    data: patch,
  });
  return { ok: true, job };
}

export async function deleteJob(
  userId: string,
  jobId: string,
  deps?: JobDeps
): Promise<{ ok: true } | JobFailure> {
  const authError = requireUserId(userId);
  if (authError) {
    return authError;
  }
  const db = getDb(deps);
  const existing = await db.job.findFirst({ where: { id: jobId, userId } });
  if (!existing) {
    return { ok: false, code: "not_found", error: "Job not found." };
  }
  await db.job.delete({ where: { id: existing.id } });
  return { ok: true };
}
