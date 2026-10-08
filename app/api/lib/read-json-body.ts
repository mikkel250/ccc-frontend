import {
  BODY_MAX_BYTES,
  BODY_READ_TIMEOUT,
  BODY_READ_TIMEOUT_MS,
  BODY_TOO_LARGE,
  INVALID_JSON,
} from "../../lib/tailor-constants";

export type JsonBodyResult =
  | { ok: true; jobDescription: string }
  | { ok: false; status: number; error: string };

type CappedText =
  | { ok: true; text: string }
  | { ok: false; tooLarge: true }
  | { ok: false; tooLarge: false; timedOut: boolean };

function bodyTimeoutError(): Error {
  const error = new Error(BODY_READ_TIMEOUT);
  error.name = "TimeoutError";
  return error;
}

function isBodyTimeout(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "name" in error && error.name === "TimeoutError"
  );
}

function bodyDeadline(timeoutMs: number): { promise: Promise<never>; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(bodyTimeoutError()), timeoutMs);
  });
  void promise.catch(() => undefined);
  return {
    promise,
    clear() {
      clearTimeout(timer);
    },
  };
}

function contentLengthTooLarge(request: Request, maxBytes: number): boolean {
  const header = request.headers.get("content-length");
  if (header === null) {
    return false;
  }
  const length = Number(header);
  return Number.isFinite(length) && length > maxBytes;
}

async function readTextCapped(
  request: Request,
  maxBytes: number,
  timeoutMs: number
): Promise<CappedText> {
  if (contentLengthTooLarge(request, maxBytes)) {
    return { ok: false, tooLarge: true };
  }

  const deadline = bodyDeadline(timeoutMs);
  try {
    const reader = request.body?.getReader();
    if (!reader) {
      const pending = request.text();
      try {
        const text = await Promise.race([pending, deadline.promise]);
        if (Buffer.byteLength(text, "utf8") > maxBytes) {
          return { ok: false, tooLarge: true };
        }
        return { ok: true, text };
      } catch (error) {
        void pending.catch(() => undefined);
        return { ok: false, tooLarge: false, timedOut: isBodyTimeout(error) };
      }
    }

    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const pending = reader.read();
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await Promise.race([pending, deadline.promise]);
        } catch (error) {
          void pending.catch(() => undefined);
          await reader.cancel().catch(() => undefined);
          return { ok: false, tooLarge: false, timedOut: isBodyTimeout(error) };
        }
        const { done, value } = chunk;
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
      await reader.cancel().catch(() => undefined);
      return { ok: false, tooLarge: false, timedOut: false };
    }

    return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
  } finally {
    deadline.clear();
  }
}

export async function readTailorJobDescription(
  request: Request,
  maxBytes: number = BODY_MAX_BYTES,
  bodyReadTimeoutMs: number = BODY_READ_TIMEOUT_MS
): Promise<JsonBodyResult> {
  const capped = await readTextCapped(request, maxBytes, bodyReadTimeoutMs);
  if (!capped.ok) {
    if (capped.tooLarge) {
      return { ok: false, status: 413, error: BODY_TOO_LARGE };
    }
    if (capped.timedOut) {
      return { ok: false, status: 408, error: BODY_READ_TIMEOUT };
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
