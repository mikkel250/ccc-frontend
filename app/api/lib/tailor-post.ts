import { NextResponse } from "next/server";
import { JD_MAX_CHARS, tailorOnDemand, type TailorDeps, type TailorResult } from "./ccc-tailor";
import { readTailorJobDescription } from "./read-json-body";
import { getSessionUserId } from "@/lib/session";
import {
  consumeRateLimit,
  RATE_LIMIT_ERROR,
  tailorRateLimitConfig,
  type RateLimitResult,
} from "@/lib/rate-limit";

export type TailorPostDeps = {
  getSessionUserId?: () => Promise<string | null>;
  tailor?: (jobDescription: string, deps?: TailorDeps) => Promise<TailorResult>;
  consume?: (key: string) => RateLimitResult;
};

export async function handleTailorPost(
  request: Request,
  deps: TailorPostDeps = {}
) {
  const userId = await (deps.getSessionUserId ?? getSessionUserId)();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = await readTailorJobDescription(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const jd = parsed.jobDescription.trim();
  if (!jd) {
    return NextResponse.json({ error: "Job description is required." }, { status: 400 });
  }
  if (jd.length > JD_MAX_CHARS) {
    return NextResponse.json(
      { error: `Job description must be at most ${JD_MAX_CHARS} characters.` },
      { status: 400 }
    );
  }

  const consume =
    deps.consume ?? ((key: string) => consumeRateLimit(key, tailorRateLimitConfig()));
  const limited = consume(`tailor:${userId}`);
  if (!limited.ok) {
    return NextResponse.json(
      { error: RATE_LIMIT_ERROR },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSeconds) },
      }
    );
  }

  const result = await (deps.tailor ?? tailorOnDemand)(jd, {
    sessionId: userId,
  });
  if (!result.ok) {
    const status = result.status === 401 || result.status === 403 ? 502 : result.status;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ cv: result.cv, replyText: result.replyText });
}
