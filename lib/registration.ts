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

/**
 * Atomically claim the first-operator signup slot when public registration is off.
 * Returns true when this request may create a user (open registration, or we won the
 * singleton claim). Returns false when another operator already claimed the slot or a
 * user already exists — callers must fail closed without deleting accounts.
 */
export async function claimFirstOperatorSlot(deps: {
  allowRegistration?: string;
  claim?: () => Promise<boolean>;
} = {}): Promise<boolean> {
  if (registrationIsOpen(1, deps.allowRegistration ?? process.env.ALLOW_REGISTRATION)) {
    return true;
  }
  if (deps.claim) {
    return deps.claim();
  }
  return insertFirstOperatorClaim();
}

async function insertFirstOperatorClaim(): Promise<boolean> {
  const { prisma } = await import("./prisma");
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "registration_claim" ("id")
    SELECT ${FIRST_OPERATOR_CLAIM_ID}
    WHERE NOT EXISTS (SELECT 1 FROM "user")
    ON CONFLICT ("id") DO NOTHING
    RETURNING "id"
  `;
  return rows.length > 0;
}
