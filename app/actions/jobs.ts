"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createJob, deleteJob, updateJob, type JobStatus } from "@/lib/jobs";
import { getSessionUserId } from "@/lib/session";

async function requireUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }
  return userId;
}

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createJobAction(formData: FormData) {
  const userId = await requireUserId();
  const result = await createJob(userId, {
    company: formString(formData, "company"),
    title: formString(formData, "title"),
    url: formString(formData, "url"),
    notes: formString(formData, "notes"),
    appliedAt: formString(formData, "appliedAt") || undefined,
    status: formString(formData, "status") || "applied",
  });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/board");
  return { ok: true as const };
}

export async function updateJobAction(formData: FormData) {
  const userId = await requireUserId();
  const jobId = formString(formData, "id");
  const status = formString(formData, "status");
  const result = await updateJob(userId, jobId, {
    company: formString(formData, "company") || undefined,
    title: formString(formData, "title") || undefined,
    url: formData.has("url") ? formString(formData, "url") : undefined,
    notes: formData.has("notes") ? formString(formData, "notes") : undefined,
    appliedAt: formString(formData, "appliedAt") || undefined,
    status: status ? (status as JobStatus) : undefined,
  });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/board");
  return { ok: true as const };
}

export async function deleteJobAction(formData: FormData) {
  const userId = await requireUserId();
  const result = await deleteJob(userId, formString(formData, "id"));
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/board");
  return { ok: true as const };
}

export async function moveJobAction(jobId: string, status: JobStatus) {
  const userId = await requireUserId();
  const result = await updateJob(userId, jobId, { status });
  if (!result.ok) {
    return { error: result.error };
  }
  revalidatePath("/board");
  return { ok: true as const };
}
