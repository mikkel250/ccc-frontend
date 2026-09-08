import Link from "next/link";
import { publicRegistrationAllowed } from "@/lib/registration";
import { redirectIfSignedIn } from "@/lib/session";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  await redirectIfSignedIn();
  const open = await publicRegistrationAllowed();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Register</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {open
            ? "Create the first operator account, then sign in to the board and tailor."
            : "Public registration is closed. Ask the existing operator to set ALLOW_REGISTRATION=true if another account is needed."}
        </p>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Already have an account?{" "}
          <Link className="underline" href="/login">
            Sign in
          </Link>
          .
        </p>
      </div>
      {open ? <RegisterForm /> : (
        <p role="alert" className="text-sm text-neutral-700 dark:text-neutral-300">
          Registration is closed.
        </p>
      )}
    </main>
  );
}
