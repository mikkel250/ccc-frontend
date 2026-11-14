"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        The page failed to load. Try again, or go back to Tailor.
      </p>
      {error.digest ? (
        <p className="text-xs text-neutral-500">Reference: {error.digest}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-neutral-100 dark:text-neutral-900"
        >
          Try again
        </button>
        {/* Full navigation remounts the crashed tree; App Router Link may be unavailable. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          href="/"
          className="w-fit rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
        >
          Go to Tailor
        </a>
      </div>
    </main>
  );
}
