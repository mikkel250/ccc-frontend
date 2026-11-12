import { revalidatePath } from "next/cache";
import { requireSessionUserId } from "./session";
import {
  consumeRateLimit,
  jobsRateLimitConfig,
  RATE_LIMIT_ERROR,
  type RateLimitResult,
} from "./rate-limit";

type JobActionResult = { ok: true } | { ok: false; error: string };

export type JobActionRunDeps = {
  requireUserId?: () => Promise<string>;
  revalidate?: () => void;
  consume?: (key: string) => RateLimitResult;
};

export async function runJobAction(
  run: (userId: string) => Promise<JobActionResult>,
  deps: JobActionRunDeps = {}
): Promise<{ error?: string } | undefined> {
  const userId = await (deps.requireUserId ?? requireSessionUserId)();
  const consume =
    deps.consume ?? ((key: string) => consumeRateLimit(key, jobsRateLimitConfig()));
  const limited = consume(`jobs:${userId}`);
  if (!limited.ok) {
    return { error: RATE_LIMIT_ERROR };
  }
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
