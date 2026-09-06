import { TailorForm } from "./tailor-form";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">On-demand tailor</h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Paste a job description. This app calls CCC from the server and returns a CV plus reply text.
          Inbound Gmail drafts stay in the CCC inbox worker.
        </p>
      </div>
      <TailorForm />
    </main>
  );
}
