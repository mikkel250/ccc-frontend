import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { clientIpForCcc } from "../app/api/lib/client-ip";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/tailor", { headers });
}

describe("clientIpForCcc", () => {
  it("ignores inbound IP headers when the proxy topology is not trusted", () => {
    const ip = clientIpForCcc(
      requestWith({
        "x-forwarded-for": "203.0.113.9",
        "x-vercel-forwarded-for": "203.0.113.9",
        "x-real-ip": "203.0.113.9",
      }),
      {}
    );
    assert.equal(ip, "127.0.0.1");
  });

  it("uses the Vercel platform client IP when VERCEL=1", () => {
    const ip = clientIpForCcc(
      requestWith({
        "x-forwarded-for": "198.51.100.20",
        "x-vercel-forwarded-for": "203.0.113.9",
      }),
      { VERCEL: "1" }
    );
    assert.equal(ip, "203.0.113.9");
  });

  it("keeps distinct platform IPs distinct", () => {
    const env = { VERCEL: "1" };
    const first = clientIpForCcc(
      requestWith({ "x-vercel-forwarded-for": "203.0.113.9" }),
      env
    );
    const second = clientIpForCcc(
      requestWith({ "x-vercel-forwarded-for": "203.0.113.10" }),
      env
    );
    assert.equal(first, "203.0.113.9");
    assert.equal(second, "203.0.113.10");
    assert.notEqual(first, second);
  });

  it("takes the client address from a platform chain and rejects a non-IP", () => {
    assert.equal(
      clientIpForCcc(
        requestWith({ "x-vercel-forwarded-for": "2001:db8::1, 198.51.100.8" }),
        { VERCEL: "1" }
      ),
      "2001:db8::1"
    );
    assert.equal(
      clientIpForCcc(
        requestWith({ "x-vercel-forwarded-for": "not-an-ip" }),
        { VERCEL: "1" }
      ),
      "127.0.0.1"
    );
  });

  it("does not trust x-forwarded-for just because the process is on Vercel", () => {
    assert.equal(
      clientIpForCcc(requestWith({ "x-forwarded-for": "203.0.113.9" }), { VERCEL: "1" }),
      "127.0.0.1"
    );
  });

  it("trusts the platform header when CCC_TRUSTED_PROXY=vercel", () => {
    assert.equal(
      clientIpForCcc(requestWith({ "x-vercel-forwarded-for": "203.0.113.9" }), {
        CCC_TRUSTED_PROXY: "vercel",
      }),
      "203.0.113.9"
    );
  });

  it("stays on loopback when CCC_TRUSTED_PROXY disables or names an unknown topology", () => {
    const headers = { "x-vercel-forwarded-for": "203.0.113.9" };
    assert.equal(
      clientIpForCcc(requestWith(headers), { VERCEL: "1", CCC_TRUSTED_PROXY: "none" }),
      "127.0.0.1"
    );
    assert.equal(
      clientIpForCcc(requestWith(headers), { VERCEL: "1", CCC_TRUSTED_PROXY: "nginx" }),
      "127.0.0.1"
    );
  });
});
