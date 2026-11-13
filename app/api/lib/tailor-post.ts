import { NextResponse } from "next/server";
import { JD_MAX_CHARS, tailorOnDemand, type TailorDeps, type TailorResult } from "./ccc-tailor";
import { readTailorJobDescription } from "./read-json-body";
import { GENERIC_ERROR } from "../../lib/tailor-constants";
import { getSessionUserId } from "@/lib/session";
import {
  consumeRateLimit,
  RATE_LIMIT_ERROR,
  tailorRateLimitConfig,
  type RateLimitResult,
} from "@/lib/rate-limit";
import { safeErrorFields, safeLog, type SafeLogger } from "@/lib/safe-log";

export type TailorPostDeps = {
  getSessionUserId?: () => Promise<string | null>;
  tailor?: (jobDescription: string, deps?: TailorDeps) => Promise<TailorResult>;
  consume?: (key: string) => RateLimitResult;
  log?: SafeLogger;
};

export async function handleTailorPost(
  request: Request,
  deps: TailorPostDeps = {}
) {
  const log = deps.log ?? safeLog;
  try {
    return await handleTailorPostInner(request, deps);
  } catch (error) {
    log({
      level: "error",
      event: "tailor.unhandled",
      ...safeErrorFields(error),
    });
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
}

async function handleTailorPostInner(request: Request, deps: TailorPostDeps) {
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
    const headers: HeadersInit = {};
    if (
      status === 429 &&
      result.retryAfterSeconds != null &&
      result.retryAfterSeconds >= 1
    ) {
      headers["Retry-After"] = String(result.retryAfterSeconds);
    }
    return NextResponse.json(
      { error: result.error },
      { status, headers: Object.keys(headers).length > 0 ? headers : undefined }
    );
  }
  return NextResponse.json({ cv: result.cv, replyText: result.replyText });
}
