"use client";

import { useState, useTransition } from "react";
import {
  createJobAction,
  deleteJobAction,
  moveJobAction,
  updateJobAction,
} from "@/app/actions/jobs";
import { JOB_STATUSES, isJobStatus, type BoardJob, type JobStatus } from "@/lib/jobs";

const COLUMN_LABELS: Record<JobStatus, string> = {
  applied: "Applied",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

const inputClass =
  "rounded-md border border-neutral-300 bg-white p-2 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100";

function localDateInputValue(value = new Date()): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function KanbanBoard({ jobs }: { jobs: BoardJob[] }) {
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function runAction(action: () => Promise<{ error?: string } | undefined>) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) {
          setError(result.error);
          return;
        }
        setError(null);
        setEditingId(null);
      } catch {
        setError("Could not save. Please try again.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        className="grid gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800 md:grid-cols-2"
        action={(formData) => {
          runAction(() => createJobAction(formData));
        }}
      >
        <h2 className="text-sm font-semibold md:col-span-2">Add application</h2>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Company
          <input name="company" required maxLength={200} disabled={pending} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Role title
          <input name="title" required maxLength={200} disabled={pending} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          URL
          <input name="url" type="url" disabled={pending} className={inputClass} placeholder="https://" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Applied date
          <input
            name="appliedAt"
            type="date"
            defaultValue={localDateInputValue()}
            disabled={pending}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium md:col-span-2">
          Notes
          <textarea name="notes" rows={3} maxLength={4000} disabled={pending} className={inputClass} />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
        >
          {pending ? "Saving…" : "Add card"}
        </button>
      </form>

      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          No applications yet. Add a role to start the board.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          {JOB_STATUSES.map((status) => {
            const columnJobs = jobs.filter((job) => job.status === status);
            return (
              <section
                key={status}
                className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800"
              >
                <h2 className="text-sm font-semibold">
                  {COLUMN_LABELS[status]}{" "}
                  <span className="font-normal text-neutral-500">({columnJobs.length})</span>
                </h2>
                {columnJobs.map((job) => (
                  <article
                    key={job.id}
                    className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-700"
                  >
                    <p className="text-sm font-medium">{job.company}</p>
                    <p className="text-sm text-neutral-700 dark:text-neutral-300">{job.title}</p>
                    <label className="flex flex-col gap-1 text-xs font-medium">
                      Column
                      <select
                        value={job.status}
                        disabled={pending}
                        className={inputClass}
                        onChange={(event) => {
                          const nextStatus = event.target.value;
                          if (!isJobStatus(nextStatus)) {
                            return;
                          }
                          runAction(() => moveJobAction(job.id, nextStatus));
                        }}
                      >
                        {JOB_STATUSES.map((option) => (
                          <option key={option} value={option}>
                            {COLUMN_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        className="text-sm underline disabled:opacity-60"
                        onClick={() => setEditingId(editingId === job.id ? null : job.id)}
                      >
                        {editingId === job.id ? "Close" : "Edit"}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        className="text-sm underline disabled:opacity-60"
                        onClick={() => {
                          if (!window.confirm("Delete this application?")) {
                            return;
                          }
                          runAction(() => deleteJobAction(job.id));
                        }}
                      >
                        Delete
                      </button>
                    </div>
                    {editingId === job.id ? (
                      <form
                        className="flex flex-col gap-2"
                        action={(formData) => {
                          formData.set("id", job.id);
                          runAction(() => updateJobAction(formData));
                        }}
                      >
                        <input name="company" defaultValue={job.company} required maxLength={200} disabled={pending} className={inputClass} />
                        <input name="title" defaultValue={job.title} required maxLength={200} disabled={pending} className={inputClass} />
                        <input name="url" type="url" defaultValue={job.url ?? ""} disabled={pending} className={inputClass} />
                        <input name="appliedAt" type="date" defaultValue={job.appliedAt} disabled={pending} className={inputClass} />
                        <textarea name="notes" rows={3} defaultValue={job.notes ?? ""} maxLength={4000} disabled={pending} className={inputClass} />
                        <button
                          type="submit"
                          disabled={pending}
                          className="w-fit rounded-md bg-neutral-900 px-3 py-1 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
                        >
                          Save
                        </button>
                      </form>
                    ) : null}
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
