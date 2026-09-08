import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryAdapter, type MemoryDB } from "@better-auth/memory-adapter";
import { betterAuth } from "better-auth";
import { firstOperatorRegistration } from "../lib/registration";

describe("first-operator registration", () => {
  it("rolls back a claim after failed signup so a retry can succeed", async () => {
    const database: MemoryDB = {
      user: [],
      session: [],
      account: [],
      verification: [],
      registrationClaim: [],
    };
    let failAccountCreation = true;
    const auth = betterAuth({
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://localhost:3000",
      database: memoryAdapter(database),
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
      databaseHooks: {
        account: {
          create: {
            async before() {
              if (failAccountCreation) {
                failAccountCreation = false;
                throw new Error("simulated account failure");
              }
            },
          },
        },
      },
      plugins: [firstOperatorRegistration({ allowRegistration: "false" })],
    });
    const signup = (email = "operator@example.com") =>
      auth.api.signUpEmail({
        body: {
          name: "Operator",
          email,
          password: "test-password",
        },
      });

    await assert.rejects(signup());
    assert.equal(database.registrationClaim.length, 0);
    assert.equal(database.user.length, 0);

    const result = await signup();
    assert.equal(result.user.email, "operator@example.com");
    assert.equal(database.registrationClaim.length, 1);
    assert.equal(database.registrationClaim[0]?.id, 1);
    assert.equal(database.user.length, 1);

    await assert.rejects(signup("second-operator@example.com"));
    assert.equal(database.registrationClaim.length, 1);
    assert.equal(database.user.length, 1);
  });
});
