import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJob,
  isJobStatus,
  toBoardJob,
  type JobRecord,
} from "../lib/jobs";

const baseJob: JobRecord = {
  id: "job-1",
  userId: "user-a",
  company: "Acme",
  title: "Engineer",
  url: "https://jobs.example/eng",
  notes: "Follow up Tuesday",
  status: "interview",
  position: 2,
  appliedAt: new Date("2026-03-15T15:30:00.000Z"),
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
};

describe("isJobStatus", () => {
  it("accepts kanban column ids", () => {
    assert.equal(isJobStatus("applied"), true);
    assert.equal(isJobStatus("rejected"), true);
  });

  it("rejects unknown drag targets", () => {
    assert.equal(isJobStatus("wishlist"), false);
    assert.equal(isJobStatus(""), false);
  });
});

describe("toBoardJob", () => {
  it("formats appliedAt as a UTC calendar date for the board", () => {
    const boardJob = toBoardJob(baseJob);
    assert.equal(boardJob.appliedAt, "2026-03-15");
    assert.equal(boardJob.status, "interview");
    assert.equal(boardJob.url, "https://jobs.example/eng");
  });
});

describe("createJob validation", () => {
  it("rejects notes longer than 4000 characters", async () => {
    const result = await createJob("user-a", {
      company: "Acme",
      title: "Eng",
      notes: "n".repeat(4001),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
    }
  });
});
