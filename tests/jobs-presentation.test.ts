import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJob,
  isJobStatus,
  toBoardJob,
  type JobRecord,
} from "../lib/jobs";
import { createMemoryStore, seedJob } from "./jobs-test-helpers";

describe("isJobStatus", () => {
  it("accepts Kanban column ids", () => {
    assert.equal(isJobStatus("applied"), true);
    assert.equal(isJobStatus("interview"), true);
    assert.equal(isJobStatus("offer"), true);
    assert.equal(isJobStatus("rejected"), true);
  });

  it("rejects unknown column ids", () => {
    assert.equal(isJobStatus("wishlist"), false);
    assert.equal(isJobStatus(""), false);
  });
});

describe("toBoardJob", () => {
  it("serializes appliedAt as a UTC calendar date string", () => {
    const record: JobRecord = seedJob({
      id: "a1",
      userId: "user-a",
      appliedAt: new Date("2026-03-15T18:30:00.000Z"),
    });
    const board = toBoardJob(record);
    assert.equal(board.appliedAt, "2026-03-15");
    assert.equal(board.company, record.company);
    assert.equal(board.status, record.status);
  });
});

describe("job input validation", () => {
  it("rejects an invalid applied date on create", async () => {
    const db = createMemoryStore();
    const result = await createJob(
      "user-a",
      { company: "Acme", title: "Eng", appliedAt: "not-a-date" },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.match(result.error, /applied date/i);
    }
    assert.equal(db.rows.length, 0);
  });

  it("rejects notes longer than 4000 characters", async () => {
    const db = createMemoryStore();
    const result = await createJob(
      "user-a",
      { company: "Acme", title: "Eng", notes: "x".repeat(4001) },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
    }
    assert.equal(db.rows.length, 0);
  });
});
