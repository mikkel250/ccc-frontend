export type SessionLookup = () => Promise<{ user: { id: string } } | null>;

export async function getSessionUserId(
  getSession?: SessionLookup
): Promise<string | null> {
  if (getSession) {
    const session = await getSession();
    return session?.user.id ?? null;
  }
  const { headers } = await import("next/headers");
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user.id ?? null;
}
