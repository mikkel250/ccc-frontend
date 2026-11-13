"use server";

import { createJob, deleteJob, updateJob, type JobStatus, type JobsStore } from "@/lib/jobs";
import { runJobAction, type JobActionRunDeps } from "@/lib/job-actions";
import type { RateLimitResult } from "@/lib/rate-limit";

type JobActionDeps = {
  requireUserId?: () => Promise<string>;
  revalidate?: () => void;
  db?: JobsStore;
  consume?: (key: string) => RateLimitResult;
};

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function runDeps(deps: JobActionDeps): JobActionRunDeps {
  return {
    requireUserId: deps.requireUserId,
    revalidate: deps.revalidate,
    consume: deps.consume,
  };
}

export async function createJobAction(formData: FormData, deps: JobActionDeps = {}) {
  return runJobAction(
    (userId) =>
      createJob(
        userId,
        {
          company: formString(formData, "company"),
          title: formString(formData, "title"),
          url: formString(formData, "url"),
          notes: formString(formData, "notes"),
          appliedAt: formString(formData, "appliedAt") || undefined,
        },
        deps.db ? { db: deps.db } : undefined
      ),
    runDeps(deps)
  );
}

export async function updateJobAction(formData: FormData, deps: JobActionDeps = {}) {
  return runJobAction(
    (userId) =>
      updateJob(
        userId,
        formString(formData, "id"),
        {
          company: formString(formData, "company") || undefined,
          title: formString(formData, "title") || undefined,
          url: formData.has("url") ? formString(formData, "url") : undefined,
          notes: formData.has("notes") ? formString(formData, "notes") : undefined,
          appliedAt: formString(formData, "appliedAt") || undefined,
        },
        deps.db ? { db: deps.db } : undefined
      ),
    runDeps(deps)
  );
}

export async function deleteJobAction(jobId: string, deps: JobActionDeps = {}) {
  return runJobAction(
    (userId) => deleteJob(userId, jobId, deps.db ? { db: deps.db } : undefined),
    runDeps(deps)
  );
}

export async function moveJobAction(jobId: string, status: JobStatus, deps: JobActionDeps = {}) {
  return runJobAction(
    (userId) => updateJob(userId, jobId, { status }, deps.db ? { db: deps.db } : undefined),
    runDeps(deps)
  );
}
