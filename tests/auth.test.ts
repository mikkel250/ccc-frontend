import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { auth } from "../lib/auth";

describe("lib/auth", () => {
  it("wires the first-operator registration gate into the real auth config", () => {
    const ids = auth.options.plugins?.map((plugin) => plugin.id);
    assert.ok(ids?.includes("first-operator-registration"));
  });
});
