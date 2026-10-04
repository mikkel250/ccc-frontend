import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("board middleware", () => {
  it("redirects unauthenticated requests to login", () => {
    const request = new NextRequest("http://localhost:3000/board");
    const response = middleware(request);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/login");
  });

  it("allows requests with a better-auth session cookie", () => {
    const request = new NextRequest("http://localhost:3000/board/kanban", {
      headers: { cookie: "better-auth.session_token=session-token" },
    });
    const response = middleware(request);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });
});
