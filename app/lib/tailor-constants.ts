export const GENERIC_ERROR = "Tailor request failed. Please try again.";
export const MISSING_ENV = "Tailor service is not configured.";
export const TIMEOUT_ERROR = "Tailor request timed out. Please try again.";
export const BODY_TOO_LARGE = "Request body too large.";
export const INVALID_JSON = "Invalid JSON.";

/** CCC LLM calls routinely exceed 30s; keep this above typical tailor latency. */
export const DEFAULT_CCC_FETCH_TIMEOUT_MS = 120_000;

/**
 * Must match `export const maxDuration` in `app/api/tailor/route.ts`.
 * Next.js only applies a numeric literal, so the route cannot import this.
 */
export const TAILOR_MAX_DURATION_SEC = 130;

/** Leave time for the route to write a 504 before the platform deadline. */
const CCC_FETCH_TIMEOUT_HEADROOM_MS = 5_000;

/** Upper bound for `CCC_FETCH_TIMEOUT_MS`. Values above this are clamped. */
export const MAX_CCC_FETCH_TIMEOUT_MS =
  TAILOR_MAX_DURATION_SEC * 1000 - CCC_FETCH_TIMEOUT_HEADROOM_MS;

/**
 * Browser deadline must exceed the server CCC fetch timeout so a 504 can arrive.
 * Keep `CCC_FETCH_TIMEOUT_MS` at or below `MAX_CCC_FETCH_TIMEOUT_MS`.
 */
export const CLIENT_FETCH_TIMEOUT_MS = 180_000;

export function cccFetchTimeoutMs(raw: number | undefined): number {
  const fallback = Math.min(DEFAULT_CCC_FETCH_TIMEOUT_MS, MAX_CCC_FETCH_TIMEOUT_MS);
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }
  return Math.min(raw, MAX_CCC_FETCH_TIMEOUT_MS);
}

/** UTF-8 worst case for JD_MAX_CHARS plus JSON envelope. */
export const BODY_MAX_BYTES = 256 * 1024;

/** CCC tailor-cv rejects requests with no parseable client IP. */
export const TRUSTED_CCC_CLIENT_IP = "127.0.0.1";
