"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    setError(null);
    try {
      const { error: signOutError } = await authClient.signOut();
      if (signOutError) {
        setError(signOutError.message || "Sign out failed. Please try again.");
        return;
      }
      window.location.assign("/login");
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
