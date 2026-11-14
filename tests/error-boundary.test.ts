import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import type { ReactElement } from "react";
import type { Root } from "react-dom/client";

const rootDir = process.cwd();

function readAppFile(path: string): string {
  return readFileSync(join(rootDir, path), "utf8");
}

const dom = new Window({ url: "http://127.0.0.1:3000/" });
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "DocumentFragment",
  "HTMLButtonElement",
  "Event",
  "MouseEvent",
] as const) {
  const value = name === "window" ? dom : (dom as unknown as Record<string, unknown>)[name];
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let act!: typeof import("react").act;
let createElement!: typeof import("react").createElement;
let createRoot!: typeof import("react-dom/client").createRoot;
let AppError!: typeof import("../app/error").default;

before(async () => {
  const React = await import("react");
  (globalThis as unknown as { React?: typeof React }).React = React;
  act = React.act;
  createElement = React.createElement;
  ({ createRoot } = await import("react-dom/client"));
  AppError = (await import("../app/error")).default;
});

after(() => {
  dom.close();
});

async function render(node: ReactElement): Promise<{
  container: HTMLDivElement;
  root: Root;
  cleanup: () => Promise<void>;
}> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    root,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

describe("error boundary source", () => {
  it("ships client error.tsx and global-error.tsx that never render error.message", () => {
    const errorPage = readAppFile("app/error.tsx");
    const globalPage = readAppFile("app/global-error.tsx");

    assert.match(errorPage, /^"use client";/m);
    assert.match(globalPage, /^"use client";/m);
    assert.match(errorPage, /export default function/);
    assert.match(globalPage, /export default function/);
    assert.match(globalPage, /<html/);
    assert.match(globalPage, /<body/);
    assert.match(errorPage, /Try again/);
    assert.match(globalPage, /Try again/);

    assert.doesNotMatch(errorPage, /error\.message/);
    assert.doesNotMatch(globalPage, /error\.message/);
    assert.doesNotMatch(errorPage, /error\.stack/);
    assert.doesNotMatch(globalPage, /error\.stack/);
  });
});

describe("error boundary UI", () => {
  it("shows a recovery action and digest without leaking the thrown message", async () => {
    const secret = "TAILOR_API_KEY=sk-live-leak cookie=abc";
    let resets = 0;
    const error = Object.assign(new Error(secret), { digest: "abc123digest" });
    const { container, cleanup } = await render(
      createElement(AppError, {
        error,
        reset: () => {
          resets += 1;
        },
      })
    );
    try {
      assert.match(container.textContent ?? "", /Something went wrong/);
      assert.match(container.textContent ?? "", /abc123digest/);
      assert.equal((container.textContent ?? "").includes(secret), false);
      assert.equal((container.textContent ?? "").includes("sk-live-leak"), false);
      const button = container.querySelector("button");
      assert.ok(button);
      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      assert.equal(resets, 1);
    } finally {
      await cleanup();
    }
  });
});
