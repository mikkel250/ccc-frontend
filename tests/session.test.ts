import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getSessionUserId } from "../lib/session";

describe("getSessionUserId", () => {
  it("returns null when the session lookup is missing", async () => {
    const userId = await getSessionUserId(async () => null);
    assert.equal(userId, null);
  });

  it("returns the user id from a session", async () => {
    const userId = await getSessionUserId(async () => ({
      user: { id: "user-a" },
    }));
    assert.equal(userId, "user-a");
  });
});

describe("login page secrets", () => {
  it("does not import TAILOR_API_KEY", () => {
    const loginPage = readFileSync(join(process.cwd(), "app/login/page.tsx"), "utf8");
    assert.equal(loginPage.includes("TAILOR_API_KEY"), false);
    assert.equal(loginPage.includes("NEXT_PUBLIC_TAILOR"), false);
  });
});
