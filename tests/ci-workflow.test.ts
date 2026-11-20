import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

describe("CI workflow", () => {
  it("gates pull requests and main with lint, typecheck, tests, schema validation, and build", () => {
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
    assert.match(yaml, /run:\s*npx prisma validate\b/);
    assert.match(yaml, /run:\s*npm run lint\b/);
    assert.match(yaml, /run:\s*npm run typecheck\b/);
    assert.match(yaml, /run:\s*npm test\b/);
    assert.match(yaml, /run:\s*npm run build\b/);
    assert.match(yaml, /BETTER_AUTH_URL:\s*http:\/\/127\.0\.0\.1:3000/);
    assert.match(yaml, /BETTER_AUTH_SECRET:\s*ci-build-only-not-a-real-secret-0001/);

    assert.doesNotMatch(yaml, /\$\{\{\s*secrets\./);
    assert.doesNotMatch(yaml, /TAILOR_API_KEY/);
  });

  it("sets a loopback DATABASE_URL so prisma generate does not need secrets", () => {
    const yaml = read(".github/workflows/ci.yml");
    assert.match(yaml, /DATABASE_URL:\s*postgresql:\/\/\S+@127\.0\.0\.1:5432\//);
  });
});

describe("CI database checks", () => {
  it("runs a Postgres service, applies migrations, checks drift, and runs test:db", () => {
    const yaml = read(".github/workflows/ci.yml");
    const compose = read("docker-compose.yml");

    const composeImage = compose.match(/image:\s*(postgres:\S+)/)?.[1];
    assert.ok(composeImage);
    assert.match(yaml, new RegExp(`image:\\s*${composeImage}\\b`));
    assert.match(yaml, /pg_isready/);

    const steps = ["npx prisma migrate deploy", "npx prisma migrate diff", "npm run test:db"].map(
      (cmd) => yaml.indexOf(`run: ${cmd}`)
    );
    assert.ok(steps.every((i) => i >= 0));
    assert.deepEqual([...steps].sort((a, b) => a - b), steps);
    assert.match(yaml, /migrate diff\b[^\n]*--from-url[^\n]*--to-schema-datamodel[^\n]*--exit-code/);
  });
});

describe("package scripts", () => {
  it("exposes typecheck as tsc --noEmit", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts?: Record<string, string> };
    assert.equal(pkg.scripts?.typecheck, "tsc --noEmit");
  });
});
