import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registrationIsOpen } from "../lib/registration";

describe("Job Prisma schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  it("requires Job.userId, defaults appliedAt, and has four statuses", () => {
    assert.match(schema, /model Job \{[\s\S]*userId\s+String/);
    assert.match(schema, /appliedAt\s+DateTime\s+@default\(now\(\)\)/);
    assert.match(
      schema,
      /enum JobStatus \{\s*applied\s+interview\s+offer\s+rejected\s*\}/
    );
  });
});

describe("registrationIsOpen", () => {
  it("allows the first user when public registration is off", () => {
    assert.equal(registrationIsOpen(0, undefined), true);
    assert.equal(registrationIsOpen(0, "false"), true);
  });

  it("blocks later users unless ALLOW_REGISTRATION is true", () => {
    assert.equal(registrationIsOpen(1, undefined), false);
    assert.equal(registrationIsOpen(1, "false"), false);
    assert.equal(registrationIsOpen(1, "true"), true);
  });
});
