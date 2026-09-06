import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionUserId } from "@/lib/session";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const userId = await getSessionUserId();
  if (userId) {
    redirect("/board");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Use your email and password. New operator?{" "}
          <Link className="underline" href="/register">
            Register
          </Link>
          .
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
