export const GENERIC_ERROR = "Tailor request failed. Please try again.";
export const MISSING_ENV = "Tailor service is not configured.";
export const TIMEOUT_ERROR = "Tailor request timed out. Please try again.";
export const BODY_TOO_LARGE = "Request body too large.";
export const INVALID_JSON = "Invalid JSON.";

/**
 * Seconds. Must stay in sync with `export const maxDuration` in
 * `app/api/tailor/route.ts` (Next.js requires a statically analyzable literal).
 */
export const TAILOR_ROUTE_MAX_DURATION_SECONDS = 130;

/** Headroom for auth, body parse, and writing a 504 before the platform kills the route. */
export const CCC_FETCH_TIMEOUT_HEADROOM_MS = 10_000;

/**
 * Upper bound for `CCC_FETCH_TIMEOUT_MS`. Must stay strictly below
 * `TAILOR_ROUTE_MAX_DURATION_SECONDS` so AbortSignal can return 504 first.
 */
export const MAX_CCC_FETCH_TIMEOUT_MS =
  TAILOR_ROUTE_MAX_DURATION_SECONDS * 1000 - CCC_FETCH_TIMEOUT_HEADROOM_MS;

/** CCC LLM calls routinely exceed 30s; keep this above typical tailor latency. */
export const DEFAULT_CCC_FETCH_TIMEOUT_MS = 120_000;

/**
 * Browser deadline must exceed the server CCC fetch timeout so a 504 can arrive.
 * Keep `CCC_FETCH_TIMEOUT_MS` at or below `MAX_CCC_FETCH_TIMEOUT_MS`.
 */
export const CLIENT_FETCH_TIMEOUT_MS = 180_000;

/** UTF-8 worst case for JD_MAX_CHARS plus JSON envelope. */
export const BODY_MAX_BYTES = 256 * 1024;

export const OPERATOR_TOKEN_HEADER = "x-operator-token";
export const OPERATOR_TOKEN_STORAGE_KEY = "ccc-operator-token";

/** CCC tailor-cv rejects requests with no parseable client IP. */
export const TRUSTED_CCC_CLIENT_IP = "127.0.0.1";
