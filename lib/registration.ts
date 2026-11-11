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

function allowRegistrationValue(configured: string | undefined): string | undefined {
  return configured ?? process.env.ALLOW_REGISTRATION;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: unknown }).code === "P2002"
  );
}

export function firstOperatorRegistration(deps: {
  allowRegistration?: string;
} = {}): BetterAuthPlugin {
  return {
    id: "first-operator-registration",
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
                    registrationIsOpen(1, allowRegistrationValue(deps.allowRegistration))
                  ) {
                    return;
                  }

                  // Sign-up runs this hook inside its database transaction.
                  // registration_claim.id is the lock: a second insert fails
                  // and rolls the user back with it.
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
                  } catch (error) {
                    if (!isUniqueConstraintError(error)) {
                      throw error;
                    }
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
