import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createJobAction,
  deleteJobAction,
  moveJobAction,
  updateJobAction,
} from "../app/actions/jobs";
import type { CreateJobInput, UpdateJobInput } from "../lib/jobs";

type JobResult = { ok: true } | { ok: false; error: string };

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    data.set(key, value);
  }
  return data;
}

function harness() {
  const revalidated: string[] = [];
  const created: Array<{ userId: string; input: CreateJobInput }> = [];
  const updated: Array<{ userId: string; jobId: string; input: UpdateJobInput }> = [];
  const deleted: Array<{ userId: string; jobId: string }> = [];
  let createResult: JobResult | Error = { ok: true };

  const deps = {
    requireUserId: async () => "user-a",
    revalidate: (path: string) => {
      revalidated.push(path);
    },
    jobs: {
      createJob: async (userId: string, input: CreateJobInput) => {
        created.push({ userId, input });
        if (createResult instanceof Error) {
          throw createResult;
        }
        return createResult;
      },
      updateJob: async (userId: string, jobId: string, input: UpdateJobInput) => {
        updated.push({ userId, jobId, input });
        return { ok: true as const };
      },
      deleteJob: async (userId: string, jobId: string) => {
        deleted.push({ userId, jobId });
        return { ok: true as const };
      },
    },
  };

  return {
    deps,
    revalidated,
    created,
    updated,
    deleted,
    failCreate(error: Error) {
      createResult = error;
    },
    rejectCreate(result: JobResult) {
      createResult = result;
    },
  };
}

describe("job server actions", () => {
  it("passes the session user and form fields, then revalidates", async () => {
    const board = harness();
    const created = await createJobAction(
      form({
        company: "Acme",
        title: "Engineer",
        url: "https://jobs.example/eng",
        notes: "Referral",
        appliedAt: "2026-09-07",
      }),
      board.deps
    );
    assert.deepEqual(created, { ok: true });
    assert.deepEqual(board.created, [
      {
        userId: "user-a",
        input: {
          company: "Acme",
          title: "Engineer",
          url: "https://jobs.example/eng",
          notes: "Referral",
          appliedAt: "2026-09-07",
        },
      },
    ]);
    assert.deepEqual(board.revalidated, ["/board"]);
  });

  it("omits blank update fields and sends present empty url and notes", async () => {
    const board = harness();
    const updated = await updateJobAction(
      form({
        id: "job-1",
        title: "Staff Engineer",
        url: "",
        notes: "",
      }),
      board.deps
    );
    assert.deepEqual(updated, { ok: true });
    assert.deepEqual(board.updated, [
      {
        userId: "user-a",
        jobId: "job-1",
        input: {
          company: undefined,
          title: "Staff Engineer",
          url: "",
          notes: "",
          appliedAt: undefined,
        },
      },
    ]);
    assert.deepEqual(board.revalidated, ["/board"]);
  });

  it("deletes and moves only the session user's job", async () => {
    const board = harness();
    const deleted = await deleteJobAction("job-1", board.deps);
    const moved = await moveJobAction("job-1", "interview", board.deps);
    assert.deepEqual(deleted, { ok: true });
    assert.deepEqual(moved, { ok: true });
    assert.deepEqual(board.deleted, [{ userId: "user-a", jobId: "job-1" }]);
    assert.deepEqual(board.updated, [
      { userId: "user-a", jobId: "job-1", input: { status: "interview" } },
    ]);
    assert.deepEqual(board.revalidated, ["/board", "/board"]);
  });

  it("returns the job error and skips revalidate when save fails", async () => {
    const board = harness();
    board.rejectCreate({ ok: false, error: "Check the applied date." });
    const result = await createJobAction(
      form({ company: "Acme", title: "Eng", appliedAt: "not-a-date" }),
      board.deps
    );
    assert.deepEqual(result, { error: "Check the applied date." });
    assert.deepEqual(board.revalidated, []);
  });

  it("returns a generic save error when the job layer throws", async () => {
    const board = harness();
    board.failCreate(new Error("db down"));
    const result = await createJobAction(form({ company: "Acme", title: "Eng" }), board.deps);
    assert.deepEqual(result, { error: "Could not save. Please try again." });
    assert.deepEqual(board.revalidated, []);
    assert.equal(board.created.length, 1);
  });

  it("does not mutate when the session is missing", async () => {
    const board = harness();
    const unauthenticated = {
      ...board.deps,
      requireUserId: async () => {
        throw new Error("unauthenticated");
      },
    };
    await assert.rejects(
      () => createJobAction(form({ company: "Acme", title: "Eng" }), unauthenticated),
      /unauthenticated/
    );
    await assert.rejects(() => updateJobAction(form({ id: "job-1", title: "Hacked" }), unauthenticated), /unauthenticated/);
    await assert.rejects(() => deleteJobAction("job-1", unauthenticated), /unauthenticated/);
    await assert.rejects(() => moveJobAction("job-1", "rejected", unauthenticated), /unauthenticated/);
    assert.equal(board.created.length, 0);
    assert.equal(board.updated.length, 0);
    assert.equal(board.deleted.length, 0);
    assert.deepEqual(board.revalidated, []);
  });
});
