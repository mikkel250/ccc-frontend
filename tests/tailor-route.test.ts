import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { maxDuration } from "../app/api/tailor/route";
import { handleTailorPost } from "../app/api/lib/tailor-post";
import { readTailorJobDescription } from "../app/api/lib/read-json-body";
import {
  BODY_MAX_BYTES,
  BODY_READ_TIMEOUT,
  BODY_READ_TIMEOUT_MS,
  BODY_TOO_LARGE,
  INVALID_JSON,
  MAX_CCC_FETCH_TIMEOUT_MS,
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

const signedIn = { getSessionUserId: async () => "user-a" as string | null };

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

  it("reads a complete body inside the deadline", async () => {
    const request = new Request("http://127.0.0.1/api/tailor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobDescription: "hello" }),
    });
    const result = await readTailorJobDescription(request, 1024, 30);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.jobDescription, "hello");
    }
  });

  it("returns 408 when the body stalls after a partial chunk", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('{"jobDescription":"ab'));
      },
    });
    const request = new Request("http://127.0.0.1/api/tailor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: stream,
      duplex: "half",
    });
    const result = await Promise.race([
      readTailorJobDescription(request, 1024, 30),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("body read stayed open")), 400);
      }),
    ]);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 408);
      assert.equal(result.error, BODY_READ_TIMEOUT);
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
    assert.ok(BODY_READ_TIMEOUT_MS < maxDuration * 1000);
  });

  it("rejects a body over BODY_MAX_BYTES with 413 and does not call CCC", async () => {
    const restore = snapshotEnv(["CCC_API_URL", "TAILOR_API_KEY"]);
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    let called = false;
    try {
      const response = await handleTailorPost(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobDescription: "x".repeat(BODY_MAX_BYTES) }),
        }),
        {
          ...signedIn,
          tailor: async () => {
            called = true;
            return { ok: true, cv: "UEsDbA==", replyText: null };
          },
        }
      );
      assert.equal(called, false);
      assert.equal(response.status, 413);
      const body = (await response.json()) as { error?: string };
      assert.equal(body.error, BODY_TOO_LARGE);
    } finally {
      restore();
    }
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await handleTailorPost(
      new Request("http://127.0.0.1/api/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      signedIn
    );
    assert.equal(response.status, 400);
    const body = (await response.json()) as { error?: string };
    assert.equal(body.error, INVALID_JSON);
  });

  it("returns 400 for a missing job description without calling CCC", async () => {
    const restore = snapshotEnv(["CCC_API_URL", "TAILOR_API_KEY"]);
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    let called = false;
    globalThis.fetch = (async () => {
      called = true;
      return Response.json({ cv: "UEsDbA==" });
    }) as typeof fetch;
    try {
      const response = await handleTailorPost(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobDescription: "   " }),
        }),
        signedIn
      );
      assert.equal(called, false);
      assert.equal(response.status, 400);
    } finally {
      globalThis.fetch = originalFetch;
      restore();
    }
  });

  it("maps a successful CCC response to cv and replyText", async () => {
    const restore = snapshotEnv(["CCC_API_URL", "TAILOR_API_KEY"]);
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
      const response = await handleTailorPost(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
        }),
        signedIn
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

  it("returns 401 without a session and does not call CCC", async () => {
    let called = false;
    const response = await handleTailorPost(
      new Request("http://127.0.0.1/api/tailor", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
      }),
      {
        getSessionUserId: async () => null,
        tailor: async () => {
          called = true;
          return { ok: true, cv: "UEsDbA==", replyText: null };
        },
      }
    );
    assert.equal(called, false);
    assert.equal(response.status, 401);
  });

  it("forwards TRUSTED_CCC_CLIENT_IP and ignores inbound proxy headers", async () => {
    const restore = snapshotEnv(["CCC_API_URL", "TAILOR_API_KEY", "VERCEL"]);
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
      const response = await handleTailorPost(
        new Request("http://127.0.0.1/api/tailor", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.10, 10.0.0.1",
            "x-real-ip": "198.51.100.20",
            "x-vercel-forwarded-for": "192.0.2.40",
          },
          body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
        }),
        signedIn
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
    const restore = snapshotEnv(["CCC_API_URL", "TAILOR_API_KEY"]);
    process.env.CCC_API_URL = "http://ccc.test";
    process.env.TAILOR_API_KEY = "secret-key-value";
    const originalFetch = globalThis.fetch;
    try {
      for (const upstream of [401, 403]) {
        globalThis.fetch = (async () =>
          Response.json({ error: "Unauthorized" }, { status: upstream })) as typeof fetch;
        const response = await handleTailorPost(
          new Request("http://127.0.0.1/api/tailor", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jobDescription: "Senior engineer JD" }),
          }),
          signedIn
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
