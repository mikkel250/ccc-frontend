import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function boardRequest(cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return new NextRequest("http://localhost:3000/board", { headers });
}

describe("middleware", () => {
  it("redirects unauthenticated board requests to login", () => {
    const response = middleware(boardRequest());
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/login");
  });

  it("allows board requests with a session cookie", () => {
    const response = middleware(
      boardRequest("better-auth.session_token=signed-session-value")
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
  });
});
