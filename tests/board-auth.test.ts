import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";
import { renderBoard } from "../app/board/page";
import { runJobAction } from "../lib/job-actions";
import { requireSessionUserId } from "../lib/session";

function loginRedirect(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return false;
  }
  const digest = (error as { digest: unknown }).digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT;") && digest.includes("/login");
}

describe("board authentication", () => {
  it("redirects an unauthenticated /board request and continues when a session cookie is present", () => {
    const anonymous = middleware(new NextRequest("http://127.0.0.1/board"));
    assert.equal(anonymous.status, 307);
    assert.equal(new URL(anonymous.headers.get("location") ?? "").pathname, "/login");

    const signedIn = middleware(
      new NextRequest("http://127.0.0.1/board", {
        headers: { cookie: "better-auth.session_token=session-token" },
      })
    );
    assert.equal(signedIn.status, 200);
    assert.equal(signedIn.headers.get("location"), null);
  });

  it("redirects the board page before listing jobs", async () => {
    let listed = false;
    await assert.rejects(
      () =>
        renderBoard({
          requireUserId: () => requireSessionUserId(async () => null),
          list: async () => {
            listed = true;
            return { ok: true, jobs: [] };
          },
        }),
      loginRedirect
    );
    assert.equal(listed, false);
  });

  it("redirects a signed-out job action before the store runs", async () => {
    let ran = false;
    await assert.rejects(
      () =>
        runJobAction(
          async () => {
            ran = true;
            return { ok: true };
          },
          { requireUserId: () => requireSessionUserId(async () => null) }
        ),
      loginRedirect
    );
    assert.equal(ran, false);
  });
});
