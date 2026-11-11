import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryAdapter, type MemoryDB } from "@better-auth/memory-adapter";
import { registerSchemaCheck, schemaCheckFor } from "@better-auth/core/db/internal";
import { betterAuth } from "better-auth";
import { firstOperatorRegistration } from "../lib/registration";

type SignUpAdapter = {
  transaction: (callback: (trx: never) => Promise<unknown>) => Promise<unknown>;
};

function signUpAdapter(input: object): SignUpAdapter {
  return (input as { context: { adapter: SignUpAdapter } }).context.adapter;
}

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

  it("lets exactly one of two concurrent first signups succeed", async () => {
    const database: MemoryDB = {
      user: [],
      session: [],
      account: [],
      verification: [],
      registrationClaim: [],
    };
    const auth = betterAuth({
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://localhost:3000",
      database: memoryAdapter(database),
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
      plugins: [firstOperatorRegistration({ allowRegistration: "false" })],
    });
    const signup = (email: string) =>
      auth.api.signUpEmail({
        body: {
          name: "Operator",
          email,
          password: "test-password",
        },
      });

    const results = await Promise.allSettled([
      signup("one@example.com"),
      signup("two@example.com"),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");
    assert.equal(fulfilled.length, 1);
    assert.equal(database.user.length, 1);
    assert.equal(database.account.length, 1);
    assert.equal(database.registrationClaim.length, 1);
    assert.equal(database.registrationClaim[0]?.id, 1);
    assert.equal(database.session.length, 1);
  });

  it("releases the signup queue when validation fails before the transaction", async () => {
    const database = {
      user: [],
      session: [],
      account: [],
      verification: [],
      registrationClaim: [],
    };
    const auth = betterAuth({
      baseURL: "http://localhost:3000",
      secret: "test-secret-test-secret-test-secret",
      database: memoryAdapter(database),
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
      plugins: [firstOperatorRegistration({ allowRegistration: "false" })],
    });

    await assert.rejects(() =>
      auth.api.signUpEmail({
        body: {
          name: "Operator",
          email: "not-an-email",
          password: "test-password",
        },
      })
    );

    const signup = auth.api.signUpEmail({
      body: {
        name: "Operator",
        email: "operator@example.com",
        password: "test-password",
      },
    });
    const result = await Promise.race([
      signup,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("signup stayed queued")), 1_000);
      }),
    ]);

    assert.equal(result.user.email, "operator@example.com");
    assert.equal(database.user.length, 1);
    assert.equal(database.registrationClaim.length, 1);
  });

  it("releases the signup queue when the schema check fails before the transaction", async () => {
    const database: MemoryDB = {
      user: [],
      session: [],
      account: [],
      verification: [],
      registrationClaim: [],
    };
    let schemaAttempts = 0;
    const auth = betterAuth({
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://localhost:3000",
      database: memoryAdapter(database),
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
      plugins: [
        {
          id: "schema-fail-once",
          hooks: {
            before: [
              {
                matcher: (context) => context.path === "/sign-up/email",
                handler: async (input) => {
                  const adapter = signUpAdapter(input);
                  if (schemaCheckFor(adapter)) {
                    return;
                  }
                  registerSchemaCheck(adapter, () => {
                    schemaAttempts += 1;
                    if (schemaAttempts === 1) {
                      return Promise.reject(new Error("schema mismatch"));
                    }
                    return undefined;
                  });
                },
              },
            ],
          },
        },
        firstOperatorRegistration({ allowRegistration: "false" }),
      ],
    });

    await assert.rejects(() =>
      auth.api.signUpEmail({
        body: {
          name: "Operator",
          email: "blocked@example.com",
          password: "test-password",
        },
      })
    );
    assert.equal(schemaAttempts, 1);
    assert.equal(database.user.length, 0);

    const signup = auth.api.signUpEmail({
      body: {
        name: "Operator",
        email: "operator@example.com",
        password: "test-password",
      },
    });
    const result = await Promise.race([
      signup,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("signup stayed queued")), 1_000);
      }),
    ]);

    assert.equal(result.user.email, "operator@example.com");
    assert.equal(database.user.length, 1);
  });

  it("keeps the signup queue closed while an unrelated transaction runs", async () => {
    const database: MemoryDB = {
      user: [],
      session: [],
      account: [],
      verification: [],
      registrationClaim: [],
    };
    let rootTransaction: ((callback: (trx: never) => Promise<unknown>) => Promise<unknown>) | undefined;
    let intruded = false;
    const auth = betterAuth({
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://localhost:3000",
      database: memoryAdapter(database),
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
      databaseHooks: {
        account: {
          create: {
            async before() {
              if (intruded || !rootTransaction) {
                return;
              }
              intruded = true;
              await rootTransaction(async () => undefined);
            },
          },
        },
      },
      plugins: [
        firstOperatorRegistration({ allowRegistration: "false" }),
        {
          id: "capture-root-transaction",
          hooks: {
            before: [
              {
                matcher: (context) => context.path === "/sign-up/email",
                handler: async (input) => {
                  const adapter = signUpAdapter(input);
                  rootTransaction = adapter.transaction.bind(adapter);
                },
              },
            ],
          },
        },
      ],
    });
    const signup = (email: string) =>
      auth.api.signUpEmail({
        body: {
          name: "Operator",
          email,
          password: "test-password",
        },
      });

    const results = await Promise.race([
      Promise.allSettled([signup("one@example.com"), signup("two@example.com")]),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("signup stayed queued")), 1_000);
      }),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled");

    assert.equal(intruded, true);
    assert.equal(fulfilled.length, 1);
    assert.equal(database.user.length, 1);
    assert.equal(database.registrationClaim.length, 1);
  });
});
