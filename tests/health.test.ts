import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../middleware";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

function envKeysFromExample(source: string): string[] {
  const keys = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*#?\s*([A-Z][A-Z0-9_]*)=/);
    if (match) {
      keys.add(match[1]);
    }
  }
  return [...keys].sort();
}

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

describe("GET /api/health", () => {
  const secrets = {
    TAILOR_API_KEY: "health-test-tailor-key-9f3a",
    BETTER_AUTH_SECRET: "health-test-better-auth-secret-9f3a",
    DATABASE_URL: "postgresql://ccc:health-test-db-secret-9f3a@127.0.0.1:5432/ccc_frontend",
  };

  it("returns 200 JSON { ok: true } with Cache-Control no-store and no cookies", async () => {
    const restore = snapshotEnv(Object.keys(secrets));
    Object.assign(process.env, secrets);
    try {
      const { GET } = await import("../app/api/health/route");
      const response = await GET();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("cache-control") ?? "", /no-store/i);
      assert.match(response.headers.get("content-type") ?? "", /application\/json/);
      assert.deepEqual(await response.json(), { ok: true });
    } finally {
      restore();
    }
  });

  it("does not leak env secrets in the body or headers", async () => {
    const restore = snapshotEnv(Object.keys(secrets));
    Object.assign(process.env, secrets);
    try {
      const { GET } = await import("../app/api/health/route");
      const response = await GET();
      const body = await response.text();
      const headerBlob = [...response.headers.entries()].flat().join(" ");
      const haystack = `${response.status} ${body} ${headerBlob}`;
      for (const value of Object.values(secrets)) {
        assert.equal(haystack.includes(value), false, `leaked ${value}`);
      }
    } finally {
      restore();
    }
  });
});

describe("health is unauthenticated", () => {
  it("keeps middleware matcher on pages so /api/health is not session-gated", () => {
    assert.deepEqual(config.matcher, ["/", "/board", "/board/:path*"]);
    assert.equal(
      config.matcher.some((pattern) => pattern.includes("api")),
      false
    );
  });
});

describe("production env runbook", () => {
  it("names every catalogued env var, required vs optional, default, and missing effect", () => {
    const exampleKeys = envKeysFromExample(read(".env.example"));
    assert.ok(exampleKeys.includes("CCC_API_URL"));
    assert.ok(exampleKeys.includes("TAILOR_API_KEY"));
    assert.ok(exampleKeys.includes("DATABASE_URL"));
    assert.ok(exampleKeys.includes("BETTER_AUTH_SECRET"));
    assert.ok(exampleKeys.includes("BETTER_AUTH_URL"));

    const runbook = read("docs/ops/production-env.md");
    for (const key of [...exampleKeys, "NODE_ENV"]) {
      assert.match(runbook, new RegExp(`\\b${key}\\b`), `runbook missing ${key}`);
    }
    assert.match(runbook, /required/i);
    assert.match(runbook, /optional/i);
    assert.match(runbook, /default/i);
    assert.match(runbook, /missing/i);
    assert.match(runbook, /\/api\/health/);
    assert.match(runbook, /NEXT_PUBLIC_/);
    assert.match(runbook, /never|do not prefix/i);
  });
});
