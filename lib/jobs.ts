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
    updateMany: (args: {
      where: { id: string; userId: string };
      data: Record<string, unknown>;
    }) => Promise<{ count: number }>;
    deleteMany: (args: { where: { id: string; userId: string } }) => Promise<{ count: number }>;
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

export type BoardJob = Pick<JobRecord, "id" | "company" | "title" | "url" | "notes" | "status"> & {
  appliedAt: string;
};

export type CreateJobInput = {
  company: string;
  title: string;
  url?: string | null;
  notes?: string | null;
  appliedAt?: Date | string | null;
  status?: string;
};

export type UpdateJobInput = Partial<CreateJobInput>;

export function isJobStatus(value: string): value is JobStatus {
  return (JOB_STATUSES as readonly string[]).includes(value);
}

export function toBoardJob(job: JobRecord): BoardJob {
  return {
    id: job.id,
    company: job.company,
    title: job.title,
    url: job.url,
    notes: job.notes,
    status: job.status,
    appliedAt: job.appliedAt.toISOString().slice(0, 10),
  };
}

const jobStatusSchema = z.enum(JOB_STATUSES);
const requiredNameSchema = z.string().trim().min(1).max(200);

const emptyToNull = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  });

const httpUrlSchema = emptyToNull.refine((value) => {
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

const notesSchema = emptyToNull.refine(
  (value) => value == null || value.length <= 4000,
  "Notes are too long"
);

const createJobSchema = z.object({
  company: requiredNameSchema,
  title: requiredNameSchema,
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

function calendarDateUtc(value = new Date()): Date {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return new Date(`${year}-${month}-${day}T00:00:00.000Z`);
}

async function withStore<T>(
  run: () => Promise<T>,
  error: string
): Promise<T | JobFailure> {
  try {
    return await run();
  } catch {
    return { ok: false, code: "invalid", error };
  }
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

function isJobFailure(value: unknown): value is JobFailure {
  return Boolean(value && typeof value === "object" && "ok" in value && (value as { ok: unknown }).ok === false);
}

export async function listJobs(
  userId: string,
  deps?: JobDeps
): Promise<{ ok: true; jobs: JobRecord[] } | JobFailure> {
  const authError = requireUserId(userId);
  if (authError) {
    return authError;
  }
  const listed = await withStore(
    () =>
      getDb(deps).job.findMany({
        where: { userId },
        orderBy: [{ status: "asc" }, { position: "asc" }],
      }),
    "Could not load applications. Please try again."
  );
  if (isJobFailure(listed)) {
    return listed;
  }
  return { ok: true, jobs: listed };
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
  const persistedAppliedAt = appliedAt ?? calendarDateUtc();
  const created = await withStore(async () => {
    const position = await nextPosition(db, userId, parsed.data.status);
    return db.job.create({
      data: {
        userId,
        company: parsed.data.company,
        title: parsed.data.title,
        url: parsed.data.url ?? null,
        notes: parsed.data.notes ?? null,
        status: parsed.data.status,
        position,
        appliedAt: persistedAppliedAt,
      },
    });
  }, "Could not save. Please try again.");
  if (isJobFailure(created)) {
    return created;
  }
  return { ok: true, job: created };
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
  const existing = await withStore(
    () => db.job.findFirst({ where: { id: jobId, userId } }),
    "Could not save. Please try again."
  );
  if (isJobFailure(existing)) {
    return existing;
  }
  if (!existing) {
    return { ok: false, code: "not_found", error: "Job not found." };
  }
  const patch: Record<string, unknown> = {};
  if (input.company !== undefined) {
    const company = requiredNameSchema.safeParse(input.company);
    if (!company.success) {
      return { ok: false, code: "invalid", error: "Check the company, title, URL, and notes." };
    }
    patch.company = company.data;
  }
  if (input.title !== undefined) {
    const title = requiredNameSchema.safeParse(input.title);
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
      const position = await withStore(
        () => nextPosition(db, userId, status.data),
        "Could not save. Please try again."
      );
      if (isJobFailure(position)) {
        return position;
      }
      patch.position = position;
    }
  }
  const saved = await withStore(async () => {
    const updated = await db.job.updateMany({
      where: { id: jobId, userId },
      data: patch,
    });
    if (updated.count === 0) {
      return null;
    }
    return db.job.findFirst({ where: { id: jobId, userId } });
  }, "Could not save. Please try again.");
  if (isJobFailure(saved)) {
    return saved;
  }
  if (!saved) {
    return { ok: false, code: "not_found", error: "Job not found." };
  }
  return { ok: true, job: saved };
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
  const deleted = await withStore(
    () => db.job.deleteMany({ where: { id: jobId, userId } }),
    "Could not save. Please try again."
  );
  if (isJobFailure(deleted)) {
    return deleted;
  }
  if (deleted.count === 0) {
    return { ok: false, code: "not_found", error: "Job not found." };
  }
  return { ok: true };
}
