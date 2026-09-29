import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST, maxDuration } from "../app/api/tailor/route";
import { readTailorJobDescription } from "../app/api/lib/read-json-body";
import {
  BODY_MAX_BYTES,
  BODY_TOO_LARGE,
  GENERIC_ERROR,
  INVALID_JSON,
  MAX_CCC_FETCH_TIMEOUT_MS,
  OPERATOR_TOKEN_HEADER,
  TAILOR_MAX_DURATION_SEC,
  TRUSTED_CCC_CLIENT_IP,
} from "../app/lib/tailor-constants";

function snapshotEnv(keys: string[]): () => void {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  return () => {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

describe("readTailorJobDescription", () => {
  it("rejects Content-Length over the cap with 413", async () => {
    const request = new Request("http://127.0.0.1/api/tailor", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "64",
      },
      body: JSON.stringify({ jobDescription: "hi" }),
    });
    const result = await readTailorJobDescription(request, 16);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 413);
      assert.equal(result.error, BODY_TOO_LARGE);
    }
  });

  it("rejects a body over the cap with 413", async () => {
    const request = new Request("http://127.0.0.1/api/tailor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobDescription: "abcdefghijklmnop" }),
    });
    const result = await readTailorJobDescription(request, 16);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 413);
    }
  });
});

describe("POST /api/tailor", () => {
  it("keeps maxDuration above the clamped CCC fetch timeout", () => {
    assert.equal(maxDuration, TAILOR_MAX_DURATION_SEC);
    assert.ok(MAX_CCC_FETCH_TIMEOUT_MS < maxDuration * 1000);
  });

  it("rejects a body over BODY_MAX_BYTES with 413 and does not call CCC", async () => {
    const restore = snapshotEnv(["OPERATOR_TOKEN", "NODE_ENV", "CCC_API_URL", "TAILOR_API_KEY"]);
    delete process.env.OPERATOR_TOKEN;
    process.env.NODE_ENV = "development";
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ cv: "UEsDbA==" });
    }) as typeof fetch;
    try {
      const response = await POST(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobDescription: "x".repeat(BODY_MAX_BYTES) }),
        })
      );
      assert.equal(called, false);
      assert.equal(response.status, 413);
      const body = (await response.json()) as { error?: string };
      assert.equal(body.error, BODY_TOO_LARGE);
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });

  it("returns 400 for malformed JSON", async () => {
    const restore = snapshotEnv(["OPERATOR_TOKEN", "NODE_ENV"]);
    delete process.env.OPERATOR_TOKEN;
    process.env.NODE_ENV = "development";
    try {
      const response = await POST(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{",
        })
      );
      assert.equal(response.status, 400);
      const body = (await response.json()) as { error?: string };
      assert.equal(body.error, INVALID_JSON);
    } finally {
      restore();
    }
  });

  it("returns 400 for a missing job description without calling CCC", async () => {
    const restore = snapshotEnv(["OPERATOR_TOKEN", "NODE_ENV", "CCC_API_URL", "TAILOR_API_KEY"]);
    delete process.env.OPERATOR_TOKEN;
    process.env.NODE_ENV = "development";
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ cv: "UEsDbA==" });
    }) as typeof fetch;
    try {
      const response = await POST(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobDescription: "   " }),
        })
      );
      assert.equal(called, false);
      assert.equal(response.status, 400);
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });

  it("maps a successful CCC response to cv and replyText", async () => {
    const restore = snapshotEnv(["OPERATOR_TOKEN", "NODE_ENV", "CCC_API_URL", "TAILOR_API_KEY"]);
    delete process.env.OPERATOR_TOKEN;
    process.env.NODE_ENV = "development";
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      Response.json({
        cv: "UEsDbA==",
        replyText: "Thanks for reaching out.",
        curatedJson: { hidden: true },
      })) as typeof fetch;
    try {
      const response = await POST(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
        })
      );
      assert.equal(response.status, 200);
      const body = (await response.json()) as Record<string, unknown>;
      assert.equal(body.cv, "UEsDbA==");
      assert.equal(body.replyText, "Thanks for reaching out.");
      assert.equal("curatedJson" in body, false);
      assert.equal(JSON.stringify(body).includes("secret-key-value"), false);
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });

  it("rejects unauthorized production requests before calling CCC", async () => {
    const restore = snapshotEnv(["OPERATOR_TOKEN", "NODE_ENV", "CCC_API_URL", "TAILOR_API_KEY"]);
    process.env.OPERATOR_TOKEN = "correct-operator-token";
    process.env.NODE_ENV = "production";
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ cv: "UEsDbA==" });
    }) as typeof fetch;
    try {
      const response = await POST(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
        })
      );
      assert.equal(called, false);
      assert.equal(response.status, 401);
      const body = (await response.json()) as { error?: string };
      assert.equal(body.error, GENERIC_ERROR);
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });

  it("accepts a matching operator token in production", async () => {
    const restore = snapshotEnv(["OPERATOR_TOKEN", "NODE_ENV", "CCC_API_URL", "TAILOR_API_KEY"]);
    process.env.OPERATOR_TOKEN = "correct-operator-token";
    process.env.NODE_ENV = "production";
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => Response.json({ cv: "UEsDbA==", replyText: null })) as typeof fetch;
    try {
      const response = await POST(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            [OPERATOR_TOKEN_HEADER]: "correct-operator-token",
          },
          body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
        })
      );
      assert.equal(response.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });

  it("forwards TRUSTED_CCC_CLIENT_IP and ignores inbound proxy headers", async () => {
    const restore = snapshotEnv(["OPERATOR_TOKEN", "NODE_ENV", "CCC_API_URL", "TAILOR_API_KEY", "VERCEL"]);
    delete process.env.OPERATOR_TOKEN;
    process.env.NODE_ENV = "development";
    process.env.VERCEL = "1";
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    let forwarded: string | null = null;
    globalThis.fetch = (async (_input, init) => {
      forwarded = new Headers(init?.headers).get("x-forwarded-for");
      return Response.json({ cv: "UEsDbA==", replyText: null });
    }) as typeof fetch;
    try {
      const response = await POST(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.10, 10.0.0.1",
            "x-real-ip": "198.51.100.20",
            "x-vercel-forwarded-for": "192.0.2.40",
          },
          body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
        })
      );
      assert.equal(response.status, 200);
      assert.equal(forwarded, TRUSTED_CCC_CLIENT_IP);
      assert.equal(forwarded, "127.0.0.1");
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });

  it("maps CCC 401 and 403 to 502", async () => {
    const restore = snapshotEnv(["OPERATOR_TOKEN", "NODE_ENV", "CCC_API_URL", "TAILOR_API_KEY"]);
    delete process.env.OPERATOR_TOKEN;
    process.env.NODE_ENV = "development";
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    try {
      for (const upstream of [401, 403]) {
        globalThis.fetch = (async () =>
          Response.json({ error: "Unauthorized" }, { status: upstream })) as typeof fetch;
        const response = await POST(
          new Request("http://127.0.0.1/api/tailor", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
          })
        );
        assert.equal(response.status, 502);
        const body = (await response.json()) as { error?: string };
        assert.equal(body.error, "Unauthorized");
      }
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });
});
