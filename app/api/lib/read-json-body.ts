import { BODY_MAX_BYTES, BODY_TOO_LARGE, INVALID_JSON } from "../../lib/tailor-constants";

export type JsonBodyResult =
  | { ok: true; jobDescription: string }
  | { ok: false; status: number; error: string };

type CappedText =
  | { ok: true; text: string }
  | { ok: false; tooLarge: true }
  | { ok: false; tooLarge: false };

function contentLengthTooLarge(request: Request, maxBytes: number): boolean {
  const header = request.headers.get("content-length");
  if (header === null) {
    return false;
  }
  const length = Number(header);
  return Number.isFinite(length) && length > maxBytes;
}

async function readTextCapped(request: Request, maxBytes: number): Promise<CappedText> {
  if (contentLengthTooLarge(request, maxBytes)) {
    return { ok: false, tooLarge: true };
  }

  const reader = request.body?.getReader();
  if (!reader) {
    try {
      const text = await request.text();
      if (Buffer.byteLength(text, "utf8") > maxBytes) {
        return { ok: false, tooLarge: true };
      }
      return { ok: true, text };
    } catch {
      return { ok: false, tooLarge: false };
    }
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value?.byteLength) {
        continue;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, tooLarge: true };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, tooLarge: false };
  }

  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

export async function readTailorJobDescription(
  request: Request,
  maxBytes: number = BODY_MAX_BYTES
): Promise<JsonBodyResult> {
  const capped = await readTextCapped(request, maxBytes);
  if (!capped.ok) {
    if (capped.tooLarge) {
      return { ok: false, status: 413, error: BODY_TOO_LARGE };
    }
    return { ok: false, status: 400, error: INVALID_JSON };
  }

  let body: unknown;
  try {
    body = capped.text ? JSON.parse(capped.text) : null;
  } catch {
    return { ok: false, status: 400, error: INVALID_JSON };
  }

  let jobDescription = "";
  if (body && typeof body === "object" && "jobDescription" in body) {
    const value = (body as { jobDescription: unknown }).jobDescription;
    if (typeof value === "string") {
      jobDescription = value;
    }
  }
  return { ok: true, jobDescription };
}
