import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJob,
  deleteJob,
  listJobs,
  updateJob,
  type JobRecord,
  type JobsStore,
} from "../lib/jobs";

function createMemoryStore(seed: JobRecord[] = []): JobsStore & { rows: JobRecord[] } {
  const rows = seed.map((row) => ({ ...row }));
  return {
    rows,
    job: {
      async findMany({ where, orderBy }) {
        let result = rows.filter((row) => row.userId === where.userId);
        if (where.status) {
          result = result.filter((row) => row.status === where.status);
        }
        if (orderBy) {
          const keys = Array.isArray(orderBy) ? orderBy : [orderBy];
          result = [...result].sort((a, b) => {
            for (const key of keys) {
              const field = Object.keys(key)[0] as keyof JobRecord;
              const dir = key[field] === "desc" ? -1 : 1;
              if (a[field] < b[field]) return -1 * dir;
              if (a[field] > b[field]) return 1 * dir;
            }
            return 0;
          });
        }
        return result.map((row) => ({ ...row }));
      },
      async findFirst({ where }) {
        const row = rows.find(
          (candidate) =>
            candidate.id === where.id &&
            (!where.userId || candidate.userId === where.userId)
        );
        return row ? { ...row } : null;
      },
      async create({ data }) {
        const now = new Date();
        const row: JobRecord = {
          id: data.id ?? `job-${rows.length + 1}`,
          userId: data.userId,
          company: data.company,
          title: data.title,
          url: data.url ?? null,
          notes: data.notes ?? null,
          status: data.status,
          position: data.position,
          appliedAt: data.appliedAt ?? now,
          createdAt: now,
          updatedAt: now,
        };
        rows.push(row);
        return { ...row };
      },
      async update({ where, data }) {
        const index = rows.findIndex((row) => row.id === where.id);
        if (index < 0) {
          throw new Error("not found");
        }
        rows[index] = {
          ...rows[index],
          ...data,
          updatedAt: new Date(),
        };
        return { ...rows[index] };
      },
      async delete({ where }) {
        const index = rows.findIndex((row) => row.id === where.id);
        if (index < 0) {
          throw new Error("not found");
        }
        const [removed] = rows.splice(index, 1);
        return { ...removed };
      },
      async aggregate({ where }) {
        const matching = rows.filter(
          (row) =>
            row.userId === where.userId &&
            (!where.status || row.status === where.status)
        );
        const positions = matching.map((row) => row.position);
        return {
          _max: { position: positions.length ? Math.max(...positions) : null },
        };
      },
    },
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

  it("requires a user id at the call boundary", async () => {
    const db = createMemoryStore();
    const result = await createJob("", { company: "Acme", title: "Eng" }, { db });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, "invalid");
    }
    assert.equal(db.rows.length, 0);
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
});
