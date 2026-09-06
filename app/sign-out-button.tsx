"use client";

import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  async function onClick() {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.assign("/login");
        },
      },
    });
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-sm font-medium underline"
    >
      Sign out
    </button>
  );
}
