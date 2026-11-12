"use server";

import { revalidatePath } from "next/cache";
import {
  createJob,
  deleteJob,
  updateJob,
  type CreateJobInput,
  type JobStatus,
  type UpdateJobInput,
} from "@/lib/jobs";
import { requireSessionUserId } from "@/lib/session";

type JobResult = { ok: true } | { ok: false; error: string };

type BoardActionDeps = {
  requireUserId?: () => Promise<string>;
  revalidate?: (path: string) => void;
  jobs?: {
    createJob?: (userId: string, input: CreateJobInput) => Promise<JobResult>;
    updateJob?: (userId: string, jobId: string, input: UpdateJobInput) => Promise<JobResult>;
    deleteJob?: (userId: string, jobId: string) => Promise<JobResult>;
  };
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function mutateBoard(
  run: (userId: string) => Promise<JobResult>,
  deps?: BoardActionDeps
) {
  const requireUserId = deps?.requireUserId ?? requireSessionUserId;
  const revalidate = deps?.revalidate ?? revalidatePath;
  const userId = await requireUserId();
  try {
    const result = await run(userId);
    if (!result.ok) {
      return { error: result.error };
    }
    revalidate("/board");
    return { ok: true as const };
  } catch {
    return { error: "Could not save. Please try again." };
  }
}

export async function createJobAction(formData: FormData, deps?: BoardActionDeps) {
  const create = deps?.jobs?.createJob ?? createJob;
  return mutateBoard(
    (userId) =>
      create(userId, {
        company: formString(formData, "company"),
        title: formString(formData, "title"),
        url: formString(formData, "url"),
        notes: formString(formData, "notes"),
        appliedAt: formString(formData, "appliedAt") || undefined,
      }),
    deps
  );
}

export async function updateJobAction(formData: FormData, deps?: BoardActionDeps) {
  const update = deps?.jobs?.updateJob ?? updateJob;
  return mutateBoard(
    (userId) =>
      update(userId, formString(formData, "id"), {
        company: formString(formData, "company") || undefined,
        title: formString(formData, "title") || undefined,
        url: formData.has("url") ? formString(formData, "url") : undefined,
        notes: formData.has("notes") ? formString(formData, "notes") : undefined,
        appliedAt: formString(formData, "appliedAt") || undefined,
      }),
    deps
  );
}

export async function deleteJobAction(jobId: string, deps?: BoardActionDeps) {
  const remove = deps?.jobs?.deleteJob ?? deleteJob;
  return mutateBoard((userId) => remove(userId, jobId), deps);
}

export async function moveJobAction(jobId: string, status: JobStatus, deps?: BoardActionDeps) {
  const update = deps?.jobs?.updateJob ?? updateJob;
  return mutateBoard((userId) => update(userId, jobId, { status }), deps);
}
