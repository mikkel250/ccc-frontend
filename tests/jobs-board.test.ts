import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isJobStatus, toBoardJob, type JobRecord } from "../lib/jobs";

describe("board job helpers", () => {
  const sample: JobRecord = {
    id: "job-1",
    userId: "user-a",
    company: "Acme",
    title: "Engineer",
    url: "https://jobs.example/eng",
    notes: "Follow up",
    status: "interview",
    position: 2,
    appliedAt: new Date("2026-03-15T14:30:00.000Z"),
    createdAt: new Date("2026-03-01T00:00:00.000Z"),
    updatedAt: new Date("2026-03-16T00:00:00.000Z"),
  };

  it("serializes appliedAt as a UTC calendar date for the Kanban UI", () => {
    assert.deepEqual(toBoardJob(sample), {
      id: "job-1",
      company: "Acme",
      title: "Engineer",
      url: "https://jobs.example/eng",
      notes: "Follow up",
      status: "interview",
      appliedAt: "2026-03-15",
    });
  });

  it("rejects unknown status strings", () => {
    assert.equal(isJobStatus("applied"), true);
    assert.equal(isJobStatus("wishlist"), false);
  });
});
