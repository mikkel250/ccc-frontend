import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createJobAction, moveJobAction, updateJobAction } from "../app/actions/jobs";
import { runJobAction } from "../lib/job-actions";
import { formatSafeLog, type SafeLogEvent } from "../lib/safe-log";
import type { JobRecord, JobStatus } from "../lib/jobs";
import {
  consumeRateLimit,
  createMemoryStore as createRateLimitStore,
  jobsRateLimitConfig,
} from "../lib/rate-limit";
import { createMemoryStore } from "./memory-jobs-store";

const now = new Date("2026-09-01T12:00:00.000Z");
const tight = { max: 1, windowMs: 60_000 };

function seedJob(overrides: Partial<JobRecord> & Pick<JobRecord, "id" | "userId">): JobRecord {
  return {
    company: "Acme",
    title: "Engineer",
    url: "https://jobs.example/a",
    notes: "keep",
    status: "applied",
    position: 0,
    appliedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function depsFor(db: ReturnType<typeof createMemoryStore>) {
  return {
    db,
    requireUserId: async () => "user-a",
    revalidate() {},
  };
}

describe("job action form data", () => {
  it("stores missing and empty url and notes as null on create", async () => {
    const db = createMemoryStore();
    const missing = new FormData();
    missing.set("company", "Acme");
    missing.set("title", "Engineer");
    assert.equal(await createJobAction(missing, depsFor(db)), undefined);
    assert.equal(db.rows[0]?.url, null);
    assert.equal(db.rows[0]?.notes, null);

    const empty = new FormData();
    empty.set("company", "Beta");
    empty.set("title", "Designer");
    empty.set("url", "");
    empty.set("notes", "");
    assert.equal(await createJobAction(empty, depsFor(db)), undefined);
    assert.equal(db.rows[1]?.url, null);
    assert.equal(db.rows[1]?.notes, null);
  });

  it("rejects a non-string company and does not insert a row", async () => {
    const db = createMemoryStore();
    const form = new FormData();
    form.set("company", new File(["Acme"], "company.txt"));
    form.set("title", "Engineer");
    assert.deepEqual(await createJobAction(form, depsFor(db)), {
      error: "Check the company, title, URL, and notes.",
    });
    assert.equal(db.rows.length, 0);
  });

  it("clears url and notes only when those fields are present", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a" })]);
    const clear = new FormData();
    clear.set("id", "a1");
    clear.set("url", "");
    clear.set("notes", "");
    assert.equal(await updateJobAction(clear, depsFor(db)), undefined);
    assert.equal(db.rows[0]?.url, null);
    assert.equal(db.rows[0]?.notes, null);
    assert.equal(db.rows[0]?.company, "Acme");

    db.rows[0].url = "https://jobs.example/a";
    db.rows[0].notes = "keep";
    const omitted = new FormData();
    omitted.set("id", "a1");
    omitted.set("company", "Renamed");
    assert.equal(await updateJobAction(omitted, depsFor(db)), undefined);
    assert.equal(db.rows[0]?.company, "Renamed");
    assert.equal(db.rows[0]?.url, "https://jobs.example/a");
    assert.equal(db.rows[0]?.notes, "keep");
  });

  it("rejects an update that has no id", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a", title: "Keep me" })]);
    const form = new FormData();
    form.set("title", "Changed");
    assert.deepEqual(await updateJobAction(form, depsFor(db)), {
      error: "Job is required.",
    });
    assert.equal(db.rows[0]?.title, "Keep me");
  });

  it("moves a card to a known column and rejects an unknown status", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a" })]);
    assert.equal(await moveJobAction("a1", "interview", depsFor(db)), undefined);
    assert.equal(db.rows[0]?.status, "interview");
    assert.equal(db.rows[0]?.position, 0);

    const rejected = await moveJobAction("a1", "wishlist" as JobStatus, depsFor(db));
    assert.deepEqual(rejected, { error: "Choose a valid column." });
    assert.equal(db.rows[0]?.status, "interview");
  });
});

