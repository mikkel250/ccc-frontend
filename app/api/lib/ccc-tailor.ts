import {
  DEFAULT_CCC_FETCH_TIMEOUT_MS,
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
};

export type TailorResult = TailorSuccess | TailorFailure;

export type TailorDeps = {
  fetchImpl?: typeof fetch;
  apiUrl?: string | undefined;
  apiKey?: string | undefined;
  clientIp?: string | undefined;
  timeoutMs?: number | undefined;
};

const SECRET_SUBSTRING_LEN = 8;

function resolveTimeoutMs(deps: TailorDeps): number {
  if (typeof deps.timeoutMs === "number" && Number.isFinite(deps.timeoutMs) && deps.timeoutMs > 0) {
    return deps.timeoutMs;
  }
  const fromEnv = Number(process.env.CCC_FETCH_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }
  return DEFAULT_CCC_FETCH_TIMEOUT_MS;
}

function errorContainsSecret(raw: string, secret: string | undefined): boolean {
  if (!secret) {
    return false;
  }
  if (raw.includes(secret)) {
    return true;
  }
  if (secret.length < SECRET_SUBSTRING_LEN) {
    return false;
  }
  for (let i = 0; i <= secret.length - SECRET_SUBSTRING_LEN; i++) {
    if (raw.includes(secret.slice(i, i + SECRET_SUBSTRING_LEN))) {
      return true;
    }
  }
  return false;
}

export function clientSafeError(raw: unknown, apiKey?: string): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return GENERIC_ERROR;
  }
  const trimmed = raw.trim();
  if (errorContainsSecret(trimmed, apiKey) || /bearer|api[_-]?key|tailor_api/i.test(trimmed)) {
    return GENERIC_ERROR;
  }
  return trimmed;
}

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
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
  const clientIp = deps.clientIp?.trim() || TRUSTED_CCC_CLIENT_IP;
  let response: Response;
  try {
    response = await fetchImpl(`${apiUrl}/api/tailor-cv`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "x-forwarded-for": clientIp,
      },
      body: JSON.stringify({
        jobDescription: jd,
        curationMode: "strict",
      }),
      signal: AbortSignal.timeout(resolveTimeoutMs(deps)),
    });
  } catch (error) {
    if (isAbortError(error)) {
      return { ok: false, status: 504, error: GENERIC_ERROR };
    }
    return { ok: false, status: 503, error: GENERIC_ERROR };
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: clientSafeError(record.error, apiKey),
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
