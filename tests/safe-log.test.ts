import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatSafeLog, safeErrorFields } from "../lib/safe-log";

const now = new Date("2026-11-13T09:00:00.000Z");
const env = {
  TAILOR_API_KEY: "sk-live-env-tailor-key",
  BETTER_AUTH_SECRET: "better-auth-env-secret",
  DATABASE_URL: "postgresql://ccc:supersecret@127.0.0.1:5432/ccc_frontend",
};

function parsed(event: Parameters<typeof formatSafeLog>[0]) {
  return JSON.parse(formatSafeLog(event, now, env)) as Record<string, unknown>;
}

describe("formatSafeLog", () => {
  it("redacts camelCase credential keys and keeps boolean presence flags", () => {
    const line = formatSafeLog(
      {
        level: "error",
        event: "camel-creds",
        accessToken: "opaque-access-token-value",
        sessionToken: "opaque-session-token-value",
        clientSecret: "opaque-client-secret-value",
        hasApiKey: true,
      },
      now,
      env
    );
    assert.equal(line.includes("opaque-access-token-value"), false);
    assert.equal(line.includes("opaque-session-token-value"), false);
    assert.equal(line.includes("opaque-client-secret-value"), false);
    const body = JSON.parse(line) as Record<string, unknown>;
    assert.equal(body.accessToken, "[redacted]");
    assert.equal(body.sessionToken, "[redacted]");
    assert.equal(body.clientSecret, "[redacted]");
    assert.equal(body.hasApiKey, true);
  });

  it("keeps boolean env presence flags", () => {
    const body = parsed({
      level: "error",
      event: "ccc.missing_env",
      hasApiUrl: false,
      hasApiKey: true,
    });
    assert.equal(body.hasApiUrl, false);
    assert.equal(body.hasApiKey, true);
  });

  it("emits one JSON object with ts, level, and event", () => {
    const line = formatSafeLog({ level: "error", event: "ccc.fetch_failed", status: 503 }, now, env);
    assert.equal(line.includes("\n"), false);
    assert.deepEqual(JSON.parse(line), {
      ts: "2026-11-13T09:00:00.000Z",
      level: "error",
      event: "ccc.fetch_failed",
      status: 503,
    });
  });

  it("redacts tokens, cookies, CV text, job descriptions, and API keys by field name", () => {
    const line = formatSafeLog(
      {
        level: "error",
        event: "leak-check",
        jobDescription: "Senior engineer JD that must never be logged",
        cv: "UEsDbA==cvbytes",
        replyText: "Thanks for reaching out.",
        authorization: "Bearer sk-live-header",
        cookie: "better-auth.session_token=abc",
        apiKey: "sk-live-field",
        token: "session-token-value",
        TAILOR_API_KEY: "sk-live-named",
        sessionId: "user-a",
        status: 502,
      },
      now,
      env
    );
    assert.equal(line.includes("Senior engineer JD"), false);
    assert.equal(line.includes("UEsDbA=="), false);
    assert.equal(line.includes("Thanks for reaching out."), false);
    assert.equal(line.includes("sk-live-header"), false);
    assert.equal(line.includes("session_token=abc"), false);
    assert.equal(line.includes("sk-live-field"), false);
    assert.equal(line.includes("session-token-value"), false);
    assert.equal(line.includes("sk-live-named"), false);
    assert.equal(line.includes("user-a"), false);
    const body = JSON.parse(line) as Record<string, unknown>;
    assert.equal(body.jobDescription, "[redacted]");
    assert.equal(body.cv, "[redacted]");
    assert.equal(body.replyText, "[redacted]");
    assert.equal(body.authorization, "[redacted]");
    assert.equal(body.cookie, "[redacted]");
    assert.equal(body.apiKey, "[redacted]");
    assert.equal(body.token, "[redacted]");
    assert.equal(body.TAILOR_API_KEY, "[redacted]");
    assert.equal(body.sessionId, "[redacted]");
    assert.equal(body.status, 502);
  });

  it("redacts nested sensitive keys and Bearer / JWT / env secret substrings", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature";
    const line = formatSafeLog(
      {
        level: "warn",
        event: "nested",
        headers: {
          Authorization: `Bearer ${env.TAILOR_API_KEY}`,
          Cookie: "better-auth.session_token=xyz",
          Accept: "application/json",
        },
        errorMessage: `upstream ${env.BETTER_AUTH_SECRET} ${jwt} ${env.DATABASE_URL}`,
      },
      now,
      env
    );
    assert.equal(line.includes(env.TAILOR_API_KEY), false);
    assert.equal(line.includes(env.BETTER_AUTH_SECRET), false);
    assert.equal(line.includes(env.DATABASE_URL), false);
    assert.equal(line.includes("session_token=xyz"), false);
    assert.equal(line.includes(jwt), false);
    const body = JSON.parse(line) as {
      headers: { Authorization: string; Cookie: string; Accept: string };
      errorMessage: string;
    };
    assert.equal(body.headers.Authorization, "[redacted]");
    assert.equal(body.headers.Cookie, "[redacted]");
    assert.equal(body.headers.Accept, "application/json");
    assert.equal(body.errorMessage.includes("[TAILOR_API_KEY redacted]"), false);
    assert.match(body.errorMessage, /\[BETTER_AUTH_SECRET redacted\]/);
    assert.match(body.errorMessage, /\[token redacted\]/);
    assert.match(body.errorMessage, /\[DATABASE_URL redacted\]/);
  });

  it("converts Error values to name and redacted message without a stack", () => {
    const error = new Error(`Bearer ${env.TAILOR_API_KEY}\n    at tailor (ccc-tailor.ts:1:1)`);
    error.stack = `Error: Bearer ${env.TAILOR_API_KEY}\n    at tailor`;
    const body = parsed({
      level: "error",
      event: "ccc.fetch_failed",
      error,
    });
    const serialized = JSON.stringify(body);
    assert.equal(serialized.includes(env.TAILOR_API_KEY), false);
    assert.equal(serialized.includes("ccc-tailor.ts"), false);
    assert.equal(body.error && typeof body.error === "object" && "stack" in body.error, false);
    assert.deepEqual(body.error, {
      name: "Error",
      message: "Bearer [redacted]",
    });
  });
});

describe("safeErrorFields", () => {
  it("extracts name and a redacted message from thrown values", () => {
    const fromError = safeErrorFields(new Error(`Bearer ${env.TAILOR_API_KEY}`), env);
    assert.equal(fromError.errorName, "Error");
    assert.equal(fromError.errorMessage, "Bearer [redacted]");
    assert.equal(fromError.errorMessage.includes(env.TAILOR_API_KEY), false);

    const fromTimeout = safeErrorFields(Object.assign(new Error("aborted"), { name: "AbortError" }), env);
    assert.equal(fromTimeout.errorName, "AbortError");

    const fromString = safeErrorFields("raw-failure", env);
    assert.equal(fromString.errorName, "Error");
    assert.equal(fromString.errorMessage, "raw-failure");

    const fromNull = safeErrorFields(null, env);
    assert.equal(fromNull.errorName, "Error");
    assert.equal(fromNull.errorMessage, "unknown");
  });
});
