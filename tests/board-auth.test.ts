import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryAdapter, type MemoryDB } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth";
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

  it("does not authorize a forged session cookie", async () => {
    const database: MemoryDB = {
      user: [],
      session: [],
      account: [],
      verification: [],
    };
    const auth = betterAuth({
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://127.0.0.1:3000",
      database: memoryAdapter(database),
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
    });
    await auth.api.signUpEmail({
      body: {
        name: "Operator",
        email: "operator@example.com",
        password: "test-password",
      },
    });
    const signedIn = await auth.api.signInEmail({
      body: {
        email: "operator@example.com",
        password: "test-password",
      },
      returnHeaders: true,
    });
    const sessionCookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";
    const real = await auth.api.getSession({
      headers: new Headers({ cookie: sessionCookie }),
    });
    assert.equal(real?.user.email, "operator@example.com");

    const forgedCookie = "better-auth.session_token=forged-token";
    const forged = await auth.api.getSession({
      headers: new Headers({ cookie: forgedCookie }),
    });
    assert.equal(forged, null);

    const response = middleware(
      new NextRequest("http://127.0.0.1/board", {
        headers: { cookie: forgedCookie },
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("location"), null);

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
});
