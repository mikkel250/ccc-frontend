import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleTailorPost } from "../app/api/lib/tailor-post";

describe("handleTailorPost", () => {
  it("returns 401 and does not call CCC when there is no session", async () => {
    let fetched = false;
    const response = await handleTailorPost(
      new Request("http://localhost/api/tailor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.9",
        },
        body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
      }),
      {
        getSessionUserId: async () => null,
        tailor: async () => {
          fetched = true;
          return { ok: true, cv: "nope", replyText: null };
        },
      }
    );
    assert.equal(response.status, 401);
    assert.equal(fetched, false);
    const body = (await response.json()) as { error?: string };
    assert.equal(typeof body.error, "string");
    assert.equal(/secret|key|bearer/i.test(body.error ?? ""), false);
  });

  it("calls tailor when a session is present and does not copy inbound XFF", async () => {
    let seenIp: string | undefined;
    const response = await handleTailorPost(
      new Request("http://localhost/api/tailor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "203.0.113.9",
        },
        body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
      }),
      {
        env: {},
        getSessionUserId: async () => "user-a",
        tailor: async (_jd, deps) => {
          seenIp = deps?.clientIp;
          return { ok: true, cv: "UEsDbA==", replyText: "Hi" };
        },
      }
    );
    assert.equal(response.status, 200);
    assert.equal(seenIp, "127.0.0.1");
    const body = (await response.json()) as { cv?: string };
    assert.equal(body.cv, "UEsDbA==");
  });

  it("forwards the Vercel platform client IP and ignores a different X-Forwarded-For", async () => {
    let seenIp: string | undefined;
    const response = await handleTailorPost(
      new Request("http://localhost/api/tailor", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-for": "198.51.100.20",
          "x-vercel-forwarded-for": "203.0.113.9",
        },
        body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
      }),
      {
        env: { VERCEL: "1" },
        getSessionUserId: async () => "user-a",
        tailor: async (_jd, deps) => {
          seenIp = deps?.clientIp;
          return { ok: true, cv: "UEsDbA==", replyText: "Hi" };
        },
      }
    );
    assert.equal(response.status, 200);
    assert.equal(seenIp, "203.0.113.9");
  });

  it("returns 400 for invalid JSON", async () => {
    const response = await handleTailorPost(
      new Request("http://localhost/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-json",
      }),
      {
        getSessionUserId: async () => "user-a",
        tailor: async () => {
          throw new Error("should not tailor");
        },
      }
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, "Invalid JSON.");
  });

  it("maps CCC 401 to 502 so session 401 stays unique", async () => {
    const response = await handleTailorPost(
      new Request("http://localhost/api/tailor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
      }),
      {
        getSessionUserId: async () => "user-a",
        tailor: async () => ({ ok: false, status: 401, error: "Unauthorized" }),
      }
    );
    assert.equal(response.status, 502);
    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, "Unauthorized");
  });
});
