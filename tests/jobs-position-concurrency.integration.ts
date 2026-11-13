import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";

type JobsModule = typeof import("../lib/jobs");

function databaseUrl(): string | undefined {
  const fromEnv = process.env.DATABASE_URL?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  let text: string;
  try {
    text = readFileSync(new URL("../.env", import.meta.url), "utf8");
  } catch {
    return undefined;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const normalized = trimmed.startsWith("export ") ? trimmed.slice("export ".length) : trimmed;
    if (!normalized.startsWith("DATABASE_URL=")) {
      continue;
    }
    const raw = normalized.slice("DATABASE_URL=".length).trim();
    if (
      (raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))
    ) {
      return raw.slice(1, -1);
    }
    return raw;
  }
  return undefined;
}

function isLoopback(url: string): boolean {
  const host = new URL(url).hostname;
  return host === "127.0.0.1" || host === "localhost";
}

const configuredUrl = databaseUrl();

describe("postgres job position concurrency", () => {
  let prisma: PrismaClient | undefined;
  let createJob: JobsModule["createJob"];
  let updateJob: JobsModule["updateJob"];

  before(async () => {
    assert.ok(
      configuredUrl,
      "DATABASE_URL must point at local Postgres before npm run test:db"
    );
    assert.equal(isLoopback(configuredUrl), true, "test:db refuses a non-loopback DATABASE_URL");
    process.env.DATABASE_URL = configuredUrl;
    const prismaMod = await import("../lib/prisma");
    const jobs = await import("../lib/jobs");
    prisma = prismaMod.getPrisma();
    createJob = jobs.createJob;
    updateJob = jobs.updateJob;
  });

  after(async () => {
    await prisma?.$disconnect();
  });

  it("keeps positions unique under concurrent creates and column moves", async () => {
    assert.ok(prisma);
    assert.ok(createJob);
    assert.ok(updateJob);
    const db = prisma;
    const userId = `concurrency-${randomUUID()}`;
    let userCreated = false;

    try {
      const indexes = await db.$queryRaw<Array<{ indexdef: string }>>`
        SELECT indexdef
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname = 'Job_userId_status_position_key'
      `;
      assert.equal(indexes.length, 1);
      assert.match(indexes[0]?.indexdef ?? "", /UNIQUE/);

      await db.user.create({
        data: {
          id: userId,
          name: "Position concurrency",
          email: `${userId}@example.test`,
        },
      });
      userCreated = true;

      for (let round = 0; round < 8; round += 1) {
        const created = await Promise.all([
          createJob(userId, { company: `Alpha ${round}`, title: "Engineer" }),
          createJob(userId, { company: `Beta ${round}`, title: "Designer" }),
        ]);
        for (const result of created) {
          assert.equal(result.ok, true, result.ok ? "" : result.error);
        }
      }

      const applied = await db.job.findMany({
        where: { userId, status: "applied" },
        orderBy: { position: "asc" },
      });
      assert.deepEqual(
        applied.map((job) => job.position),
        applied.map((_, index) => index)
      );

      const [first, second] = applied;
      assert.ok(first);
      assert.ok(second);
      const moved = await Promise.all([
        updateJob(userId, first.id, { status: "offer" }),
        updateJob(userId, second.id, { status: "offer" }),
      ]);
      for (const result of moved) {
        assert.equal(result.ok, true, result.ok ? "" : result.error);
      }

      const offers = await db.job.findMany({
        where: { userId, status: "offer" },
        orderBy: { position: "asc" },
      });
      assert.deepEqual(
        offers.map((job) => job.position),
        [0, 1]
      );

      const remaining = await db.job.findMany({
        where: { userId, status: "applied" },
        orderBy: { position: "asc" },
      });
      const appliedPositions = new Set(remaining.map((job) => job.position));
      assert.equal(appliedPositions.size, remaining.length);
    } finally {
      if (userCreated) {
        await db.user.delete({ where: { id: userId } });
      }
    }
  });
});
