import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";

export default async function BoardPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Application board</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Your pipeline will load here once jobs are available.
      </p>
    </main>
  );
}
