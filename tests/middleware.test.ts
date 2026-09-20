import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("board middleware", () => {
  it("redirects unauthenticated visitors to login", () => {
    const request = new NextRequest("http://localhost:3000/board");
    const response = middleware(request);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/login");
  });

  it("allows the request when a session cookie is present", () => {
    const request = new NextRequest("http://localhost:3000/board", {
      headers: {
        cookie: "better-auth.session_token=opaque-session-value",
      },
    });
    const response = middleware(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });
});
