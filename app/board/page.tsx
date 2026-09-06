import { redirect } from "next/navigation";
import { listJobs } from "@/lib/jobs";
import { getSessionUserId } from "@/lib/session";
import { KanbanBoard, type BoardJob } from "./kanban-board";

export default async function BoardPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  const listed = await listJobs(userId);
  if (!listed.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-8">
        <h1 className="text-2xl font-semibold">Application board</h1>
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          Could not load applications. Please try again.
        </p>
      </main>
    );
  }

  const jobs: BoardJob[] = listed.jobs.map((job) => ({
    id: job.id,
    company: job.company,
    title: job.title,
    url: job.url,
    notes: job.notes,
    status: job.status,
    appliedAt: job.appliedAt.toISOString().slice(0, 10),
  }));

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Application board</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Track roles you have applied to. Cards stay on this account only.
        </p>
      </div>
      <KanbanBoard jobs={jobs} />
    </main>
  );
}
