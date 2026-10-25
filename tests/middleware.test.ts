import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware, config } from "../middleware";

describe("board middleware", () => {
  it("redirects unauthenticated requests to /login", () => {
    const response = middleware(new NextRequest("http://localhost:3000/board"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/login");
  });

  it("allows requests that carry a session cookie", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/board", {
        headers: { cookie: "better-auth.session_token=opaque-session" },
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-middleware-next"), "1");
  });

  it("protects nested board paths", () => {
    assert.deepEqual(config.matcher, ["/board", "/board/:path*"]);
    const response = middleware(new NextRequest("http://localhost:3000/board/details/job-1"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/login");
  });
});
