"use client";

import { useEffect, useRef, useState } from "react";
import {
  CLIENT_FETCH_TIMEOUT_MS,
  GENERIC_ERROR,
  OPERATOR_TOKEN_HEADER,
  OPERATOR_TOKEN_STORAGE_KEY,
  TIMEOUT_ERROR,
} from "./lib/tailor-constants";

type TailorResponse = {
  cv?: string;
  replyText?: string | null;
  error?: string;
};

function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export function TailorForm() {
  const [jobDescription, setJobDescription] = useState("");
  const [operatorToken, setOperatorToken] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cv, setCv] = useState<string | null>(null);
  const [replyText, setReplyText] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    try {
      setOperatorToken(sessionStorage.getItem(OPERATOR_TOKEN_STORAGE_KEY) ?? "");
    } catch {
      // sessionStorage can throw in locked-down browsers; the field still works.
    }
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  function persistOperatorToken(value: string) {
    setOperatorToken(value);
    try {
      sessionStorage.setItem(OPERATOR_TOKEN_STORAGE_KEY, value);
    } catch {
      // Ignore quota / privacy-mode failures; the in-memory value is still sent.
    }
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const jd = jobDescription.trim();
    if (!jd) {
      setError("Job description is required.");
      setCv(null);
      setReplyText(null);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = window.setTimeout(() => controller.abort(), CLIENT_FETCH_TIMEOUT_MS);

    setPending(true);
    setError(null);
    setCv(null);
    setReplyText(null);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      const token = operatorToken.trim();
      if (token) {
        headers[OPERATOR_TOKEN_HEADER] = token;
      }
      const response = await fetch("/api/tailor", {
        method: "POST",
        headers,
        body: JSON.stringify({ jobDescription: jd }),
        signal: controller.signal,
      });
      const body = (await response.json()) as TailorResponse;
      if (!mountedRef.current) {
        return;
      }
      if (!response.ok) {
        setError(body.error || GENERIC_ERROR);
        return;
      }
      if (!body.cv) {
        setError(GENERIC_ERROR);
        return;
      }
      setCv(body.cv);
      setReplyText(body.replyText?.trim() ? body.replyText : null);
    } catch (caught) {
      if (!mountedRef.current) {
        return;
      }
      setError(isAbortError(caught) ? TIMEOUT_ERROR : GENERIC_ERROR);
    } finally {
      window.clearTimeout(timeoutId);
      if (mountedRef.current) {
        setPending(false);
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-3xl flex-col gap-4">
      <label className="flex flex-col gap-2 text-sm font-medium">
        Job description
        <textarea
          value={jobDescription}
          onChange={(event) => setJobDescription(event.target.value)}
          rows={16}
          className="rounded-md border border-neutral-300 bg-white p-3 font-mono text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          placeholder="Paste the recruiter JD here"
          disabled={pending}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        Operator token
        <input
          type="password"
          autoComplete="off"
          value={operatorToken}
          onChange={(event) => persistOperatorToken(event.target.value)}
          className="rounded-md border border-neutral-300 bg-white p-3 font-mono text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          placeholder="Required when OPERATOR_TOKEN is set"
          disabled={pending}
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-fit rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-neutral-100 dark:text-neutral-900"
      >
        {pending ? "Tailoring…" : "Tailor CV"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {cv ? (
        <a
          className="w-fit text-sm font-medium underline"
          href={`data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${cv}`}
          download="tailored-cv.docx"
        >
          Download tailored CV
        </a>
      ) : null}
      {replyText ? (
        <label className="flex flex-col gap-2 text-sm font-medium">
          Recruiter reply
          <textarea
            readOnly
            value={replyText}
            rows={10}
            className="rounded-md border border-neutral-300 bg-neutral-50 p-3 font-mono text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
      ) : null}
    </form>
  );
}
