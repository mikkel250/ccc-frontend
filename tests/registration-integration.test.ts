import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memoryAdapter, type MemoryDB } from "@better-auth/memory-adapter";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { firstOperatorRegistration } from "../lib/registration";

const testSecret = "test-secret-at-least-32-characters-long";

function emptyDatabase(): MemoryDB {
  return {
    user: [],
    session: [],
    account: [],
    verification: [],
    registrationClaim: [],
  };
}

type RegistrationAdapter = {
  create: (args: {
    model: string;
    data: { id?: unknown };
    forceAllowId?: boolean;
  }) => Promise<unknown>;
  transaction: <T>(callback: (trx: RegistrationAdapter) => Promise<T>) => Promise<T>;
};

// The memory adapter does not enforce primary keys. This stands in for the
// Postgres `RegistrationClaim.id` key so concurrent signups can lose the insert.
function enforceSingletonClaim(adapter: RegistrationAdapter): void {
  const claimedIds = new Set<unknown>();
  const wrap = (current: RegistrationAdapter): void => {
    const originalCreate = current.create.bind(current);
    const originalTransaction = current.transaction.bind(current);
    current.create = async (args) => {
      if (args.model === "registrationClaim") {
        if (claimedIds.has(args.data.id)) {
          throw new Error("Unique constraint failed on registrationClaim.id");
        }
        claimedIds.add(args.data.id);
      }
      return originalCreate(args);
    };
    current.transaction = async (callback) =>
      originalTransaction(async (trx) => {
        wrap(trx);
        return callback(trx);
      });
  };
  wrap(adapter);
}

function createAuth(
  database: MemoryDB,
  options: { allowRegistration: string; enforceClaimId?: boolean }
) {
  return betterAuth({
    secret: testSecret,
    baseURL: "http://localhost:3000",
    database: (authOptions: BetterAuthOptions) => {
      const adapter = memoryAdapter(database)(authOptions);
      if (options.enforceClaimId) {
        enforceSingletonClaim(adapter as unknown as RegistrationAdapter);
      }
      return adapter;
    },
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    plugins: [firstOperatorRegistration({ allowRegistration: options.allowRegistration })],
  });
}

function signUp(
  auth: ReturnType<typeof createAuth>,
  email: string
) {
  return auth.api.signUpEmail({
    body: {
      name: "Operator",
      email,
      password: "test-password",
    },
  });
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

  it("allows later signups when allowRegistration is true", async () => {
    const database = emptyDatabase();
    const auth = createAuth(database, { allowRegistration: "true" });

    const first = await signUp(auth, "operator@example.com");
    const second = await signUp(auth, "second-operator@example.com");

    assert.equal(first.user.email, "operator@example.com");
    assert.equal(second.user.email, "second-operator@example.com");
    assert.equal(database.user.length, 2);
    assert.equal(database.registrationClaim.length, 0);
  });

  it("lets exactly one of two concurrent first signups succeed", async () => {
    const database = emptyDatabase();
    const auth = createAuth(database, {
      allowRegistration: "false",
      enforceClaimId: true,
    });
    const results = await Promise.allSettled([
      signUp(auth, "one@example.com"),
      signUp(auth, "two@example.com"),
    ]);

    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);
    assert.equal(database.user.length, 1);
    assert.equal(database.registrationClaim.length, 1);
    assert.equal(database.registrationClaim[0]?.id, 1);
  });
});
