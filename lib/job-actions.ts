import { revalidatePath } from "next/cache";
import { requireSessionUserId } from "./session";
import {
  consumeRateLimit,
  isRateLimitUnavailable,
  jobsRateLimitConfig,
  RATE_LIMIT_ERROR,
  RATE_LIMIT_UNAVAILABLE_ERROR,
  type RateLimitResult,
} from "./rate-limit";
import { safeErrorFields, safeLog, type SafeLogger } from "./safe-log";

type JobActionResult = { ok: true } | { ok: false; error: string };

export type JobActionRunDeps = {
  requireUserId?: () => Promise<string>;
  revalidate?: () => void;
  consume?: (key: string) => RateLimitResult;
  log?: SafeLogger;
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
    if (isRateLimitUnavailable(limited)) {
      return { error: RATE_LIMIT_UNAVAILABLE_ERROR };
    }
    return { error: RATE_LIMIT_ERROR };
  }
  try {
    const result = await run(userId);
    if (!result.ok) {
      return { error: result.error };
    }
    (deps.revalidate ?? (() => revalidatePath("/board")))();
    return;
  } catch (error) {
    (deps.log ?? safeLog)({
      level: "error",
      event: "jobs.action_failed",
      ...safeErrorFields(error),
    });
    return { error: "Could not save. Please try again." };
  }
}
