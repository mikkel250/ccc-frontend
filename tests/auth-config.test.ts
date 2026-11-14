import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveBetterAuthTrustedOrigins,
  resolveBetterAuthUrl,
} from "../lib/auth-config";

describe("resolveBetterAuthUrl", () => {
  it("requires BETTER_AUTH_URL in production", () => {
    assert.throws(
      () => resolveBetterAuthUrl({ NODE_ENV: "production" }),
      /BETTER_AUTH_URL is required/
    );
  });

  it("defaults to loopback in non-production when unset", () => {
    assert.equal(resolveBetterAuthUrl({ NODE_ENV: "development" }), "http://127.0.0.1:3000");
  });

  it("strips trailing slashes", () => {
    assert.equal(
      resolveBetterAuthUrl({
        NODE_ENV: "development",
        BETTER_AUTH_URL: "http://127.0.0.1:3000/",
      }),
      "http://127.0.0.1:3000"
    );
  });
});

describe("resolveBetterAuthTrustedOrigins", () => {
  it("includes localhost and 127.0.0.1 loopback aliases", () => {
    assert.deepEqual(resolveBetterAuthTrustedOrigins("http://127.0.0.1:3000"), [
      "http://127.0.0.1:3000",
      "http://localhost:3000",
    ]);
    assert.deepEqual(resolveBetterAuthTrustedOrigins("http://localhost:3000"), [
      "http://localhost:3000",
      "http://127.0.0.1:3000",
    ]);
  });
});
