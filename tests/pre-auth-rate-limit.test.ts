import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryAdapter, type MemoryDB } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth";

async function signInAttempt(
  auth: ReturnType<typeof betterAuth>,
  xff: string
): Promise<Response> {
  return auth.handler(
    new Request("http://127.0.0.1:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": xff,
      },
      body: JSON.stringify({
        email: "nobody@example.com",
        password: "wrong-password",
      }),
    })
  );
}

describe("pre-auth rate limit", () => {
  it("shares one bucket across spoofed X-Forwarded-For values", async () => {
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
      rateLimit: {
        enabled: true,
        customRules: {
          "/sign-in/email": { window: 10, max: 2 },
        },
      },
      advanced: {
        ipAddress: {
          ipAddressHeaders: [],
        },
      },
    });

    const first = await signInAttempt(auth, "203.0.113.1");
    assert.notEqual(first.status, 429);

    const second = await signInAttempt(auth, "203.0.113.9");
    assert.notEqual(second.status, 429);

    const third = await signInAttempt(auth, "198.51.100.42");
    assert.equal(third.status, 429);
  });
});
