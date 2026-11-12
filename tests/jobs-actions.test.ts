import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createJobAction, moveJobAction, updateJobAction } from "../app/actions/jobs";
import type { JobRecord, JobStatus } from "../lib/jobs";
import { createMemoryStore } from "./memory-jobs-store";

const now = new Date("2026-09-01T12:00:00.000Z");

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
