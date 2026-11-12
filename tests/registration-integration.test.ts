import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryAdapter, type MemoryDB } from "@better-auth/memory-adapter";
import { registerSchemaCheck, schemaCheckFor } from "@better-auth/core/db/internal";
import { APIError, betterAuth } from "better-auth";
import { firstOperatorRegistration } from "../lib/registration";

function assertRegistrationClosed(error: unknown): boolean {
  assert.ok(error instanceof APIError);
  assert.equal(error.statusCode, 403);
  assert.equal(error.message, "Registration is closed.");
  return true;
}

type SignUpAdapter = {
  transaction: (callback: (trx: never) => Promise<unknown>) => Promise<unknown>;
};

function signUpAdapter(input: object): SignUpAdapter {
  return (input as { context: { adapter: SignUpAdapter } }).context.adapter;
}

type ClaimSlot = {
  state: "pending" | "committed";
  settled: Promise<void>;
  finish: () => void;
};

// Stands in for the registration_claim primary key. The memory adapter does
// not reject a duplicate id; Postgres does, and waits while the other
// transaction still holds the row.
function databaseWithUniqueClaim(database: MemoryDB) {
  const createAdapter = memoryAdapter(database);
  const slots = new Map<number, ClaimSlot>();

  const reserve = (id: number): Promise<{ commit: () => void; abort: () => void }> => {
    const existing = slots.get(id);
    if (!existing) {
      let finish: () => void = () => undefined;
      const settled = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const slot: ClaimSlot = { state: "pending", settled, finish };
      slots.set(id, slot);
      return Promise.resolve({
        commit() {
          slot.state = "committed";
          finish();
        },
        abort() {
          if (slots.get(id) === slot && slot.state === "pending") {
            slots.delete(id);
          }
          finish();
        },
      });
    }
    if (existing.state === "committed") {
      return Promise.reject(Object.assign(new Error("unique constraint"), { code: "P2002" }));
    }
    return existing.settled.then(() => reserve(id));
  };

  return (options: Parameters<typeof createAdapter>[0]) => {
    const adapter = createAdapter(options);
    const transaction = adapter.transaction.bind(adapter);
    adapter.transaction = (async (callback) => {
      let held: { commit: () => void; abort: () => void } | undefined;
      try {
        const result = await transaction(async (trx) => {
          const create = trx.create.bind(trx);
          const claimAware = trx as {
            create: (input: { model: string; data?: { id?: unknown } }) => Promise<unknown>;
          };
          claimAware.create = async (input) => {
            const id = input.data?.id;
            if (input.model === "registrationClaim" && typeof id === "number") {
              held = await reserve(id);
            }
            return create(input as Parameters<typeof create>[0]);
          };
          return callback(trx);
        });
        held?.commit();
        return result;
      } catch (error) {
        held?.abort();
        throw error;
      }
    }) as typeof adapter.transaction;
    return adapter;
  };
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

    await assert.rejects(signup("second-operator@example.com"), assertRegistrationClosed);
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
      database: databaseWithUniqueClaim(database),
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
    const rejected = results.filter((result) => result.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assertRegistrationClosed(rejected[0]?.reason);
    assert.equal(database.user.length, 1);
    assert.equal(database.account.length, 1);
    assert.equal(database.registrationClaim.length, 1);
    assert.equal(database.registrationClaim[0]?.id, 1);
    assert.equal(database.session.length, 1);
  });

  it("does not map non-unique claim insert errors to registration closed", async () => {
    const database: MemoryDB = {
      user: [],
      session: [],
      account: [],
      verification: [],
      registrationClaim: [],
    };
    const createAdapter = memoryAdapter(database);
    const auth = betterAuth({
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://localhost:3000",
      database: (options: Parameters<typeof createAdapter>[0]) => {
        const adapter = createAdapter(options);
        const transaction = adapter.transaction.bind(adapter);
        adapter.transaction = (async (callback) => {
          return transaction(async (trx) => {
            const create = trx.create.bind(trx);
            const claimAware = trx as unknown as {
              create: (input: { model: string }) => Promise<unknown>;
            };
            claimAware.create = async (input) => {
              if (input.model === "registrationClaim") {
                throw Object.assign(new Error("db unavailable"), { code: "P1001" });
              }
              return create(input as Parameters<typeof create>[0]);
            };
            return callback(trx);
          });
        }) as typeof adapter.transaction;
        return adapter;
      },
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
      plugins: [firstOperatorRegistration({ allowRegistration: "false" })],
    });

    await assert.rejects(() =>
      auth.api.signUpEmail({
        body: {
          name: "Operator",
          email: "operator@example.com",
          password: "test-password",
        },
      }),
      (error: unknown) => {
        assert.ok(!(error instanceof APIError && error.message === "Registration is closed."));
        return true;
      }
    );
    assert.equal(database.user.length, 0);
    assert.equal(database.registrationClaim.length, 0);
  });

  it("accepts a signup after validation fails", async () => {
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

  it("accepts a signup after a schema check fails", async () => {
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

  it("lets one signup finish while an unrelated transaction runs", async () => {
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
      database: databaseWithUniqueClaim(database),
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

  it("allows further signups when public registration is enabled", async () => {
    const database: MemoryDB = {
      user: [],
      session: [],
      account: [],
      verification: [],
      registrationClaim: [],
    };
    const existing = betterAuth({
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://localhost:3000",
      database: memoryAdapter(database),
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
    });
    await existing.api.signUpEmail({
      body: {
        name: "First",
        email: "first@example.com",
        password: "test-password",
      },
    });
    assert.equal(database.user.length, 1);
    assert.equal(database.registrationClaim.length, 0);

    const open = betterAuth({
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://localhost:3000",
      database: memoryAdapter(database),
      emailAndPassword: { enabled: true, minPasswordLength: 8 },
      plugins: [firstOperatorRegistration({ allowRegistration: "true" })],
    });
    const signup = (email: string) =>
      open.api.signUpEmail({
        body: {
          name: "Operator",
          email,
          password: "test-password",
        },
      });

    const second = await signup("second@example.com");
    const third = await signup("third@example.com");
    assert.equal(second.user.email, "second@example.com");
    assert.equal(third.user.email, "third@example.com");
    assert.equal(database.user.length, 3);
    assert.equal(database.registrationClaim.length, 0);
  });
});
