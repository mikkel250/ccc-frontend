import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { APIError, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { firstOperatorRegistration } from "../lib/registration";

const execFileAsync = promisify(execFile);

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

function databaseNamed(baseUrl: string, name: string): string {
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

function assertRegistrationClosed(error: unknown): boolean {
  assert.ok(error instanceof APIError);
  assert.equal(error.statusCode, 403);
  assert.equal(error.message, "Registration is closed.");
  return true;
}

const configuredUrl = databaseUrl();

describe("postgres first-operator registration", () => {
  let admin: PrismaClient | undefined;
  let databaseName: string | undefined;
  let isolatedUrl: string | undefined;

  before(async () => {
    assert.ok(configuredUrl, "DATABASE_URL must point at local Postgres before npm run test:db");
    assert.equal(isLoopback(configuredUrl), true, "test:db refuses a non-loopback DATABASE_URL");
    const name = `ccc_reg_${randomBytes(8).toString("hex")}`;
    assert.match(name, /^ccc_reg_[a-f0-9]+$/);
    admin = new PrismaClient({ datasources: { db: { url: configuredUrl } } });
    databaseName = name;
    // Claim id 1 is a singleton, so the race runs in a private database.
    await admin.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    isolatedUrl = databaseNamed(configuredUrl, name);
    const prismaBin = fileURLToPath(new URL("../node_modules/.bin/prisma", import.meta.url));
    try {
      await execFileAsync(prismaBin, ["migrate", "deploy"], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: { ...process.env, DATABASE_URL: isolatedUrl },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "prisma migrate deploy failed";
      throw new Error(message.replaceAll(isolatedUrl, "[database]"), { cause: error });
    }
  });

  after(async () => {
    const name = databaseName;
    const client = admin;
    databaseName = undefined;
    if (client && name) {
      await client.$queryRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`
      );
      await client.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}"`);
    }
    await client?.$disconnect();
  });

  it("commits exactly one user, claim, account, and session when two first signups race", async () => {
    assert.ok(isolatedUrl);
    const prisma = new PrismaClient({ datasources: { db: { url: isolatedUrl } } });
    try {
      const auth = betterAuth({
        secret: "test-secret-at-least-32-characters-long",
        baseURL: "http://127.0.0.1:3000",
        database: prismaAdapter(prisma, {
          provider: "postgresql",
          transaction: true,
        }),
        emailAndPassword: { enabled: true, minPasswordLength: 8 },
        rateLimit: { enabled: false },
        plugins: [firstOperatorRegistration({ allowRegistration: "false" })],
      });
      const signup = (email: string) =>
        auth.api.signUpEmail({
          body: {
            name: "Operator",
            email,
            password: "test-password",
          },
        });

      const results = await Promise.allSettled([
        signup("one@example.com"),
        signup("two@example.com"),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assertRegistrationClosed(rejected[0]?.reason);

      assert.equal(await prisma.user.count(), 1);
      assert.equal(await prisma.registrationClaim.count(), 1);
      assert.equal(await prisma.account.count(), 1);
      assert.equal(await prisma.session.count(), 1);
      const claim = await prisma.registrationClaim.findUnique({ where: { id: 1 } });
      assert.ok(claim);
      const user = await prisma.user.findFirst();
      assert.ok(user?.email === "one@example.com" || user?.email === "two@example.com");
    } finally {
      await prisma.$disconnect();
    }
  });
});
