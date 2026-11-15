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

function assertMainSkipTarget(source: string, file: string) {
  assert.match(
    source,
    /<main\b[^>]*\bid=["']main-content["']/,
    `${file} main is missing id="main-content"`
  );
  assert.match(source, /tabIndex=\{-1\}/, `${file} main is missing tabIndex={-1}`);
}

const LAYOUT_BACKED_MAINS = [
  "app/page.tsx",
  "app/login/page.tsx",
  "app/register/page.tsx",
  "app/error.tsx",
] as const;

const dom = new Window({ url: "http://127.0.0.1:3000/" });
for (const name of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "DocumentFragment",
  "HTMLAnchorElement",
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

before(async () => {
  const React = await import("react");
  (globalThis as unknown as { React?: typeof React }).React = React;
  act = React.act;
  createElement = React.createElement;
  ({ createRoot } = await import("react-dom/client"));
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

describe("accessibility source", () => {
  it("places SkipToContent before SiteHeader in the root layout", () => {
    const layout = readAppFile("app/layout.tsx");
    const skipIdx = layout.indexOf("<SkipToContent");
    const headerIdx = layout.indexOf("<SiteHeader");
    assert.notEqual(skipIdx, -1, "app/layout.tsx must render <SkipToContent");
    assert.notEqual(headerIdx, -1, "app/layout.tsx must render <SiteHeader");
    assert.ok(skipIdx < headerIdx, "SkipToContent must come before SiteHeader");
    assert.match(layout, /from ["']\.\/skip-to-content["']/);
  });

  it("gives every layout-backed main id=main-content and tabIndex={-1}", () => {
    for (const file of LAYOUT_BACKED_MAINS) {
      assertMainSkipTarget(readAppFile(file), file);
    }
    const board = readAppFile("app/board/page.tsx");
    const mains = board.match(/<main\b[\s\S]*?>/g) ?? [];
    assert.equal(mains.length, 2, "board page has success and load-error mains");
    for (const tag of mains) {
      assert.match(tag, /\bid=["']main-content["']/);
      assert.match(tag, /tabIndex=\{-1\}/);
    }
  });

  it("defines skip-link and :focus-visible styles in globals.css", () => {
    const css = readAppFile("app/globals.css");
    assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*2px solid currentColor/);
    assert.match(css, /:focus-visible\s*\{[^}]*outline-offset:\s*2px/);
    assert.match(css, /\.skip-link\s*\{/);
    assert.match(css, /\.skip-link:(?:focus|focus-visible)\s*\{/);
    assert.match(css, /clip(?:-path)?:/);
  });
});

describe("skip to content", () => {
  it("renders a same-page skip link to #main-content", async () => {
    const { SkipToContent } = await import("../app/skip-to-content");
    const { container, cleanup } = await render(createElement(SkipToContent));
    try {
      const link = container.querySelector("a");
      assert.ok(link instanceof HTMLAnchorElement);
      assert.equal(link.textContent?.trim(), "Skip to content");
      assert.equal(link.getAttribute("href"), "#main-content");
      assert.equal(link.classList.contains("skip-link"), true);
    } finally {
      await cleanup();
    }
  });

  it("moves keyboard focus to #main-content when activated", async () => {
    const { SkipToContent } = await import("../app/skip-to-content");
    const { container, cleanup } = await render(
      createElement(
        "div",
        null,
        createElement(SkipToContent),
        createElement("main", { id: "main-content", tabIndex: -1 }, "Content")
      )
    );
    try {
      const link = container.querySelector("a");
      const main = container.querySelector("#main-content");
      assert.ok(link instanceof HTMLAnchorElement);
      assert.ok(main instanceof HTMLElement);
      await act(async () => {
        link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      assert.equal(document.activeElement, main);
    } finally {
      await cleanup();
    }
  });
});
