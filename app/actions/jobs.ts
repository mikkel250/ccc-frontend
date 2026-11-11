"use server";

import { createJob, deleteJob, updateJob, type JobStatus } from "@/lib/jobs";
import { runJobAction } from "@/lib/job-actions";

function formString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function createJobAction(formData: FormData) {
  return runJobAction((userId) =>
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
  return runJobAction((userId) =>
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
  return runJobAction((userId) => deleteJob(userId, jobId));
}

export async function moveJobAction(jobId: string, status: JobStatus) {
  return runJobAction((userId) => updateJob(userId, jobId, { status }));
}
