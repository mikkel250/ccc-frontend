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

export function authorizeOperator(
  request: Request,
  env: NodeJS.ProcessEnv = process.env
): OperatorAuthResult {
  const expected = env.OPERATOR_TOKEN?.trim() ?? "";
  if (!expected) {
    if (env.NODE_ENV === "production") {
      return { ok: false, status: 503, error: MISSING_ENV };
    }
    return { ok: true };
  }

  const provided = request.headers.get(OPERATOR_TOKEN_HEADER) ?? "";
  if (!tokensMatch(provided, expected)) {
    return { ok: false, status: 401, error: GENERIC_ERROR };
  }
  return { ok: true };
}
