import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clientSafeError,
  JD_MAX_CHARS,
  resolveCccFetchTimeoutMs,
  tailorOnDemand,
} from "../app/api/lib/ccc-tailor";
import {
  DEFAULT_CCC_FETCH_TIMEOUT_MS,
  GENERIC_ERROR,
  MAX_CCC_FETCH_TIMEOUT_MS,
  MISSING_ENV,
  TRUSTED_CCC_CLIENT_IP,
} from "../app/lib/tailor-constants";

function abortedJsonResponse(status: number, name: "AbortError" | "TimeoutError"): Response {
  const stream = new ReadableStream({
    start(controller) {
      const message =
        name === "TimeoutError"
          ? "The operation was aborted due to timeout"
          : "The operation was aborted";
      controller.error(new DOMException(message, name));
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "application/json" },
  });
}

function abortingFetch(): typeof fetch {
  return ((_input, init) =>
    new Promise((_, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("missing abort signal"));
        return;
      }
      // AbortSignal.timeout uses an unref'd timer, so a fetch that only waits
      // on abort would let the test runner think the event loop is empty.
      const keepAlive = setInterval(() => undefined, 20);
      const abort = () => {
        clearInterval(keepAlive);
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

  it("rounds fractional timeouts to integers AbortSignal.timeout accepts", () => {
    assert.equal(resolveCccFetchTimeoutMs({}, { CCC_FETCH_TIMEOUT_MS: "90000.5" }), 90_001);
    assert.equal(resolveCccFetchTimeoutMs({ timeoutMs: 40.5 }, {}), 41);
    assert.equal(resolveCccFetchTimeoutMs({ timeoutMs: 0.4 }, {}), DEFAULT_CCC_FETCH_TIMEOUT_MS);
    assert.equal(
      Number.isInteger(resolveCccFetchTimeoutMs({}, { CCC_FETCH_TIMEOUT_MS: "90000.5" })),
      true
    );
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
    const suppliedIp = { clientIp: "203.0.113.10" };
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      ...suppliedIp,
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

  it("maps an allowlisted CCC 422 message and hides other upstream text", async () => {
    const listed = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () =>
        Response.json({ error: "Curator output was not valid JSON" }, { status: 422 }),
    });
    assert.equal(listed.ok, false);
    if (!listed.ok) {
      assert.equal(listed.status, 422);
      assert.equal(listed.error, "Curator output was not valid JSON");
    }

    const leaked = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () =>
        Response.json(
          {
            error:
              "Validation failed: job description is empty at http://10.0.0.8/internal\n    at tailor (pipeline.ts:1:1)",
          },
          { status: 422 }
        ),
    });
    assert.equal(leaked.ok, false);
    if (!leaked.ok) {
      assert.equal(leaked.status, 422);
      assert.equal(leaked.error, GENERIC_ERROR);
      assert.equal(leaked.error.includes("10.0.0.8"), false);
      assert.equal(leaked.error.includes("job description"), false);
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

  it("returns only allowlisted CCC errors", () => {
    assert.equal(clientSafeError("Unauthorized"), "Unauthorized");
    assert.equal(clientSafeError("  AI service error. Please try again.  "), "AI service error. Please try again.");
    assert.equal(clientSafeError("bad sk-live-abcdefghijklmnopqrstuvwxyz suffix"), GENERIC_ERROR);
    assert.equal(
      clientSafeError("Senior React engineer. Requirements: TypeScript, React, Node.js."),
      GENERIC_ERROR
    );
    assert.equal(clientSafeError("operator@example.com cannot tailor"), GENERIC_ERROR);
    assert.equal(clientSafeError("Validation failed: too short"), GENERIC_ERROR);
    assert.equal(clientSafeError(""), GENERIC_ERROR);
    assert.equal(clientSafeError(12), GENERIC_ERROR);
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

  it("maps non-error and non-abort failures to a generic status", async () => {
    const failures = [
      null,
      "raw-failure",
      { message: "raw-failure" },
      { name: "TypeError", message: "raw-failure" },
    ];
    for (const failure of failures) {
      const fetched = await tailorOnDemand("Senior engineer JD", {
        apiUrl: "http://ccc.test",
        apiKey: "secret-key-value",
        fetchImpl: async () => {
          throw failure;
        },
      });
      assert.equal(fetched.ok, false);
      if (!fetched.ok) {
        assert.equal(fetched.status, 503);
        assert.equal(fetched.error, GENERIC_ERROR);
        assert.equal(fetched.error.includes("raw-failure"), false);
      }

      const parsed = await tailorOnDemand("Senior engineer JD", {
        apiUrl: "http://ccc.test",
        apiKey: "secret-key-value",
        fetchImpl: async () => {
          const response = new Response("not-json", {
            status: 200,
            headers: { "content-type": "application/json" },
          });
          response.json = async () => {
            throw failure;
          };
          return response;
        },
      });
      assert.equal(parsed.ok, false);
      if (!parsed.ok) {
        assert.equal(parsed.status, 502);
        assert.equal(parsed.error, GENERIC_ERROR);
        assert.equal(parsed.error.includes("raw-failure"), false);
      }
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

  it("fetches when the timeout is a positive fraction", async () => {
    let called = false;
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      timeoutMs: 40.5,
      fetchImpl: async () => {
        called = true;
        return Response.json({ cv: "UEsDbA==", replyText: null });
      },
    });
    assert.equal(called, true);
    assert.equal(result.ok, true);
  });

  it("maps a stalled 200 JSON body to 504", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () => abortedJsonResponse(200, "TimeoutError"),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 504);
      assert.equal(result.error, GENERIC_ERROR);
    }
  });

  it("maps a stalled error JSON body to 504", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () => abortedJsonResponse(422, "AbortError"),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 504);
      assert.equal(result.error, GENERIC_ERROR);
    }
  });

  it("maps malformed 200 JSON to 502", async () => {
    const result = await tailorOnDemand("Senior engineer JD", {
      apiUrl: "http://ccc.test",
      apiKey: "secret-key-value",
      fetchImpl: async () =>
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 502);
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
