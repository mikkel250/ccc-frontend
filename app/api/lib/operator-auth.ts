import { timingSafeEqual } from "node:crypto";
import { GENERIC_ERROR, MISSING_ENV, OPERATOR_TOKEN_HEADER } from "../../lib/tailor-constants";

export type OperatorAuthResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Missing OPERATOR_TOKEN is allowed only for local `next dev` / `vercel dev`.
 * Preview, staging, production, CI, and `next start` must set the token.
 */
export function isLocalDevAuthBypass(env: NodeJS.ProcessEnv): boolean {
  if (env.NODE_ENV !== "development") {
    return false;
  }
  if (env.CI) {
    return false;
  }
  const vercelEnv = env.VERCEL_ENV?.trim();
  // Hosted Vercel sets VERCEL=1; preview/production also set VERCEL_ENV.
  // `vercel dev` is the exception: VERCEL_ENV=development.
  if (vercelEnv !== "development" && (vercelEnv || env.VERCEL)) {
    return false;
  }
  return true;
}

export function authorizeOperator(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): OperatorAuthResult {
  const expected = env.OPERATOR_TOKEN?.trim() ?? "";
  if (!expected) {
    if (isLocalDevAuthBypass(env)) {
      return { ok: true };
    }
    return { ok: false, status: 503, error: MISSING_ENV };
  }

  const provided = request.headers.get(OPERATOR_TOKEN_HEADER) ?? "";
  if (!tokensMatch(provided, expected)) {
    return { ok: false, status: 401, error: GENERIC_ERROR };
  }
  return { ok: true };
}
