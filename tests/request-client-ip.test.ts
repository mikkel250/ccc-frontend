import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { requestClientIp } from "../app/api/lib/request-client-ip";

function requestWithHeaders(headers: Record<string, string>): Request {
  return new Request("http://127.0.0.1/api/tailor", {
    method: "POST",
    headers,
  });
}

describe("requestClientIp", () => {
  it("returns the first x-forwarded-for hop after trimming", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "  203.0.113.10  , 10.0.0.1",
    });
    assert.equal(requestClientIp(request), "203.0.113.10");
  });

  it("unwraps a bracketed IPv6 address", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "[2001:db8::1]",
    });
    assert.equal(requestClientIp(request), "2001:db8::1");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing or invalid", () => {
    const missing = requestWithHeaders({ "x-real-ip": "198.51.100.20" });
    assert.equal(requestClientIp(missing), "198.51.100.20");

    const invalid = requestWithHeaders({
      "x-forwarded-for": "not-an-ip",
      "x-real-ip": "198.51.100.20",
    });
    assert.equal(requestClientIp(invalid), "198.51.100.20");
  });

  it("rejects unknown values and missing headers", () => {
    assert.equal(requestClientIp(requestWithHeaders({ "x-forwarded-for": "unknown" })), undefined);
    assert.equal(requestClientIp(requestWithHeaders({ "x-forwarded-for": "not-an-ip" })), undefined);
    assert.equal(requestClientIp(requestWithHeaders({})), undefined);
  });
});