describe("runJobAction rate limit", () => {
  it("returns an error without running the DAL when the jobs bucket is exhausted", async () => {
    const store = createRateLimitStore();
    const consume = (key: string) => consumeRateLimit(key, tight, { store });
    let ran = 0;
    const first = await runJobAction(
      async () => {
        ran += 1;
        return { ok: true };
      },
      {
        requireUserId: async () => "user-a",
        consume,
        revalidate: () => {},
      }
    );
    assert.equal(first, undefined);
    const second = await runJobAction(
      async () => {
        ran += 1;
        return { ok: true };
      },
      {
        requireUserId: async () => "user-a",
        consume,
        revalidate: () => {},
      }
    );
    assert.deepEqual(second, {
      error: "Too many requests. Please wait before trying again.",
    });
    assert.equal(ran, 1);
  });

  it("does not share a jobs bucket across session user ids", async () => {
    const store = createRateLimitStore();
    const consume = (key: string) => consumeRateLimit(key, tight, { store });
    const depsForUser = (userId: string) => ({
      requireUserId: async () => userId,
      consume,
      revalidate: () => {},
    });
    await runJobAction(async () => ({ ok: true }), depsForUser("user-a"));
    const blocked = await runJobAction(async () => ({ ok: true }), depsForUser("user-a"));
    const other = await runJobAction(async () => ({ ok: true }), depsForUser("user-b"));
    assert.deepEqual(blocked, {
      error: "Too many requests. Please wait before trying again.",
    });
    assert.equal(other, undefined);
  });

  it("does not consume when the session lookup redirects", async () => {
    let consumed = 0;
    await assert.rejects(
      () =>
        runJobAction(
          async () => {
            throw new Error("should not run");
          },
          {
            requireUserId: async () => {
              throw new Error("redirect");
            },
            consume: () => {
              consumed += 1;
              return { ok: true };
            },
            revalidate: () => {},
          }
        ),
      /redirect/
    );
    assert.equal(consumed, 0);
  });

  it("uses JOB_RATE_LIMIT_MAX and the jobs: prefix when consume is not injected", async () => {
    const previousJobsMax = process.env.JOB_RATE_LIMIT_MAX;
    const previousTailorMax = process.env.RATE_LIMIT_MAX;
    const userId = `jobs-default-${process.hrtime.bigint()}`;
    const deps = {
      requireUserId: async () => userId,
      revalidate: () => {},
    };
    try {
      process.env.JOB_RATE_LIMIT_MAX = "1";
      process.env.RATE_LIMIT_MAX = "100";
      const first = await runJobAction(async () => ({ ok: true }), deps);
      assert.equal(first, undefined);
      const second = await runJobAction(async () => ({ ok: true }), deps);
      assert.deepEqual(second, {
        error: "Too many requests. Please wait before trying again.",
      });
      const prefixHit = consumeRateLimit(`jobs:${userId}`, jobsRateLimitConfig());
      assert.equal(prefixHit.ok, false);
    } finally {
      if (previousJobsMax === undefined) {
        delete process.env.JOB_RATE_LIMIT_MAX;
      } else {
        process.env.JOB_RATE_LIMIT_MAX = previousJobsMax;
      }
      if (previousTailorMax === undefined) {
        delete process.env.RATE_LIMIT_MAX;
      } else {
        process.env.RATE_LIMIT_MAX = previousTailorMax;
      }
    }
  });
});

describe("runJobAction unexpected failures", () => {
  it("returns a generic error and logs a secret-safe event when the action throws", async () => {
    const events: SafeLogEvent[] = [];
    const secret = "sk-live-job-action-secret";
    const result = await runJobAction(
      async () => {
        throw new Error(`Bearer ${secret}`);
      },
      {
        requireUserId: async () => "user-a",
        consume: () => ({ ok: true }),
        revalidate: () => {},
        log: (event) => events.push(event),
      }
    );
    assert.deepEqual(result, { error: "Could not save. Please try again." });
    assert.equal(events.length, 1);
    assert.equal(events[0]?.event, "jobs.action_failed");
    assert.equal(events[0]?.level, "error");
    const serialized = `${JSON.stringify(events)}\n${formatSafeLog(events[0]!)}`;
    assert.equal(serialized.includes(secret), false);
    assert.equal(serialized.includes("Bearer [redacted]"), true);
  });
});
