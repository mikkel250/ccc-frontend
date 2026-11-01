import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

describe("board middleware", () => {
  it("redirects unsigned visitors to login", () => {
    const response = middleware(new NextRequest("http://localhost:3000/board"));
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "http://localhost:3000/login");
  });

  it("allows the request when a session cookie is present", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/board", {
        headers: { cookie: "better-auth.session_token=test-session" },
      })
    );
    assert.equal(response.status, 200);
  });
});
