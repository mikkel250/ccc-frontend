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

export async function keepFirstOperatorIfLocked(deps: {
  allowRegistration?: string;
  listUsers?: () => Promise<{ id: string }[]>;
  deleteExtra?: (ids: string[]) => Promise<void>;
} = {}): Promise<void> {
  if (registrationIsOpen(1, deps.allowRegistration ?? process.env.ALLOW_REGISTRATION)) {
    return;
  }
  const users = deps.listUsers
    ? await deps.listUsers()
    : await (await import("./prisma")).prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
  const extraIds = users.slice(1).map((user) => user.id);
  if (extraIds.length === 0) {
    return;
  }
  if (deps.deleteExtra) {
    await deps.deleteExtra(extraIds);
    return;
  }
  await (await import("./prisma")).prisma.user.deleteMany({
    where: { id: { in: extraIds } },
  });
}
