import { listJobs, toBoardJob } from "@/lib/jobs";
import { requireSessionUserId } from "@/lib/session";
import { KanbanBoard } from "./kanban-board";

export default async function BoardPage() {
  const userId = await requireSessionUserId();
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

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Application board</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Track roles you have applied to. Cards stay on this account only.
        </p>
      </div>
      <KanbanBoard jobs={listed.jobs.map(toBoardJob)} />
    </main>
  );
}
