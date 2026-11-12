export const RATE_LIMIT_ERROR = "Too many requests. Please wait before trying again.";

export type RateLimitSuccess = { ok: true };

export type RateLimitFailure = {
  ok: false;
  retryAfterSeconds: number;
};

export type RateLimitResult = RateLimitSuccess | RateLimitFailure;

export type RateLimitConfig = {
  max: number;
  windowMs: number;
};

export type RateLimitStore = {
  hits: Map<string, number[]>;
};

export type ConsumeDeps = {
  store?: RateLimitStore;
  now?: number;
};

const DEFAULT_TAILOR_MAX = 5;
const DEFAULT_JOBS_MAX = 30;
const DEFAULT_WINDOW_MS = 60_000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null || raw.trim() === "") {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

export function createMemoryStore(): RateLimitStore {
  return { hits: new Map() };
}

// Process-local best-effort window. Not shared across instances; resets on restart.
const defaultStore = createMemoryStore();

export function tailorRateLimitConfig(): RateLimitConfig {
  return {
    max: envInt("RATE_LIMIT_MAX", DEFAULT_TAILOR_MAX),
    windowMs: envInt("RATE_LIMIT_WINDOW", DEFAULT_WINDOW_MS),
  };
}

export function jobsRateLimitConfig(): RateLimitConfig {
  return {
    max: envInt("JOB_RATE_LIMIT_MAX", DEFAULT_JOBS_MAX),
    windowMs: envInt("RATE_LIMIT_WINDOW", DEFAULT_WINDOW_MS),
  };
}

export function consumeRateLimit(
  key: string,
  config: RateLimitConfig,
  deps: ConsumeDeps = {}
): RateLimitResult {
  const trimmed = key.trim();
  if (!trimmed) {
    return { ok: false, retryAfterSeconds: 0 };
  }

  const store = deps.store ?? defaultStore;
  const now = deps.now ?? Date.now();
  const windowStart = now - config.windowMs;
  const timestamps = (store.hits.get(trimmed) ?? []).filter((stamp) => stamp > windowStart);

  if (timestamps.length >= config.max) {
    const oldest = timestamps[0] ?? now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + config.windowMs - now) / 1000));
    store.hits.set(trimmed, timestamps);
    return { ok: false, retryAfterSeconds };
  }

  timestamps.push(now);
  store.hits.set(trimmed, timestamps);
  return { ok: true };
}
