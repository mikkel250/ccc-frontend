import Link from "next/link";
import { getSessionUserId } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export async function SiteHeader() {
  const userId = await getSessionUserId();

  return (
    <header className="border-b border-neutral-200 px-8 py-4 dark:border-neutral-800">
      <nav className="mx-auto flex max-w-6xl items-center gap-4 text-sm">
        {userId ? (
          <>
            <Link className="font-medium underline" href="/">
              Tailor
            </Link>
            <Link className="font-medium underline" href="/board">
              Board
            </Link>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link className="font-medium underline" href="/login">
              Login
            </Link>
            <Link className="font-medium underline" href="/register">
              Register
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
