import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { BoardJob, JobStatus } from "../lib/jobs";

const dom = new Window({ url: "http://127.0.0.1:3000/" });
const domGlobals = [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "DocumentFragment",
  "SVGElement",
  "HTMLInputElement",
  "HTMLButtonElement",
  "HTMLFormElement",
  "HTMLSelectElement",
  "HTMLTextAreaElement",
  "HTMLOptionElement",
  "Event",
  "InputEvent",
  "KeyboardEvent",
  "MouseEvent",
  "CustomEvent",
  "FormData",
  "MutationObserver",
] as const;

for (const name of domGlobals) {
  const value = name === "window" ? dom : (dom as unknown as Record<string, unknown>)[name];
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
Object.defineProperty(globalThis, "getComputedStyle", {
  configurable: true,
  writable: true,
  value: dom.getComputedStyle.bind(dom),
});
Object.defineProperty(globalThis, "requestAnimationFrame", {
  configurable: true,
  writable: true,
  value: dom.requestAnimationFrame.bind(dom),
});
Object.defineProperty(globalThis, "cancelAnimationFrame", {
  configurable: true,
  writable: true,
  value: dom.cancelAnimationFrame.bind(dom),
});
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let act!: typeof import("react").act;
let createElement!: typeof import("react").createElement;
let createRoot!: typeof import("react-dom/client").createRoot;
let AppRouterContext!: typeof import("next/dist/shared/lib/app-router-context.shared-runtime").AppRouterContext;
let KanbanBoard!: typeof import("../app/board/kanban-board").KanbanBoard;
let LoginForm!: typeof import("../app/login/login-form").LoginForm;
let RegisterForm!: typeof import("../app/register/register-form").RegisterForm;

before(async () => {
  const React = await import("react");
  (globalThis as unknown as { React?: typeof React }).React = React;
  act = React.act;
  createElement = React.createElement;
  ({ createRoot } = await import("react-dom/client"));
  ({ AppRouterContext } = await import(
    "next/dist/shared/lib/app-router-context.shared-runtime"
  ));
  ({ KanbanBoard } = await import("../app/board/kanban-board"));
  ({ LoginForm } = await import("../app/login/login-form"));
  ({ RegisterForm } = await import("../app/register/register-form"));
});

after(() => {
  dom.close();
});

type RouterCalls = { pushed: string[]; refreshed: number };

const sampleJob: BoardJob = {
  id: "a1",
  company: "Acme",
  title: "Engineer",
  url: "https://jobs.example/a",
  notes: "Follow up",
  status: "applied",
  appliedAt: "2026-09-01",
};

async function render(node: ReactNode): Promise<{
  container: HTMLDivElement;
  calls: RouterCalls;
  root: Root;
  cleanup: () => Promise<void>;
}> {
  const calls: RouterCalls = { pushed: [], refreshed: 0 };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const router = {
    back() {},
    forward() {},
    prefetch() {},
    push(href: string) {
      calls.pushed.push(href);
    },
    refresh() {
      calls.refreshed += 1;
    },
    replace() {},
  };
  await act(async () => {
    root.render(
      createElement(
        AppRouterContext.Provider,
        { value: router as never },
        node as ReactElement
      )
    );
  });
  return {
    container,
    calls,
    root,
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype =
    input instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new window.Event("input", { bubbles: true }));
  input.dispatchEvent(new window.Event("change", { bubbles: true }));
}

function control(container: ParentNode, selector: string): HTMLInputElement {
  const input = container.querySelector(selector);
  assert.ok(input instanceof HTMLInputElement);
  return input;
}

function field(container: ParentNode, name: string): HTMLInputElement | HTMLTextAreaElement {
  const input = container.querySelector(`[name="${name}"]`);
  assert.ok(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement);
  return input;
}

async function submitForm(form: HTMLFormElement) {
  await act(async () => {
    form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("operator ui", { concurrency: 1 }, () => {
describe("authentication forms", { concurrency: 1 }, () => {
  it("shows a pending sign-in, then opens the board", async () => {
    let seen: { email: string; password: string } | undefined;
    let release: (result: { error: null }) => void = () => undefined;
    const pending = new Promise<{ error: null }>((resolve) => {
      release = resolve;
    });
    const view = await render(
      createElement(LoginForm, {
        signIn: (input) => {
          seen = input;
          return pending;
        },
      })
    );
    try {
      const email = control(view.container, 'input[type="email"]');
      const password = control(view.container, 'input[type="password"]');
      assert.equal(email.required, true);
      assert.equal(password.required, true);
      assert.equal(password.minLength, 8);
      await act(async () => {
        typeInto(email, "ada@example.com");
        typeInto(password, "test-password");
      });
      const form = view.container.querySelector("form");
      assert.ok(form);
      await act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
      const button = view.container.querySelector("button");
      assert.equal(button?.textContent, "Signing in…");
      assert.equal(button?.disabled, true);
      assert.equal(email.disabled, true);
      release({ error: null });
      await act(async () => {
        await pending;
      });
      assert.deepEqual(seen, { email: "ada@example.com", password: "test-password" });
      assert.deepEqual(view.calls.pushed, ["/board"]);
      assert.equal(view.calls.refreshed, 1);
      assert.equal(view.container.querySelector("button")?.textContent, "Sign in");
    } finally {
      await view.cleanup();
    }
  });

  it("shows a rejected sign-in and does not navigate", async () => {
    const view = await render(
      createElement(LoginForm, {
        signIn: async () => ({ error: { message: "Invalid email or password" } }),
      })
    );
    try {
      await act(async () => {
        typeInto(control(view.container, 'input[type="email"]'), "ada@example.com");
        typeInto(control(view.container, 'input[type="password"]'), "test-password");
      });
      const form = view.container.querySelector("form");
      assert.ok(form);
      await submitForm(form);
      assert.equal(view.container.querySelector("[role=alert]")?.textContent, "Invalid email or password");
      assert.deepEqual(view.calls.pushed, []);
      assert.equal(view.container.querySelector("button")?.disabled, false);
    } finally {
      await view.cleanup();
    }
  });

  it("shows a generic sign-in error when the call throws", async () => {
    const view = await render(
      createElement(LoginForm, {
        signIn: async () => {
          throw new Error("network down");
        },
      })
    );
    try {
      await act(async () => {
        typeInto(control(view.container, 'input[type="email"]'), "ada@example.com");
        typeInto(control(view.container, 'input[type="password"]'), "test-password");
      });
      const form = view.container.querySelector("form");
      assert.ok(form);
      await submitForm(form);
      assert.equal(
        view.container.querySelector("[role=alert]")?.textContent,
        "Sign in failed. Please try again."
      );
      assert.equal(view.container.textContent?.includes("network down"), false);
      assert.deepEqual(view.calls.pushed, []);
    } finally {
      await view.cleanup();
    }
  });

  it("registers, shows pending, and opens the board", async () => {
    let seen: { email: string; password: string; name: string } | undefined;
    let release: (result: { error: null }) => void = () => undefined;
    const pending = new Promise<{ error: null }>((resolve) => {
      release = resolve;
    });
    const view = await render(
      createElement(RegisterForm, {
        signUp: (input) => {
          seen = input;
          return pending;
        },
      })
    );
    try {
      const email = control(view.container, 'input[type="email"]');
      const password = control(view.container, 'input[type="password"]');
      assert.equal(email.required, true);
      assert.equal(password.minLength, 8);
      await act(async () => {
        typeInto(email, "ada@example.com");
        typeInto(password, "test-password");
      });
      const form = view.container.querySelector("form");
      assert.ok(form);
      await act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
      const button = view.container.querySelector("button");
      assert.equal(button?.textContent, "Registering…");
      assert.equal(button?.disabled, true);
      release({ error: null });
      await act(async () => {
        await pending;
      });
      assert.equal(view.container.querySelector("[role=alert]")?.textContent ?? null, null);
      assert.deepEqual(seen, {
        email: "ada@example.com",
        password: "test-password",
        name: "ada",
      });
      assert.deepEqual(view.calls.pushed, ["/board"]);
      assert.equal(view.calls.refreshed, 1);
    } finally {
      await view.cleanup();
    }
  });

  it("shows a rejected registration and a thrown registration failure", async () => {
    const closed = await render(
      createElement(RegisterForm, {
        signUp: async () => ({ error: { message: "Registration is closed." } }),
      })
    );
    try {
      await act(async () => {
        typeInto(control(closed.container, 'input[type="email"]'), "ada@example.com");
        typeInto(control(closed.container, 'input[type="password"]'), "test-password");
      });
      const form = closed.container.querySelector("form");
      assert.ok(form);
      await submitForm(form);
      assert.equal(closed.container.querySelector("[role=alert]")?.textContent, "Registration is closed.");
      assert.deepEqual(closed.calls.pushed, []);
    } finally {
      await closed.cleanup();
    }

    const thrown = await render(
      createElement(RegisterForm, {
        signUp: async () => {
          throw new Error("secret stack");
        },
      })
    );
    try {
      await act(async () => {
        typeInto(control(thrown.container, 'input[type="email"]'), "ada@example.com");
        typeInto(control(thrown.container, 'input[type="password"]'), "test-password");
      });
      const form = thrown.container.querySelector("form");
      assert.ok(form);
      await submitForm(form);
      assert.equal(
        thrown.container.querySelector("[role=alert]")?.textContent,
        "Registration failed. Please try again."
      );
      assert.equal(thrown.container.textContent?.includes("secret stack"), false);
      assert.deepEqual(thrown.calls.pushed, []);
    } finally {
      await thrown.cleanup();
    }
  });
});

describe("kanban board", { concurrency: 1 }, () => {
  it("shows the empty board", async () => {
    const view = await render(createElement(KanbanBoard, { jobs: [] }));
    try {
      assert.equal(view.container.textContent?.includes("No applications yet"), true);
      assert.equal(view.container.querySelector("button")?.textContent, "Add card");
    } finally {
      await view.cleanup();
    }
  });

  it("creates, edits, moves, and deletes a card", async () => {
    const calls: string[] = [];
    const view = await render(
      createElement(KanbanBoard, {
        jobs: [sampleJob],
        actions: {
          createJob: async (formData) => {
            calls.push(`create:${formData.get("company")}:${formData.get("title")}`);
            return undefined;
          },
          updateJob: async (formData) => {
            calls.push(`update:${formData.get("id")}:${formData.get("title")}`);
            return undefined;
          },
          moveJob: async (jobId, status: JobStatus) => {
            calls.push(`move:${jobId}:${status}`);
            return undefined;
          },
          deleteJob: async (jobId) => {
            calls.push(`delete:${jobId}`);
            return undefined;
          },
        },
      })
    );
    try {
      assert.equal(view.container.textContent?.includes("Acme"), true);
      const add = view.container.querySelector("form");
      assert.ok(add);
      const company = field(add, "company");
      const title = field(add, "title");
      assert.equal(company.required, true);
      assert.equal(title.required, true);
      company.value = "Beta";
      title.value = "Designer";
      await act(async () => {
        add.requestSubmit();
      });
      assert.deepEqual(calls, ["create:Beta:Designer"]);

      const edit = [...view.container.querySelectorAll("button")].find(
        (button) => button.textContent === "Edit"
      );
      assert.ok(edit);
      await act(async () => {
        edit.click();
      });
      const editor = [...view.container.querySelectorAll("form")].at(-1);
      assert.ok(editor);
      const editedTitle = field(editor, "title");
      editedTitle.value = "Staff engineer";
      await act(async () => {
        editor.requestSubmit();
      });
      assert.deepEqual(calls.at(-1), "update:a1:Staff engineer");

      const select = view.container.querySelector("select");
      assert.ok(select);
      select.value = "interview";
      await act(async () => {
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      assert.deepEqual(calls.at(-1), "move:a1:interview");

      window.confirm = () => false;
      const remove = [...view.container.querySelectorAll("button")].find(
        (button) => button.textContent === "Delete"
      );
      assert.ok(remove);
      await act(async () => {
        remove.click();
      });
      assert.equal(calls.some((call) => call.startsWith("delete:")), false);

      window.confirm = () => true;
      await act(async () => {
        remove.click();
      });
      assert.deepEqual(calls.at(-1), "delete:a1");
    } finally {
      await view.cleanup();
    }
  });

  it("shows pending and rejected board actions", async () => {
    const holder: { container: HTMLElement | null } = { container: null };
    const view = await render(
      createElement(KanbanBoard, {
        jobs: [sampleJob],
        actions: {
          createJob: async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            const save = [...(holder.container?.querySelectorAll("button") ?? [])].find((button) =>
              button.textContent?.includes("Saving")
            );
            assert.equal(save?.textContent, "Saving…");
            assert.equal(save?.disabled, true);
            const company = holder.container?.querySelector('input[name="company"]');
            assert.equal(company instanceof HTMLInputElement && company.disabled, true);
            return undefined;
          },
          updateJob: async () => ({ error: "Check the company, title, URL, and notes." }),
          moveJob: async () => {
            throw new Error("db down");
          },
          deleteJob: async () => ({ error: "Could not save. Please try again." }),
        },
      })
    );
    holder.container = view.container;
    try {
      const add = view.container.querySelector("form");
      assert.ok(add);
      field(add, "company").value = "Beta";
      field(add, "title").value = "Designer";
      await act(async () => {
        add.requestSubmit();
      });
      assert.equal(view.container.querySelector("[role=alert]"), null);

      const edit = [...view.container.querySelectorAll("button")].find(
        (button) => button.textContent === "Edit"
      );
      assert.ok(edit);
      await act(async () => {
        edit.click();
      });
      const editor = [...view.container.querySelectorAll("form")].at(-1);
      assert.ok(editor);
      await act(async () => {
        editor.requestSubmit();
      });
      assert.equal(
        view.container.querySelector("[role=alert]")?.textContent,
        "Check the company, title, URL, and notes."
      );

      const select = view.container.querySelector("select");
      assert.ok(select);
      select.value = "offer";
      await act(async () => {
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      assert.equal(
        view.container.querySelector("[role=alert]")?.textContent,
        "Could not save. Please try again."
      );
      assert.equal(view.container.textContent?.includes("db down"), false);

      window.confirm = () => true;
      const remove = [...view.container.querySelectorAll("button")].find(
        (button) => button.textContent === "Delete"
      );
      assert.ok(remove);
      await act(async () => {
        remove.click();
      });
      assert.equal(
        view.container.querySelector("[role=alert]")?.textContent,
        "Could not save. Please try again."
      );
    } finally {
      await view.cleanup();
    }
  });
});
});
