import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  consumeRateLimit,
  createMemoryStore,
  tailorRateLimitConfig,
} from "../lib/rate-limit";

describe("consumeRateLimit", () => {
  it("allows distinct keys independently and denies after max in the window", () => {
    const store = createMemoryStore();
    const config = { max: 2, windowMs: 60_000 };
    const now = 1_700_000_000_000;

    assert.equal(consumeRateLimit("tailor:user-a", config, { store, now }).ok, true);
    assert.equal(consumeRateLimit("tailor:user-a", config, { store, now }).ok, true);
    const denied = consumeRateLimit("tailor:user-a", config, { store, now });
    assert.equal(denied.ok, false);
    if (!denied.ok) {
      assert.equal(denied.retryAfterSeconds, 60);
    }
    assert.equal(consumeRateLimit("tailor:user-b", config, { store, now }).ok, true);
  });

  it("allows the same key again after the window", () => {
    const store = createMemoryStore();
    const config = { max: 1, windowMs: 1_000 };
    const now = 1_000;

    assert.equal(consumeRateLimit("jobs:user-a", config, { store, now }).ok, true);
    assert.equal(consumeRateLimit("jobs:user-a", config, { store, now }).ok, false);
    assert.equal(consumeRateLimit("jobs:user-a", config, { store, now: now + 1_000 }).ok, true);
  });

  it("falls back to defaults when RATE_LIMIT_MAX is invalid", () => {
    const keys = ["RATE_LIMIT_MAX", "RATE_LIMIT_WINDOW"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.RATE_LIMIT_MAX = "0";
      process.env.RATE_LIMIT_WINDOW = "not-a-number";
      const config = tailorRateLimitConfig();
      assert.equal(config.max, 5);
      assert.equal(config.windowMs, 60_000);
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("rejects a blank key without consuming", () => {
    const store = createMemoryStore();
    const config = { max: 1, windowMs: 60_000 };
    const now = 1_000;

    const denied = consumeRateLimit("  ", config, { store, now });
    assert.equal(denied.ok, false);
    assert.equal(consumeRateLimit("tailor:user-a", config, { store, now }).ok, true);
  });
});
