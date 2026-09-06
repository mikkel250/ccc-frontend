import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tailorOnDemand } from "../app/api/lib/ccc-tailor";
import { handleTailorPost } from "../app/api/lib/tailor-post";

describe("tailorOnDemand", () => {
  it("rejects empty JD without fetching", async () => {
    let called = false;
    const result = await tailorOnDemand("  ", {
      apiUrl: "http://ccc.test",
      apiKey: "secret",
      fetchImpl: async () => {
        called = true;
        return new Response("{}");
      },
    });
    assert.equal(called, false);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 400);
    }
  });

  it("fails closed when env is missing", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "",
      apiKey: "",
      fetchImpl: async () => {
        throw new Error("should not fetch");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.equal(result.error.includes("secret"), false);
      assert.equal(result.error.toLowerCase().includes("key"), false);
    }
  });

  it("returns cv and replyText on CCC 200", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async (input, init) => {
        assert.equal(String(input), "http://ccc.test/api/tailor-cv");
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("Authorization"), "Bearer secret-key-value");
        assert.equal(headers.get("x-forwarded-for"), "127.0.0.1");
        const body = JSON.parse(String(init?.body));
        assert.equal(body.curationMode, "strict");
        assert.equal(body.jobDescription, "Senior engineer JD");
        return Response.json({
          cv: "UEsDbA==",
          replyText: "Thanks for reaching out.",
          curatedJson: { name: "hidden" },
        });
      },
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.cv, "UEsDbA==");
      assert.equal(result.replyText, "Thanks for reaching out.");
      assert.equal(JSON.stringify(result).includes("curatedJson"), false);
      assert.equal(JSON.stringify(result).includes("secret-key-value"), false);
    }
  });

  it("maps CCC 401 to a client-safe error", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret",
      fetchImpl: async () =>
        Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(result.error, "Unauthorized");
    }
  });

  it("does not leak bearer-like CCC error strings", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret",
      fetchImpl: async () =>
        Response.json({ error: "Invalid Bearer TAILOR_API_KEY" }, { status: 401 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(/bearer|tailor_api/i.test(result.error), false);
    }
  });

  it("maps CCC 422 to a client-safe error", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret",
      fetchImpl: async () =>
        Response.json({ error: "Curator output was not valid JSON" }, { status: 422 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 422);
      assert.equal(result.error, "Curator output was not valid JSON");
    }
  });

  it("does not forward a spoofed client IP", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret",
      clientIp: "127.0.0.1",
      fetchImpl: async (_input, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("x-forwarded-for"), "127.0.0.1");
        return Response.json({ cv: "UEsDbA==", replyText: "Thanks" });
      },
    });
    assert.equal(result.ok, true);
  });
});

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
});
