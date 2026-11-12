import {
  cccFetchTimeoutMs,
  GENERIC_ERROR,
  MISSING_ENV,
  TRUSTED_CCC_CLIENT_IP,
} from "../../lib/tailor-constants";

export const JD_MAX_CHARS = 50_000;

export type TailorSuccess = {
  ok: true;
  cv: string;
  replyText: string | null;
};

export type TailorFailure = {
  ok: false;
  status: number;
  error: string;
  retryAfterSeconds?: number;
};

export type TailorResult = TailorSuccess | TailorFailure;

export type TailorDeps = {
  fetchImpl?: typeof fetch;
  apiUrl?: string | undefined;
  apiKey?: string | undefined;
  timeoutMs?: number | undefined;
  sessionId?: string | undefined;
};

const SAFE_CCC_ERRORS = new Set([
  "AI service error. Please try again.",
  "Cannot determine client IP",
  "Curator output failed schema validation",
  "Curator output missing curated_cv in flexible wrapper",
  "Curator output missing curated_cv in strict wrapper",
  "Curator output missing reply_text",
  "Curator output was not valid JSON",
  "Curator prompt misconfigured",
  "Failed to render CV document",
  "Internal server error. Please try again later.",
  "Invalid JSON in request body",
  "Invalid request body",
  "Master CV configuration is invalid",
  "Master CV configuration is unavailable",
  "Method not allowed. Use POST.",
  "Rate limit exceeded",
  "Rate limit service unavailable",
  "Request body must be an object",
  "Request body too large",
  "Service unavailable",
  "Tailor response exceeds configured size limit",
  "Too many requests. Please wait before trying again.",
  "Unauthorized",
  "jobDescription exceeds configured size limit.",
  "jobDescription is required.",
  "jobDescription must be a non-empty string.",
]);

export function resolveCccFetchTimeoutMs(
  deps: Pick<TailorDeps, "timeoutMs"> = {},
  env?: { CCC_FETCH_TIMEOUT_MS?: string }
): number {
  if (typeof deps.timeoutMs === "number" && Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0) {
    return cccFetchTimeoutMs(deps.timeoutMs);
  }
  const fromEnv = Number((env ?? process.env).CCC_FETCH_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return cccFetchTimeoutMs(fromEnv);
  }
  return cccFetchTimeoutMs(undefined);
}

/** Never forward upstream text that is not an exact CCC error string. */
export function clientSafeError(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return GENERIC_ERROR;
  }
  const trimmed = raw.trim();
  if (!SAFE_CCC_ERRORS.has(trimmed)) {
    return GENERIC_ERROR;
  }
  return trimmed;
}

function isTimeoutOrAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("name" in error)) {
    return false;
  }
  return error.name === "TimeoutError" || error.name === "AbortError";
}

export function resolveCccRetryAfterSeconds(
  response: Response,
  record: Record<string, unknown>,
  now: number = Date.now()
): number | undefined {
  if (response.status !== 429) {
    return undefined;
  }
  const header = response.headers.get("Retry-After");
  if (header != null) {
    const delaySeconds = Number.parseInt(header, 10);
    if (Number.isFinite(delaySeconds) && delaySeconds >= 1) {
      return delaySeconds;
    }
  }
  const resetTime = record.resetTime;
  if (typeof resetTime === "number" && Number.isFinite(resetTime)) {
    return Math.max(1, Math.ceil((resetTime - now) / 1000));
  }
  return undefined;
}

export async function tailorOnDemand(
  jobDescription: string,
  deps: TailorDeps = {}
): Promise<TailorResult> {
  const jd = jobDescription.trim();
  if (!jd) {
    return { ok: false, status: 400, error: "Job description is required." };
  }
  if (jd.length > JD_MAX_CHARS) {
    return {
      ok: false,
      status: 400,
      error: `Job description must be at most ${JD_MAX_CHARS} characters.`,
    };
  }

  const apiUrl = (deps.apiUrl ?? process.env.CCC_API_URL)?.replace(/\/$/, "");
  const apiKey = deps.apiKey ?? process.env.TAILOR_API_KEY;
  if (!apiUrl || !apiKey) {
    return { ok: false, status: 503, error: MISSING_ENV };
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/api/tailor-cv`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-forwarded-for": TRUSTED_CCC_CLIENT_IP,
      },
      body: JSON.stringify({
        jobDescription: jd,
        curationMode: "strict",
        ...(deps.sessionId?.trim() ? { sessionId: deps.sessionId.trim() } : {}),
      }),
      signal: AbortSignal.timeout(resolveCccFetchTimeoutMs(deps)),
    });
  } catch (error) {
    if (isTimeoutOrAbortError(error)) {
      return { ok: false, status: 504, error: GENERIC_ERROR };
    }
    return { ok: false, status: 503, error: GENERIC_ERROR };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch (error) {
    if (isTimeoutOrAbortError(error)) {
      return { ok: false, status: 504, error: GENERIC_ERROR };
    }
    body = null;
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!response.ok) {
    const retryAfterSeconds = resolveCccRetryAfterSeconds(response, record);
    return {
      ok: false,
      status: response.status,
      error: clientSafeError(record.error),
      ...(retryAfterSeconds != null ? { retryAfterSeconds } : {}),
    };
  }

  const cv = record.cv;
  if (typeof cv !== "string" || !cv.trim()) {
    return { ok: false, status: 502, error: GENERIC_ERROR };
  }

  const replyRaw = record.replyText;
  const replyText =
    typeof replyRaw === "string" && replyRaw.trim() ? replyRaw.trim() : null;

  return { ok: true, cv: cv.trim(), replyText };
}
