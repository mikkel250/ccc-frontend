"use server";

import { revalidatePath } from "next/cache";
import { createJob, deleteJob, updateJob, type JobStatus } from "@/lib/jobs";
import { requireSessionUserId } from "@/lib/session";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

async function mutateBoard(
  run: (userId: string) => Promise<{ ok: true } | { ok: false; error: string }>
) {
  const userId = await requireSessionUserId();
  try {
    const result = await run(userId);
    if (!result.ok) {
      return { error: result.error };
    }
    revalidatePath("/board");
    return { ok: true as const };
  } catch {
    return { error: "Could not save. Please try again." };
  }
}

export async function createJobAction(formData: FormData) {
  return mutateBoard((userId) =>
    createJob(userId, {
      company: formString(formData, "company"),
      title: formString(formData, "title"),
      url: formString(formData, "url"),
      notes: formString(formData, "notes"),
      appliedAt: formString(formData, "appliedAt") || undefined,
    })
  );
}

export async function updateJobAction(formData: FormData) {
  return mutateBoard((userId) =>
    updateJob(userId, formString(formData, "id"), {
      company: formString(formData, "company") || undefined,
      title: formString(formData, "title") || undefined,
      url: formData.has("url") ? formString(formData, "url") : undefined,
      notes: formData.has("notes") ? formString(formData, "notes") : undefined,
      appliedAt: formString(formData, "appliedAt") || undefined,
    })
  );
}

export async function deleteJobAction(jobId: string) {
  return mutateBoard((userId) => deleteJob(userId, jobId));
}

export async function moveJobAction(jobId: string, status: JobStatus) {
  return mutateBoard((userId) => updateJob(userId, jobId, { status }));
}
