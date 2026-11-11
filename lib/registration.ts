import { registerSchemaCheck, schemaCheckFor } from "@better-auth/core/db/internal";
import { tryGetCurrentAuthEndpointContext } from "@better-auth/core/context";
import { APIError, getCurrentAdapter, type BetterAuthPlugin } from "better-auth";

export const FIRST_OPERATOR_CLAIM_ID = 1;

export function registrationIsOpen(
  existingUserCount: number,
  allowRegistration: string | undefined
): boolean {
  if (allowRegistration === "true") {
    return true;
  }
  return existingUserCount === 0;
}

export async function publicRegistrationAllowed(deps: {
  allowRegistration?: string;
  hasUser?: () => Promise<boolean>;
} = {}): Promise<boolean> {
  const allowRegistration = deps.allowRegistration ?? process.env.ALLOW_REGISTRATION;
  if (registrationIsOpen(1, allowRegistration)) {
    return true;
  }
  const exists = deps.hasUser
    ? await deps.hasUser()
    : Boolean((await (await import("./prisma")).prisma.user.findFirst({ select: { id: true } }))?.id);
  return registrationIsOpen(exists ? 1 : 0, allowRegistration);
}

type TransactionAdapter = {
  transaction: (callback: (trx: never) => Promise<unknown>) => Promise<unknown>;
};

function allowRegistrationValue(configured: string | undefined): string | undefined {
  return configured ?? process.env.ALLOW_REGISTRATION;
}

type SignUpSlot = {
  adapter: TransactionAdapter;
};

const schemaChecksWrapped = new WeakSet<object>();

function activeSignUpContext(): object | undefined {
  const current = tryGetCurrentAuthEndpointContext() as { context?: object } | undefined;
  return current?.context;
}

function gateClosedSignUps(configured: string | undefined): {
  enter: (slot: SignUpSlot) => Promise<void>;
  leave: (slot: object | undefined) => void;
} {
  let tail: Promise<void> = Promise.resolve();
  // Serializes closed sign-ups for adapters that do not enforce registrationClaim's
  // primary key (the memory adapter). Postgres still rejects a second claim across processes.
  const releases = new WeakMap<object, () => void>();

  const releaseSlot = (slot: object | undefined) => {
    if (!slot) {
      return;
    }
    const finish = releases.get(slot);
    releases.delete(slot);
    finish?.();
  };

  const wrapSchemaCheck = (adapter: object) => {
    if (schemaChecksWrapped.has(adapter)) {
      return;
    }
    const prior = schemaCheckFor(adapter);
    if (!prior) {
      return;
    }
    schemaChecksWrapped.add(adapter);
    // Schema mismatches reject before adapter.transaction, and that error never reaches the after hook.
    registerSchemaCheck(adapter, () => {
      const pending = prior();
      if (!pending) {
        return;
      }
      return Promise.resolve(pending).catch((error: unknown) => {
        releaseSlot(activeSignUpContext());
        throw error;
      });
    });
  };

  return {
    async enter(slot) {
      if (registrationIsOpen(1, allowRegistrationValue(configured))) {
        return;
      }

      const previous = tail;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      tail = previous.then(() => gate, () => gate);
      await previous.catch(() => undefined);

      const adapter = slot.adapter;
      let settled = false;
      let depth = 0;
      let restore: (() => void) | undefined;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        releases.delete(slot);
        restore?.();
        release();
      };
      releases.set(slot, finish);

      try {
        if (typeof adapter.transaction !== "function") {
          finish();
          return;
        }
        wrapSchemaCheck(adapter);
        const original = adapter.transaction.bind(adapter);
        restore = () => {
          adapter.transaction = original;
        };
        // A nested or foreign transaction must not open the queue. Only this
        // sign-up's outermost transaction, or leave(), may release it.
        adapter.transaction = async (callback) => {
          if (activeSignUpContext() !== slot) {
            return original(callback);
          }
          depth += 1;
          try {
            return await original(callback);
          } finally {
            depth -= 1;
            if (depth === 0) {
              finish();
            }
          }
        };
      } catch (error) {
        finish();
        throw error;
      }
    },
    leave(slot) {
      releaseSlot(slot);
    },
  };
}

export function firstOperatorRegistration(deps: {
  allowRegistration?: string;
} = {}): BetterAuthPlugin {
  const gateSignUp = gateClosedSignUps(deps.allowRegistration);
  return {
    id: "first-operator-registration",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === "/sign-up/email",
          handler: async (input) => {
            const endpoint = input as { context?: { adapter?: TransactionAdapter } };
            const slot = endpoint.context;
            const adapter = slot?.adapter;
            if (!slot || !adapter) {
              return;
            }
            await gateSignUp.enter(slot as SignUpSlot);
          },
        },
      ],
      after: [
        {
          matcher: (context) => context.path === "/sign-up/email",
          handler: async (input) => {
            const endpoint = input as { context?: object };
            gateSignUp.leave(endpoint.context);
            return {};
          },
        },
      ],
    },
    schema: {
      registrationClaim: {
        modelName: "registrationClaim",
        fields: {
          id: { type: "number", required: true, unique: true },
          claimedAt: { type: "date", required: true },
        },
      },
    },
    init(context) {
      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                async before(_user, endpointContext) {
                  if (
                    endpointContext?.path !== "/sign-up/email" ||
                    registrationIsOpen(
                      1,
                      deps.allowRegistration ?? process.env.ALLOW_REGISTRATION
                    )
                  ) {
                    return;
                  }

                  const adapter = await getCurrentAdapter(context.adapter);
                  const existingUserCount = await adapter.count({
                    model: "user",
                    where: [],
                  });
                  if (existingUserCount > 0) {
                    throw new APIError("FORBIDDEN", {
                      message: "Registration is closed.",
                    });
                  }

                  try {
                    await adapter.create({
                      model: "registrationClaim",
                      data: {
                        id: FIRST_OPERATOR_CLAIM_ID,
                        claimedAt: new Date(),
                      },
                      forceAllowId: true,
                    });
                  } catch {
                    throw new APIError("FORBIDDEN", {
                      message: "Registration is closed.",
                    });
                  }
                },
              },
            },
          },
        },
      };
    },
  };
}
