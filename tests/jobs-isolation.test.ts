import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJob,
  deleteJob,
  listJobs,
  toBoardJob,
  updateJob,
  type JobRecord,
} from "../lib/jobs";
import { createMemoryStore } from "./memory-jobs-store";

function allowOverlappingPositionConflicts(db: ReturnType<typeof createMemoryStore>): void {
  const aggregate = db.job.aggregate.bind(db.job);
  let readers = 0;
  let releaseBoth: () => void = () => {};
  const bothRead = new Promise<void>((resolve) => {
    releaseBoth = resolve;
  });
  db.$transaction = async (run) => run({ job: db.job });
  db.job.aggregate = async (args) => {
    const snapshot = await aggregate(args);
    readers += 1;
    if (readers === 2) {
      releaseBoth();
    } else if (readers < 2) {
      await bothRead;
    }
    return snapshot;
  };
}

const now = new Date("2026-09-01T12:00:00.000Z");

function seedJob(overrides: Partial<JobRecord> & Pick<JobRecord, "id" | "userId">): JobRecord {
  return {
    company: "Acme",
    title: "Engineer",
    url: null,
    notes: null,
    status: "applied",
    position: 0,
    appliedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("jobs isolation", () => {
  it("list(userA) does not include userB jobs", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", company: "A Co" }),
      seedJob({ id: "b1", userId: "user-b", company: "B Co" }),
    ]);
    const result = await listJobs("user-a", { db });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(
        result.jobs.map((job) => job.id),
        ["a1"]
      );
    }
  });

  it("update(userB, jobA.id) does not change the row", async () => {
    const original = seedJob({ id: "a1", userId: "user-a", title: "Keep me" });
    const db = createMemoryStore([original]);
    const result = await updateJob("user-b", "a1", { title: "Hacked" }, { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "not_found");
    }
    assert.equal(db.rows[0].title, "Keep me");
    assert.equal(db.rows[0].userId, "user-a");
  });

  it("delete(userB, jobA.id) leaves the row", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a" })]);
    const result = await deleteJob("user-b", "a1", { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "not_found");
    }
    assert.equal(db.rows.length, 1);
  });

  it("rejects an invalid status", async () => {
    const db = createMemoryStore();
    const result = await createJob(
      "user-a",
      { company: "Acme", title: "Eng", status: "wishlist" as "applied" },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
    }
    assert.equal(db.rows.length, 0);
  });

  it("rejects javascript: URLs", async () => {
    const db = createMemoryStore();
    const result = await createJob(
      "user-a",
      { company: "Acme", title: "Eng", url: "javascript:alert(1)" },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
    }
  });

  it("assigns the next position in the target column", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", status: "applied", position: 0 }),
    ]);
    const created = await createJob(
      "user-a",
      { company: "Beta", title: "PM", url: "https://jobs.example/pm" },
      { db }
    );
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.job.position, 1);
      assert.equal(created.job.status, "applied");
    }
  });

  it("keeps positions unique and ordered during concurrent creates", async () => {
    const db = createMemoryStore();
    const results = await Promise.all([
      createJob("user-a", { company: "Alpha", title: "Engineer" }, { db }),
      createJob("user-a", { company: "Beta", title: "Designer" }, { db }),
    ]);

    assert.equal(results.every((result) => result.ok), true);
    assert.deepEqual(
      db.rows
        .filter((job) => job.userId === "user-a" && job.status === "applied")
        .sort((left, right) => left.position - right.position)
        .map((job) => job.position),
      [0, 1]
    );
  });

  it("retries a create when its position conflicts", async () => {
    const db = createMemoryStore([
      seedJob({ id: "taken", userId: "user-a", status: "applied", position: 0 }),
    ]);
    const aggregate = db.job.aggregate.bind(db.job);
    let reads = 0;
    db.job.aggregate = async (args) => {
      reads += 1;
      if (reads === 1) {
        return { _max: { position: null } };
      }
      return aggregate(args);
    };

    const result = await createJob(
      "user-a",
      { company: "Acme", title: "Engineer" },
      { db }
    );

    assert.equal(result.ok, true);
    assert.equal(reads, 2);
    assert.deepEqual(
      db.rows.map((row) => row.position).sort((left, right) => left - right),
      [0, 1]
    );
  });

  it("restores rows when a transaction writes and then throws", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a", title: "Keep me" })]);
    await assert.rejects(
      () =>
        db.$transaction(async (tx) => {
          await tx.job.create({
            data: {
              userId: "user-a",
              company: "Beta",
              title: "Temp",
              url: null,
              notes: null,
              status: "applied",
              position: 1,
              appliedAt: now,
            },
          });
          const listed = await tx.job.findMany({ where: { userId: "user-a" } });
          assert.equal(listed.length, 2);
          throw new Error("read failed");
        }),
      /read failed/
    );
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.title, "Keep me");

    await Promise.race([
      db.$transaction(async (tx) => {
        await tx.job.updateMany({
          where: { id: "a1", userId: "user-a" },
          data: { title: "After" },
        });
      }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("transaction lock was not released")), 500);
      }),
    ]);
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.title, "After");
  });

  it("stops after repeated position conflicts", async () => {
    const db = createMemoryStore();
    let attempts = 0;
    db.job.create = async () => {
      attempts += 1;
      throw Object.assign(new Error("position conflict"), { code: "P2002" });
    };
    const result = await createJob(
      "user-a",
      { company: "Acme", title: "Engineer" },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Could not save. Please try again.");
    }
    assert.equal(attempts, 4);
    assert.equal(db.rows.length, 0);
  });

  it("requires a user id at the call boundary", async () => {
    const db = createMemoryStore();
    const result = await createJob("", { company: "Acme", title: "Eng" }, { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
    }
    assert.equal(db.rows.length, 0);
  });

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
      assert.equal(result.error, "Check the applied date.");
    }
    assert.equal(db.rows.length, 0);
  });

  it("rejects notes longer than 4000 characters", async () => {
    const db = createMemoryStore();
    const result = await createJob(
      "user-a",
      { company: "Acme", title: "Eng", notes: "n".repeat(4001) },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Check the company, title, URL, and notes.");
    }
    assert.equal(db.rows.length, 0);
  });

  it("rejects an invalid update URL and leaves the row", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", url: "https://jobs.example/a" }),
    ]);
    const result = await updateJob(
      "user-a",
      "a1",
      { url: "javascript:alert(1)" },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Check the company, title, URL, and notes.");
    }
    assert.equal(db.rows[0]?.url, "https://jobs.example/a");
    assert.equal(db.rows[0]?.title, "Engineer");
  });

  it("rejects an invalid update status and leaves the row", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", status: "applied", position: 0 }),
    ]);
    const result = await updateJob(
      "user-a",
      "a1",
      { status: "wishlist" as "applied" },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Choose a valid column.");
    }
    assert.equal(db.rows[0]?.status, "applied");
    assert.equal(db.rows[0]?.position, 0);
  });

  it("rejects an invalid update date and leaves the row", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a" })]);
    const result = await updateJob(
      "user-a",
      "a1",
      { appliedAt: "not-a-date" },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Check the applied date.");
    }
    assert.equal(db.rows[0]?.appliedAt.toISOString(), now.toISOString());
  });

  it("rejects overlong notes on update and leaves the row", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a", notes: "keep" })]);
    const result = await updateJob(
      "user-a",
      "a1",
      { notes: "n".repeat(4001) },
      { db }
    );
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Check the company, title, URL, and notes.");
    }
    assert.equal(db.rows[0]?.notes, "keep");
  });

  it("returns a save error when update storage throws and leaves the row", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", title: "Keep me", status: "applied" }),
    ]);
    db.$transaction = async () => {
      throw new Error("db down");
    };
    const result = await updateJob("user-a", "a1", { title: "Changed" }, { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Could not save. Please try again.");
    }
    assert.equal(db.rows[0]?.title, "Keep me");
    assert.equal(db.rows[0]?.status, "applied");
  });

  it("leaves the row unchanged when a column move fails in the store", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", status: "applied", position: 0 }),
    ]);
    db.job.updateMany = async () => {
      throw new Error("db down");
    };
    const result = await updateJob("user-a", "a1", { status: "offer" }, { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Could not save. Please try again.");
    }
    assert.equal(db.rows[0]?.status, "applied");
    assert.equal(db.rows[0]?.position, 0);
    assert.equal(db.rows[0]?.title, "Engineer");
  });

  it("returns a save error when delete storage throws and leaves the row", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a" })]);
    db.job.deleteMany = async () => {
      throw new Error("db down");
    };
    const result = await deleteJob("user-a", "a1", { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Could not save. Please try again.");
    }
    assert.equal(db.rows.length, 1);
    assert.equal(db.rows[0]?.id, "a1");
  });

  it("rejects an empty job id on update", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a" })]);
    const result = await updateJob("user-a", "  ", { title: "New title" }, { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
      assert.equal(result.error, "Job is required.");
    }
    assert.equal(db.rows[0].title, "Engineer");
  });

  it("formats board jobs with a YYYY-MM-DD applied date", () => {
    const boardJob = toBoardJob(
      seedJob({
        id: "a1",
        userId: "user-a",
        appliedAt: new Date("2026-09-07T15:30:00.000Z"),
      })
    );
    assert.equal(boardJob.appliedAt, "2026-09-07");
  });

  it("deletes the caller's own job", async () => {
    const db = createMemoryStore([seedJob({ id: "a1", userId: "user-a" })]);
    const result = await deleteJob("user-a", "a1", { db });
    assert.equal(result.ok, true);
    assert.equal(db.rows.length, 0);
  });

  it("clears notes and replaces appliedAt only when a date is sent", async () => {
    const db = createMemoryStore([
      seedJob({
        id: "a1",
        userId: "user-a",
        notes: "Follow up Friday",
        appliedAt: new Date("2026-04-01T00:00:00.000Z"),
      }),
    ]);
    const cleared = await updateJob(
      "user-a",
      "a1",
      { notes: "", appliedAt: "" },
      { db }
    );
    assert.equal(cleared.ok, true);
    if (cleared.ok) {
      assert.equal(cleared.job.notes, null);
      assert.equal(cleared.job.appliedAt.toISOString(), "2026-04-01T00:00:00.000Z");
    }

    const replaced = await updateJob(
      "user-a",
      "a1",
      { appliedAt: "2026-05-02" },
      { db }
    );
    assert.equal(replaced.ok, true);
    if (replaced.ok) {
      assert.equal(replaced.job.appliedAt.toISOString(), "2026-05-02T00:00:00.000Z");
    }
  });

  it("stores an empty URL as null on create and update", async () => {
    const db = createMemoryStore();
    const created = await createJob(
      "user-a",
      { company: "Acme", title: "Eng", url: "" },
      { db }
    );
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.job.url, null);
    }
    const updated = await updateJob("user-a", db.rows[0].id, { url: "" }, { db });
    assert.equal(updated.ok, true);
    if (updated.ok) {
      assert.equal(updated.job.url, null);
    }
  });

  it("defaults omitted appliedAt to the local calendar date at UTC midnight", async () => {
    const db = createMemoryStore();
    const created = await createJob("user-a", { company: "Acme", title: "Eng" }, { db });
    assert.equal(created.ok, true);
    if (created.ok) {
      const local = new Date();
      const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}T00:00:00.000Z`;
      assert.equal(created.job.appliedAt.toISOString(), expected);
    }
  });

  it("returns not_found when updateMany matches no row", async () => {
    const original = seedJob({ id: "a1", userId: "user-a", title: "Keep me" });
    const db = createMemoryStore([original]);
    db.job.findFirst = async () => original;
    db.job.updateMany = async () => ({ count: 0 });
    const result = await updateJob("user-a", "a1", { title: "After delete" }, { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "not_found");
    }
    assert.equal(db.rows[0].title, "Keep me");
  });

  it("returns a save error when the store throws", async () => {
    const db = createMemoryStore();
    db.job.create = async () => {
      throw new Error("db down");
    };
    const result = await createJob("user-a", { company: "Acme", title: "Eng" }, { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
    }
  });

  it("allocates a column position from the row seen inside the update transaction", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", status: "applied", position: 0 }),
      seedJob({ id: "i1", userId: "user-a", status: "interview", position: 0 }),
    ]);
    const runTransaction = db.$transaction.bind(db);
    db.$transaction = async (run) => {
      const row = db.rows.find((job) => job.id === "a1");
      if (row?.status === "applied") {
        row.status = "interview";
        row.position = 1;
      }
      return runTransaction(run);
    };

    const result = await updateJob("user-a", "a1", { status: "interview" }, { db });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.job.status, "interview");
      assert.equal(result.job.position, 1);
    }
  });

  it("moves a card to a new column at the next position", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", status: "applied", position: 0 }),
      seedJob({ id: "a2", userId: "user-a", status: "interview", position: 0 }),
    ]);
    const result = await updateJob("user-a", "a1", { status: "interview" }, { db });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.job.status, "interview");
      assert.equal(result.job.position, 1);
    }
    assert.equal(db.rows.find((row) => row.id === "a1")?.status, "interview");
  });

  it("keeps positions unique and ordered during concurrent column moves", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", status: "applied", position: 0 }),
      seedJob({ id: "a2", userId: "user-a", status: "applied", position: 1 }),
      seedJob({ id: "i1", userId: "user-a", status: "interview", position: 0 }),
    ]);

    const results = await Promise.all([
      updateJob("user-a", "a1", { status: "interview" }, { db }),
      updateJob("user-a", "a2", { status: "interview" }, { db }),
    ]);

    assert.equal(results.every((result) => result.ok), true);
    assert.deepEqual(
      db.rows
        .filter((job) => job.userId === "user-a" && job.status === "interview")
        .sort((left, right) => left.position - right.position)
        .map((job) => job.position),
      [0, 1, 2]
    );
  });

  it("retries overlapping creates when the store reports a position conflict", async () => {
    const db = createMemoryStore();
    allowOverlappingPositionConflicts(db);
    const results = await Promise.race([
      Promise.all([
        createJob("user-a", { company: "Alpha", title: "Engineer" }, { db }),
        createJob("user-a", { company: "Beta", title: "Designer" }, { db }),
      ]),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("overlapping creates did not finish")), 1000);
      }),
    ]);

    assert.equal(results.every((result) => result.ok), true);
    assert.deepEqual(
      db.rows
        .filter((job) => job.userId === "user-a" && job.status === "applied")
        .sort((left, right) => left.position - right.position)
        .map((job) => job.position),
      [0, 1]
    );
  });

  it("retries overlapping column moves when the store reports a position conflict", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", status: "applied", position: 0 }),
      seedJob({ id: "a2", userId: "user-a", status: "applied", position: 1 }),
      seedJob({ id: "i1", userId: "user-a", status: "interview", position: 0 }),
    ]);
    allowOverlappingPositionConflicts(db);
    const results = await Promise.race([
      Promise.all([
        updateJob("user-a", "a1", { status: "interview" }, { db }),
        updateJob("user-a", "a2", { status: "interview" }, { db }),
      ]),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("overlapping moves did not finish")), 1000);
      }),
    ]);

    assert.equal(results.every((result) => result.ok), true);
    assert.deepEqual(
      db.rows
        .filter((job) => job.userId === "user-a" && job.status === "interview")
        .sort((left, right) => left.position - right.position)
        .map((job) => job.position),
      [0, 1, 2]
    );
  });

  it("retries a column move when its target position conflicts", async () => {
    const db = createMemoryStore([
      seedJob({ id: "a1", userId: "user-a", status: "applied", position: 0 }),
    ]);
    const updateMany = db.job.updateMany;
    let attempts = 0;
    db.job.updateMany = async (args) => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("position conflict"), { code: "P2002" });
      }
      return updateMany(args);
    };

    const result = await updateJob(
      "user-a",
      "a1",
      { status: "interview" },
      { db }
    );

    assert.equal(result.ok, true);
    assert.equal(attempts, 2);
    assert.equal(db.rows[0]?.status, "interview");
    assert.equal(db.rows[0]?.position, 0);
  });
});
