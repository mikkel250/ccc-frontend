import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clientSafeError,
  JD_MAX_CHARS,
  resolveCccFetchTimeoutMs,
  tailorOnDemand,
} from "../app/api/lib/ccc-tailor";
import { handleTailorPost } from "../app/api/lib/tailor-post";
import {
  DEFAULT_CCC_FETCH_TIMEOUT_MS,
  GENERIC_ERROR,
  INVALID_JSON,
  MAX_CCC_FETCH_TIMEOUT_MS,
  MISSING_ENV,
  TRUSTED_CCC_CLIENT_IP,
} from "../app/lib/tailor-constants";

function abortingFetch(): typeof fetch {
  return ((_input, init) =>
    new Promise((_, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing abort signal"));
        return;
      }
      const abort = () => {
        if (signal.reason !== undefined) {
          reject(signal.reason);
          return;
        }
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      };
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
    })) as typeof fetch;
}

describe("resolveCccFetchTimeoutMs", () => {
  it("clamps CCC_FETCH_TIMEOUT_MS below the route maxDuration", () => {
    assert.equal(
      resolveCccFetchTimeoutMs({}, { CCC_FETCH_TIMEOUT_MS: "999999" }),
      MAX_CCC_FETCH_TIMEOUT_MS
    );
    assert.equal(
      resolveCccFetchTimeoutMs({ timeoutMs: 20 }, { CCC_FETCH_TIMEOUT_MS: "999999" }),
      20
    );
    assert.equal(resolveCccFetchTimeoutMs({ timeoutMs: 999_999 }, {}), MAX_CCC_FETCH_TIMEOUT_MS);
    assert.equal(resolveCccFetchTimeoutMs({}, {}), DEFAULT_CCC_FETCH_TIMEOUT_MS);
    assert.ok(DEFAULT_CCC_FETCH_TIMEOUT_MS <= MAX_CCC_FETCH_TIMEOUT_MS);
  });
});

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
      assert.equal(result.error, MISSING_ENV);
      assert.equal(result.error.includes("secret"), false);
      assert.equal(result.error.toLowerCase().includes("key"), false);
    }
  });

  it("reads CCC_API_URL and TAILOR_API_KEY from process.env when deps omit them", async () => {
    const previousUrl = process.env.CCC_API_URL;
    const previousKey = process.env.TAILOR_API_KEY;
    process.env.CCC_API_URL = "http://ccc.test/";
    process.env.TAILOR_API_KEY = "env-secret-key-value";
    try {
      const result = await tailorOnDemand("Senior engineer JD", {
        fetchImpl: async (input, init) => {
          assert.equal(String(input), "http://ccc.test/api/tailor-cv");
          const headers = new Headers(init?.headers);
          assert.equal(headers.get("Authorization"), "Bearer env-secret-key-value");
          assert.equal(headers.get("x-forwarded-for"), TRUSTED_CCC_CLIENT_IP);
          return Response.json({ cv: "UEsDbA==", replyText: "Thanks." });
        },
      });
      assert.equal(result.ok, true);
    } finally {
      if (previousUrl === undefined) {
        delete process.env.CCC_API_URL;
      } else {
        process.env.CCC_API_URL = previousUrl;
      }
      if (previousKey === undefined) {
        delete process.env.TAILOR_API_KEY;
      } else {
        process.env.TAILOR_API_KEY = previousKey;
      }
    }
  });

  it("fails closed when process.env is unset and deps omit credentials", async () => {
    const previousUrl = process.env.CCC_API_URL;
    const previousKey = process.env.TAILOR_API_KEY;
    delete process.env.CCC_API_URL;
    delete process.env.TAILOR_API_KEY;
    try {
      const result = await tailorOnDemand("Senior engineer JD");
      assert.equal(result.ok, false);
      if (!result.ok) {
        assert.equal(result.status, 503);
        assert.equal(result.error, MISSING_ENV);
      }
    } finally {
      if (previousUrl === undefined) {
        delete process.env.CCC_API_URL;
      } else {
        process.env.CCC_API_URL = previousUrl;
      }
      if (previousKey === undefined) {
        delete process.env.TAILOR_API_KEY;
      } else {
        process.env.TAILOR_API_KEY = previousKey;
      }
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
        assert.equal(headers.get("x-forwarded-for"), TRUSTED_CCC_CLIENT_IP);
        assert.ok(init?.signal);
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

  it("always forwards TRUSTED_CCC_CLIENT_IP", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async (_input, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("x-forwarded-for"), TRUSTED_CCC_CLIENT_IP);
        assert.equal(headers.get("x-forwarded-for"), "127.0.0.1");
        return Response.json({ cv: "UEsDbA==", replyText: "Thanks." });
      },
    });
    assert.equal(result.ok, true);
  });

  it("maps CCC 401 to a client-safe error", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret",
      fetchImpl: async () => Response.json({ error: "Unauthorized" }, { status: 401 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 401);
      assert.equal(result.error, "Unauthorized");
    }
  });

  it("maps CCC 422 validation errors through", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () =>
        Response.json({ error: "Validation failed: job description is empty" }, { status: 422 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 422);
      assert.equal(result.error, "Validation failed: job description is empty");
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
      assert.equal(result.error, GENERIC_ERROR);
    }
  });

  it("does not leak the API key value from CCC error strings", async () => {
    const apiKey = "sk-live-abcdefghijklmnopqrstuvwxyz";
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey,
      fetchImpl: async () =>
        Response.json({ error: `Invalid token ${apiKey}` }, { status: 401 }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.includes(apiKey), false);
      assert.equal(result.error, GENERIC_ERROR);
    }
  });

  it("redacts truncated API key substrings of 8+ characters", () => {
    const apiKey = "sk-live-abcdefghijklmnopqrstuvwxyz";
    assert.equal(clientSafeError(`bad ${apiKey.slice(0, 12)} suffix`, apiKey), GENERIC_ERROR);
    assert.equal(clientSafeError("Validation failed: too short", apiKey), "Validation failed: too short");
  });

  it("redacts a short API key only when the full key is present", () => {
    const apiKey = "shortky";
    assert.equal(apiKey.length < 8, true);
    assert.equal(clientSafeError("failed shortky check", apiKey), GENERIC_ERROR);
    assert.equal(clientSafeError("failed shortk check", apiKey), "failed shortk check");
  });

  it("does not redact an unrelated seven-character key fragment", () => {
    const apiKey = "sk-live-abcdefghijklmnopqrstuvwxyz";
    const seven = apiKey.slice(0, 7);
    const eight = apiKey.slice(0, 8);
    assert.equal(seven.length, 7);
    assert.equal(eight.length, 8);
    assert.equal(clientSafeError(`bad ${seven} suffix`, apiKey), `bad ${seven} suffix`);
    assert.equal(clientSafeError(`bad ${eight} suffix`, apiKey), GENERIC_ERROR);
  });

  it("allows a JD of JD_MAX_CHARS and rejects JD_MAX_CHARS + 1 without fetching", async () => {
    let called = 0;
    const fetchImpl: typeof fetch = async () => {
      called += 1;
      return Response.json({ cv: "UEsDbA==", replyText: null });
    };
    const allowed = await tailorOnDemand("x".repeat(JD_MAX_CHARS), {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl,
    });
    assert.equal(allowed.ok, true);
    assert.equal(called, 1);

    const rejected = await tailorOnDemand("x".repeat(JD_MAX_CHARS + 1), {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl,
    });
    assert.equal(called, 1);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.status, 400);
    }
  });

  it("maps fetch rejection to 503", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () => {
        throw new Error("connect ECONNREFUSED");
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.equal(result.error, GENERIC_ERROR);
    }
  });

  it("maps CCC fetch abort to 504", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      timeoutMs: 20,
      fetchImpl: abortingFetch(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 504);
      assert.equal(result.error, GENERIC_ERROR);
    }
  });

  it("maps TimeoutError from CCC fetch to 504", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () => {
        const error = new Error("The operation was aborted due to timeout");
        error.name = "TimeoutError";
        throw error;
      },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 504);
      assert.equal(result.error, GENERIC_ERROR);
    }
  });

  it("maps 200 without cv to 502", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () => Response.json({ replyText: "Thanks." }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 502);
      assert.equal(result.error, GENERIC_ERROR);
    }
  });

  it("maps missing replyText to null", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () => Response.json({ cv: "UEsDbA==" }),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.replyText, null);
    }
  });

  it("maps whitespace replyText to null", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () => Response.json({ cv: "UEsDbA==", replyText: "   " }),
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.replyText, null);
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
    let forwarded: string | null = null;
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
        tailor: async (jobDescription, deps) =>
          tailorOnDemand(jobDescription, {
            ...deps,
            apiUrl: "http://ccc.test",
            apiKey: "secret-key-value",
            fetchImpl: async (_input, init) => {
              forwarded = new Headers(init?.headers).get("x-forwarded-for");
              return Response.json({ cv: "UEsDbA==", replyText: "Hi" });
            },
          }),
      }
    );
    assert.equal(response.status, 200);
    assert.equal(forwarded, TRUSTED_CCC_CLIENT_IP);
    const body = (await response.json()) as { cv?: string };
    assert.equal(body.cv, "UEsDbA==");
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
    assert.equal(body.error, INVALID_JSON);
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
