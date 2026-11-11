import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("CI workflow", () => {
  it("gates pull requests and main with lint, typecheck, and tests", () => {
    const yaml = read(".github/workflows/ci.yml");

    assert.match(yaml, /\bpull_request:/);
    assert.match(yaml, /\bpush:/);
    assert.match(yaml, /^\s*-\s+main\s*$/m);
    assert.match(yaml, /permissions:\s*\n\s+contents:\s*read/);
    assert.match(yaml, /runs-on:\s*ubuntu-latest/);
    assert.match(yaml, /persist-credentials:\s*false/);

    assert.match(yaml, /uses:\s*actions\/checkout@[0-9a-f]{40}/);
    assert.match(yaml, /uses:\s*actions\/setup-node@[0-9a-f]{40}/);
    assert.match(yaml, /node-version-file:\s*\.nvmrc/);
    assert.match(yaml, /cache:\s*npm/);

    assert.match(yaml, /run:\s*npm ci\b/);
    assert.match(yaml, /run:\s*npm run lint\b/);
    assert.match(yaml, /run:\s*npm run typecheck\b/);
    assert.match(yaml, /run:\s*npm test\b/);

    assert.doesNotMatch(yaml, /\$\{\{\s*secrets\./);
    assert.doesNotMatch(yaml, /TAILOR_API_KEY/);
    assert.doesNotMatch(yaml, /BETTER_AUTH_SECRET/);
  });

  it("sets a loopback DATABASE_URL so prisma generate does not need secrets", () => {
    const yaml = read(".github/workflows/ci.yml");
    assert.match(yaml, /DATABASE_URL:\s*postgresql:\/\/\S+@127\.0\.0\.1:5432\//);
  });
});

describe("package scripts", () => {
  it("exposes typecheck as tsc --noEmit", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    assert.equal(pkg.scripts?.typecheck, "tsc --noEmit");
  });
});
