"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type SignOutResult = { error: { message?: string } | null };

type SignOutButtonProps = {
  signOut?: () => Promise<SignOutResult>;
  goToLogin?: () => void;
};

export function SignOutButton({
  signOut = () => authClient.signOut(),
  goToLogin = () => {
    window.location.assign("/login");
  },
}: SignOutButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const { error: signOutError } = await signOut();
      if (signOutError) {
        setError(signOutError.message || "Sign out failed. Please try again.");
        return;
      }
      goToLogin();
    } catch {
      setError("Sign out failed. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-sm font-medium underline disabled:opacity-60"
      >
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </span>
  );
}
