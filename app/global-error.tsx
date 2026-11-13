"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#ffffff",
          color: "#171717",
        }}
      >
        <main
          style={{
            margin: "0 auto",
            display: "flex",
            minHeight: "100vh",
            maxWidth: "48rem",
            flexDirection: "column",
            gap: "1.5rem",
            padding: "2rem",
          }}
        >
          <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>Something went wrong</h1>
          <p style={{ fontSize: "0.875rem", color: "#525252" }}>
            The page failed to load. Try again, or go back to Tailor.
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#737373" }}>Reference: {error.digest}</p>
          ) : null}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                width: "fit-content",
                borderRadius: "0.375rem",
                background: "#171717",
                color: "#ffffff",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                border: 0,
              }}
            >
              Try again
            </button>
            {/* Root layout is gone here, so App Router Link may not work. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                width: "fit-content",
                borderRadius: "0.375rem",
                border: "1px solid #d4d4d4",
                padding: "0.5rem 1rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                color: "inherit",
                textDecoration: "none",
              }}
            >
              Go to Tailor
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
