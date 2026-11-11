import { revalidatePath } from "next/cache";
import { requireSessionUserId } from "./session";

type JobActionResult = { ok: true } | { ok: false; error: string };

export async function runJobAction(
  run: (userId: string) => Promise<JobActionResult>,
  deps: {
    requireUserId?: () => Promise<string>;
    revalidate?: () => void;
  } = {}
): Promise<{ error?: string } | undefined> {
  const userId = await (deps.requireUserId ?? requireSessionUserId)();
  try {
    const result = await run(userId);
    if (!result.ok) {
      return { error: result.error };
    }
    (deps.revalidate ?? (() => revalidatePath("/board")))();
    return;
  } catch {
    return { error: "Could not save. Please try again." };
  }
}
