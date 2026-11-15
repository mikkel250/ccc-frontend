import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  consumeRateLimit,
  createMemoryStore,
  isRateLimitUnavailable,
  jobsRateLimitConfig,
  resolveAllowProcessLocalRateLimit,
  tailorRateLimitConfig,
} from "../lib/rate-limit";
import { register } from "../instrumentation";

describe("consumeRateLimit", { concurrency: 1 }, () => {
  it("allows distinct keys independently and denies after max in the window", () => {
    const store = createMemoryStore();
    const config = { max: 2, windowMs: 60_000 };
    const now = 1_700_000_000_000;

    assert.equal(consumeRateLimit("tailor:user-a", config, { store, now }).ok, true);
    assert.equal(consumeRateLimit("tailor:user-a", config, { store, now }).ok, true);
    const denied = consumeRateLimit("tailor:user-a", config, { store, now });
    assert.equal(denied.ok, false);
    if (!denied.ok && !("unavailable" in denied)) {
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

  it("falls back to defaults when JOB_RATE_LIMIT_MAX is invalid", () => {
    const keys = ["JOB_RATE_LIMIT_MAX", "RATE_LIMIT_WINDOW"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.JOB_RATE_LIMIT_MAX = "-1";
      process.env.RATE_LIMIT_WINDOW = "";
      const config = jobsRateLimitConfig();
      assert.equal(config.max, 30);
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

  it("fails closed without a quota delay when process-local storage is disabled", () => {
    const config = { max: 1, windowMs: 60_000 };
    const denied = consumeRateLimit("tailor:user-a", config, { allowProcessLocal: false });
    assert.equal(denied.ok, false);
    assert.equal("unavailable" in denied && denied.unavailable, true);
    assert.equal("retryAfterSeconds" in denied, false);
  });

  it("reads NODE_ENV and RATE_LIMIT_ALLOW_PROCESS_LOCAL when no override is passed", () => {
    const config = { max: 1, windowMs: 60_000 };
    const env = process.env as Record<string, string | undefined>;
    const previousNode = env.NODE_ENV;
    const previousFlag = env.RATE_LIMIT_ALLOW_PROCESS_LOCAL;
    const key = `env-limit-${process.hrtime.bigint()}`;
    try {
      env.NODE_ENV = "production";
      delete env.RATE_LIMIT_ALLOW_PROCESS_LOCAL;
      const unset = consumeRateLimit(key, config);
      assert.equal(unset.ok, false);
      assert.equal("unavailable" in unset && unset.unavailable, true);

      env.RATE_LIMIT_ALLOW_PROCESS_LOCAL = "TRUE";
      const wrongCase = consumeRateLimit(`${key}-case`, config);
      assert.equal(wrongCase.ok, false);
      assert.equal("unavailable" in wrongCase && wrongCase.unavailable, true);

      env.RATE_LIMIT_ALLOW_PROCESS_LOCAL = "true";
      assert.equal(consumeRateLimit(`${key}-allow`, config).ok, true);

      env.NODE_ENV = "test";
      delete env.RATE_LIMIT_ALLOW_PROCESS_LOCAL;
      assert.equal(consumeRateLimit(`${key}-dev`, config).ok, true);
    } finally {
      if (previousNode === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = previousNode;
      }
      if (previousFlag === undefined) {
        delete env.RATE_LIMIT_ALLOW_PROCESS_LOCAL;
      } else {
        env.RATE_LIMIT_ALLOW_PROCESS_LOCAL = previousFlag;
      }
    }
  });

  it("requires an explicit true or false process-local flag in production", () => {
    assert.throws(
      () => resolveAllowProcessLocalRateLimit({ NODE_ENV: "production" }),
      /RATE_LIMIT_ALLOW_PROCESS_LOCAL must be "true" or "false" when NODE_ENV is production/
    );
    assert.throws(
      () =>
        resolveAllowProcessLocalRateLimit({
          NODE_ENV: "production",
          RATE_LIMIT_ALLOW_PROCESS_LOCAL: "TRUE",
        }),
      /RATE_LIMIT_ALLOW_PROCESS_LOCAL must be "true" or "false" when NODE_ENV is production/
    );
    assert.equal(
      resolveAllowProcessLocalRateLimit({
        NODE_ENV: "production",
        RATE_LIMIT_ALLOW_PROCESS_LOCAL: "true",
      }),
      true
    );
    assert.equal(
      resolveAllowProcessLocalRateLimit({
        NODE_ENV: "production",
        RATE_LIMIT_ALLOW_PROCESS_LOCAL: " false ",
      }),
      false
    );
    assert.equal(resolveAllowProcessLocalRateLimit({ NODE_ENV: "test" }), true);
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

describe("isRateLimitUnavailable", () => {
  it("is only true for the unavailable branch of RateLimitResult", () => {
    assert.equal(isRateLimitUnavailable({ ok: true }), false);
    assert.equal(isRateLimitUnavailable({ ok: false, retryAfterSeconds: 42 }), false);
    assert.equal(isRateLimitUnavailable({ ok: false, unavailable: true }), true);
  });
});

describe("production rate-limit startup", { concurrency: 1 }, () => {
  it("refuses to start when production config is missing and skips the check during build", async () => {
    const env = process.env as Record<string, string | undefined>;
    const previousNode = env.NODE_ENV;
    const previousFlag = env.RATE_LIMIT_ALLOW_PROCESS_LOCAL;
    const previousPhase = env.NEXT_PHASE;
    try {
      env.NODE_ENV = "production";
      delete env.RATE_LIMIT_ALLOW_PROCESS_LOCAL;
      delete env.NEXT_PHASE;
      await assert.rejects(
        register(),
        /RATE_LIMIT_ALLOW_PROCESS_LOCAL must be "true" or "false" when NODE_ENV is production/
      );

      env.NEXT_PHASE = "phase-production-build";
      await register();

      delete env.NEXT_PHASE;
      env.RATE_LIMIT_ALLOW_PROCESS_LOCAL = "false";
      await register();
    } finally {
      if (previousNode === undefined) {
        delete env.NODE_ENV;
      } else {
        env.NODE_ENV = previousNode;
      }
      if (previousFlag === undefined) {
        delete env.RATE_LIMIT_ALLOW_PROCESS_LOCAL;
      } else {
        env.RATE_LIMIT_ALLOW_PROCESS_LOCAL = previousFlag;
      }
      if (previousPhase === undefined) {
        delete env.NEXT_PHASE;
      } else {
        env.NEXT_PHASE = previousPhase;
      }
    }
  });
});
