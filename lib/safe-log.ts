export type LogLevel = "error" | "warn" | "info";

export type SafeLogEvent = {
  level: LogLevel;
  event: string;
  [key: string]: unknown;
};

export type SafeLogger = (event: SafeLogEvent) => void;

const SENSITIVE_KEY =
  /(?:^|_)(?:api_?key|token|secret|password|authorization|cookies?|set_cookie|bearer|job_?description|reply_?text|cv|session_?id)$/;

function normalizedLogKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(normalizedLogKey(key));
}

const ENV_SECRET_KEYS = ["TAILOR_API_KEY", "BETTER_AUTH_SECRET", "DATABASE_URL"] as const;
const MAX_DEPTH = 4;
const MAX_STRING = 300;
const MAX_ARRAY = 20;

function firstLine(value: string): string {
  return value.split(/\r?\n/, 1)[0] ?? "";
}

function truncate(value: string): string {
  if (value.length <= MAX_STRING) {
    return value;
  }
  return `${value.slice(0, MAX_STRING)}…`;
}

type LogEnv = Record<string, string | undefined>;

export function redactText(value: string, env: LogEnv = process.env): string {
  let out = value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  out = out.replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token redacted]");
  out = out.replace(/\b(?:Set-Cookie|Cookie):\s*[^\r\n]+/gi, (match) =>
    match.toLowerCase().startsWith("set-cookie") ? "Set-Cookie: [redacted]" : "Cookie: [redacted]"
  );

  const secrets = ENV_SECRET_KEYS.map((key) => ({ key, value: env[key] }))
    .filter((entry): entry is { key: (typeof ENV_SECRET_KEYS)[number]; value: string } =>
      Boolean(entry.value && entry.value.length >= 4)
    )
    .sort((a, b) => b.value.length - a.value.length);

  for (const secret of secrets) {
    out = out.split(secret.value).join(`[${secret.key} redacted]`);
  }
  return out;
}

export function safeErrorFields(
  error: unknown,
  env: LogEnv = process.env
): { errorName: string; errorMessage: string } {
  if (error instanceof Error) {
    return {
      errorName: error.name || "Error",
      errorMessage: redactText(firstLine(error.message), env),
    };
  }
  if (typeof error === "string") {
    return {
      errorName: "Error",
      errorMessage: redactText(firstLine(error), env),
    };
  }
  if (error && typeof error === "object") {
    const name =
      "name" in error && typeof error.name === "string" && error.name.trim()
        ? error.name
        : "Error";
    const message =
      "message" in error && typeof error.message === "string" ? error.message : "unknown";
    return {
      errorName: name,
      errorMessage: redactText(firstLine(message), env),
    };
  }
  return { errorName: "Error", errorMessage: "unknown" };
}

function sanitize(
  value: unknown,
  key: string | undefined,
  depth: number,
  env: LogEnv,
  seen: WeakSet<object>
): unknown {
  if (value == null || typeof value === "boolean") {
    return value;
  }
  if (key && isSensitiveKey(key)) {
    return "[redacted]";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return String(value);
  }
  if (typeof value === "string") {
    return truncate(redactText(value, env));
  }
  if (typeof value === "function") {
    return "[function]";
  }
  if (value instanceof Error) {
    const fields = safeErrorFields(value, env);
    return { name: fields.errorName, message: fields.errorMessage };
  }
  if (depth >= MAX_DEPTH) {
    return "[truncated]";
  }
  if (typeof value !== "object") {
    return String(value);
  }
  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY)
      .map((item) => sanitize(item, undefined, depth + 1, env, seen));
  }
  const out: Record<string, unknown> = {};
  for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
    out[entryKey] = sanitize(entryValue, entryKey, depth + 1, env, seen);
  }
  return out;
}

export function formatSafeLog(
  event: SafeLogEvent,
  now: Date = new Date(),
  env: LogEnv = process.env
): string {
  const { level, event: eventName, ...rest } = event;
  const payload: Record<string, unknown> = {
    ts: now.toISOString(),
    level,
    event: eventName,
  };
  const seen = new WeakSet<object>();
  for (const [key, value] of Object.entries(rest)) {
    payload[key] = sanitize(value, key, 0, env, seen);
  }
  return JSON.stringify(payload);
}

export function safeLog(event: SafeLogEvent): void {
  const line = formatSafeLog(event);
  if (event.level === "warn") {
    console.warn(line);
  } else if (event.level === "info") {
    console.info(line);
  } else {
    console.error(line);
  }
}
