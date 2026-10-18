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

describe("board middleware", () => {
  it("redirects to login when there is no session cookie", () => {
    const response = middleware(boardRequest());
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/login");
  });

  it("allows the request when a Better Auth session cookie is present", () => {
    const response = middleware(
      boardRequest("better-auth.session_token=opaque-session-value")
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);
  });
});
