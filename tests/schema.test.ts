import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JOB_STATUSES } from "../lib/jobs";
import { publicRegistrationAllowed, registrationIsOpen } from "../lib/registration";

describe("Job Prisma schema", () => {
  const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

  it("requires Job.userId, defaults appliedAt, and has four statuses", () => {
    const jobModel = schema.match(/model Job \{[\s\S]*?\n\}/)?.[0] ?? "";
    assert.match(jobModel, /^\s*userId\s+String$/m);
    assert.doesNotMatch(jobModel, /^\s*userId\s+String\?/m);
    assert.match(jobModel, /appliedAt\s+DateTime\s+@default\(now\(\)\)/);
    assert.match(jobModel, /^\s*status\s+JobStatus\s*$/m);
    const statusEnum = schema.match(/enum JobStatus \{([\s\S]*?)\}/)?.[1] ?? "";
    const members = [...statusEnum.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/gm)].map(
      (match) => match[1]
    );
    assert.deepEqual(members, [...JOB_STATUSES]);
    assert.match(jobModel, /@@unique\(\[userId, status, position\]\)/);
  });

  it("defines a singleton RegistrationClaim primary key", () => {
    const claimModel = schema.match(/model RegistrationClaim \{[\s\S]*?\n\}/)?.[0] ?? "";
    assert.match(claimModel, /^\s*id\s+Int\s+@id$/m);
    assert.match(claimModel, /@@map\("registration_claim"\)/);
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

  it("skips a user lookup when ALLOW_REGISTRATION is true", async () => {
    let lookedUp = false;
    const open = await publicRegistrationAllowed({
      allowRegistration: "true",
      hasUser: async () => {
        lookedUp = true;
        return true;
      },
    });
    assert.equal(open, true);
    assert.equal(lookedUp, false);
  });

  it("uses the live user lookup when public registration is off", async () => {
    const closed = await publicRegistrationAllowed({
      allowRegistration: undefined,
      hasUser: async () => true,
    });
    const open = await publicRegistrationAllowed({
      allowRegistration: undefined,
      hasUser: async () => false,
    });
    assert.equal(closed, false);
    assert.equal(open, true);
  });
});
