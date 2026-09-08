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
};

const GENERIC_ERROR = "Tailor request failed. Please try again.";
const MISSING_ENV = "Tailor service is not configured.";
export const TRUSTED_CCC_CLIENT_IP = "127.0.0.1";

function clientSafeError(raw: unknown): string {
  if (typeof raw === "string" && raw.trim() && !/bearer|api[_-]?key|tailor_api/i.test(raw)) {
    return raw.trim();
  }
  return GENERIC_ERROR;
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
    });
  } catch {
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
      error: clientSafeError(record.error),
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
