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

describe("pre-auth rate limit", () => {
  const authSource = readFileSync(join(process.cwd(), "lib/auth.ts"), "utf8");

  it("uses an empty IP header list and does not trust forwarding headers", () => {
    assert.match(authSource, /ipAddressHeaders:\s*\[\s*\]/);
    assert.equal(authSource.includes("x-forwarded-for"), false);
    assert.equal(authSource.includes("x-vercel-forwarded-for"), false);
    assert.equal(/disableIpTracking:\s*true/.test(authSource), false);
  });

  it("overrides sign-in and sign-up special rules with a coarse shared cap", () => {
    assert.match(
      authSource,
      /"\/sign-in\/email"\s*:\s*\{\s*window:\s*10,\s*max:\s*100\s*\}/
    );
    assert.match(
      authSource,
      /"\/sign-up\/email"\s*:\s*\{\s*window:\s*10,\s*max:\s*100\s*\}/
    );
  });
});

describe("page middleware", () => {
  const middlewareSource = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");

  it("gates HTML pages and leaves the tailor API as JSON", () => {
    assert.match(middlewareSource, /matcher:\s*\[[\s\S]*["']\/["']/);
    assert.match(middlewareSource, /["']\/board["']/);
    assert.equal(middlewareSource.includes("/api/tailor"), false);
    assert.equal(middlewareSource.includes("/api/"), false);
  });
});
