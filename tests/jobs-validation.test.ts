import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJob,
  isJobStatus,
  toBoardJob,
  type JobRecord,
} from "../lib/jobs";

describe("job helpers", () => {
  it("recognizes valid board statuses", () => {
    assert.equal(isJobStatus("applied"), true);
    assert.equal(isJobStatus("interview"), true);
    assert.equal(isJobStatus("archived"), false);
  });

  it("formats board jobs with a YYYY-MM-DD applied date", () => {
    const job: JobRecord = {
      id: "job-1",
      userId: "user-a",
      company: "Acme",
      title: "Engineer",
      url: null,
      notes: null,
      status: "applied",
      position: 0,
      appliedAt: new Date("2026-03-15T14:30:00.000Z"),
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-01T00:00:00.000Z"),
    };
    const boardJob = toBoardJob(job);
    assert.equal(boardJob.appliedAt, "2026-03-15");
    assert.equal(boardJob.company, "Acme");
  });
});

describe("createJob validation", () => {
  it("rejects an invalid applied date", async () => {
    const result = await createJob(
      "user-a",
      {
        company: "Acme",
        title: "Engineer",
        appliedAt: "not-a-date",
      },
      {
        db: {
          async $transaction(run) {
            return run({
              job: {
                async findMany() {
                  return [];
                },
                async findFirst() {
                  return null;
                },
                async create() {
                  throw new Error("should not create");
                },
                async update() {
                  throw new Error("should not update");
                },
                async updateMany() {
                  return { count: 0 };
                },
                async deleteMany() {
                  return { count: 0 };
                },
                async aggregate() {
                  return { _max: { position: null } };
                },
              },
            });
          },
          job: {
            async findMany() {
              return [];
            },
            async findFirst() {
              return null;
            },
            async create() {
              throw new Error("should not create");
            },
            async update() {
              throw new Error("should not update");
            },
            async updateMany() {
              return { count: 0 };
            },
            async deleteMany() {
              return { count: 0 };
            },
            async aggregate() {
              return { _max: { position: null } };
            },
          },
        },
      }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Check the applied date.");
    }
  });
});
