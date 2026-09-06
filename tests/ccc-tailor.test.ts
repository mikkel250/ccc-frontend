import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tailorOnDemand } from "../app/api/lib/ccc-tailor";

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
});
