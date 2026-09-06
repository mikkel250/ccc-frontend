import { cache } from "react";
import { redirect } from "next/navigation";

export type SessionLookup = () => Promise<{ user: { id: string } } | null>;

const readSessionUserId = cache(async () => {
  const { headers } = await import("next/headers");
  const { auth } = await import("./auth");
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user.id ?? null;
});

export async function getSessionUserId(
  getSession?: SessionLookup
): Promise<string | null> {
  if (getSession) {
    const session = await getSession();
    return session?.user.id ?? null;
  }
  return readSessionUserId();
}

export async function requireSessionUserId(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) {
    redirect("/login");
  }
  return userId;
}

export async function redirectIfSignedIn(path = "/board"): Promise<void> {
  const userId = await getSessionUserId();
  if (userId) {
    redirect(path);
  }
}
