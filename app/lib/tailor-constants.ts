export const GENERIC_ERROR = "Tailor request failed. Please try again.";
export const MISSING_ENV = "Tailor service is not configured.";
export const TIMEOUT_ERROR = "Tailor request timed out. Please try again.";
export const BODY_TOO_LARGE = "Request body too large.";
export const INVALID_JSON = "Invalid JSON.";

/** CCC LLM calls routinely exceed 30s; keep this above typical tailor latency. */
export const DEFAULT_CCC_FETCH_TIMEOUT_MS = 120_000;

/**
 * Browser deadline must exceed the server CCC fetch timeout so a 504 can arrive.
 * Keep `CCC_FETCH_TIMEOUT_MS` below this value.
 */
export const CLIENT_FETCH_TIMEOUT_MS = 180_000;

/** UTF-8 worst case for JD_MAX_CHARS plus JSON envelope. */
export const BODY_MAX_BYTES = 256 * 1024;

export const OPERATOR_TOKEN_HEADER = "x-operator-token";
export const OPERATOR_TOKEN_STORAGE_KEY = "ccc-operator-token";

/** CCC tailor-cv rejects requests with no parseable client IP. */
export const TRUSTED_CCC_CLIENT_IP = "127.0.0.1";
