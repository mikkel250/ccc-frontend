import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as PackageJson;
}

function parseVersion(raw: string): [number, number, number] {
  const match = raw.trim().replace(/^[~^]/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  assert.ok(match, `unparseable version: ${raw}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function gte(raw: string, floor: [number, number, number]): boolean {
  const version = parseVersion(raw);
  for (let i = 0; i < 3; i += 1) {
    if (version[i] > floor[i]) {
      return true;
    }
    if (version[i] < floor[i]) {
      return false;
    }
  }
  return true;
}

function sameMinorAtLeast(
  raw: string,
  major: number,
  minor: number,
  patchFloor: number
): boolean {
  const [parsedMajor, parsedMinor] = parseVersion(raw);
  return parsedMajor === major && parsedMinor === minor && gte(raw, [major, minor, patchFloor]);
}

describe("patched advisory floors", () => {
  const pkg = readPackageJson();

  it("pins next and eslint-config-next to a patched 15.5 release", () => {
    const next = pkg.dependencies?.next ?? "";
    const eslintConfigNext = pkg.devDependencies?.["eslint-config-next"] ?? "";
    assert.equal(
      sameMinorAtLeast(next, 15, 5, 29),
      true,
      `next ${next} must be 15.5.29 or a later 15.5.x`
    );
    assert.equal(
      sameMinorAtLeast(eslintConfigNext, 15, 5, 29),
      true,
      `eslint-config-next ${eslintConfigNext} must be 15.5.29 or a later 15.5.x`
    );
  });

  it("pins better-auth packages to a patched 1.7 release", () => {
    const betterAuth = pkg.dependencies?.["better-auth"] ?? "";
    const memoryAdapter = pkg.devDependencies?.["@better-auth/memory-adapter"] ?? "";
    assert.equal(
      sameMinorAtLeast(betterAuth, 1, 7, 21),
      true,
      `better-auth ${betterAuth} must be 1.7.21 or a later 1.7.x`
    );
    assert.equal(
      sameMinorAtLeast(memoryAdapter, 1, 7, 21),
      true,
      `@better-auth/memory-adapter ${memoryAdapter} must be 1.7.21 or a later 1.7.x`
    );
  });

  it("pins zod at or above the collection-DoS patch", () => {
    const zod = pkg.dependencies?.zod ?? "";
    assert.equal(gte(zod, [4, 6, 6]), true, `zod ${zod} must be >= 4.6.6`);
  });
});

describe("Dependabot", () => {
  it("watches npm weekly at the repo root", () => {
    const config = readFileSync(join(process.cwd(), ".github/dependabot.yml"), "utf8");
    assert.match(config, /^version:\s*2\s*$/m);
    assert.match(config, /package-ecosystem:\s*npm/);
    assert.match(config, /directory:\s*"\/"/);
    assert.match(config, /interval:\s*weekly/);
  });
});

