import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { BoardJob, JobStatus } from "../lib/jobs";
import { CLIENT_FETCH_TIMEOUT_MS, TIMEOUT_ERROR } from "../app/lib/tailor-constants";

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
let TailorForm!: typeof import("../app/tailor-form").TailorForm;
let SignOutButton!: typeof import("../app/sign-out-button").SignOutButton;

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
  ({ TailorForm } = await import("../app/tailor-form"));
  ({ SignOutButton } = await import("../app/sign-out-button"));
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
    let releaseCreate: () => void = () => undefined;
    const createPending = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const view = await render(
      createElement(KanbanBoard, {
        jobs: [sampleJob],
        actions: {
          createJob: () => createPending.then(() => undefined),
          updateJob: async () => ({ error: "Check the company, title, URL, and notes." }),
          moveJob: async () => {
            throw new Error("db down");
          },
          deleteJob: async () => ({ error: "Could not save. Please try again." }),
        },
      })
    );
    try {
      const add = view.container.querySelector("form");
      assert.ok(add);
      field(add, "company").value = "Beta";
      field(add, "title").value = "Designer";
      await act(async () => {
        add.requestSubmit();
      });
      const save = [...view.container.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Saving")
      );
      assert.equal(save?.textContent, "Saving…");
      assert.equal(save?.disabled, true);
      const company = view.container.querySelector('input[name="company"]');
      assert.equal(company instanceof HTMLInputElement && company.disabled, true);
      releaseCreate();
      await act(async () => {
        await createPending;
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

describe("tailor form", { concurrency: 1 }, () => {
  type HeldFetch = {
    signal: AbortSignal | null;
    resolve: (response: Response) => void;
  };

  function holdFetches(options?: { rejectOnAbort?: boolean }): {
    calls: HeldFetch[];
    restore: () => void;
  } {
    const calls: HeldFetch[] = [];
    const previous = globalThis.fetch;
    const rejectOnAbort = options?.rejectOnAbort !== false;
    globalThis.fetch = ((_input: unknown, init?: RequestInit) => {
      const signal = init?.signal ?? null;
      return new Promise<Response>((resolve, reject) => {
        if (rejectOnAbort) {
          const fail = () => {
            const error = new Error("aborted");
            error.name = "AbortError";
            reject(error);
          };
          if (signal?.aborted) {
            fail();
            return;
          }
          signal?.addEventListener("abort", fail, { once: true });
        }
        calls.push({ signal, resolve });
      });
    }) as typeof fetch;
    return {
      calls,
      restore() {
        globalThis.fetch = previous;
      },
    };
  }

  async function submitJob(container: ParentNode, description: string) {
    const field = container.querySelector("textarea");
    assert.ok(field instanceof HTMLTextAreaElement);
    const form = container.querySelector("form");
    assert.ok(form instanceof HTMLFormElement);
    await act(async () => {
      typeInto(field, description);
    });
    await submitForm(form);
  }

  it("aborts an in-flight tailor request on unmount without rendering an error", async () => {
    const held = holdFetches();
    const view = await render(createElement(TailorForm));
    try {
      await submitJob(view.container, "Senior engineer");
      assert.equal(view.container.querySelector("button")?.textContent, "Tailoring…");
      assert.equal(held.calls.length, 1);
      assert.equal(held.calls[0]?.signal?.aborted, false);
      await view.cleanup();
      assert.equal(held.calls[0]?.signal?.aborted, true);
      await act(async () => {
        await Promise.resolve();
      });
      assert.equal(document.body.textContent?.includes(TIMEOUT_ERROR), false);
      assert.equal(document.querySelector("[role=alert]"), null);
    } finally {
      held.restore();
    }
  });

  it("aborts a stalled tailor request when the client timeout fires", async () => {
    const held = holdFetches();
    const view = await render(createElement(TailorForm));
    const originalSetTimeout = window.setTimeout.bind(window);
    const originalClearTimeout = window.clearTimeout.bind(window);
    const armed: { id: number; delay: number; fire: () => void }[] = [];
    let nextId = 1;
    window.setTimeout = ((handler: TimerHandler, delay?: number, ...args: unknown[]) => {
      if (delay === CLIENT_FETCH_TIMEOUT_MS && typeof handler === "function") {
        const id = nextId++;
        armed.push({
          id,
          delay,
          fire() {
            handler(...args);
          },
        });
        return id;
      }
      return originalSetTimeout(handler as never, delay as never, ...(args as never[]));
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      const index = armed.findIndex((timer) => timer.id === id);
      if (index >= 0) {
        armed.splice(index, 1);
        return;
      }
      originalClearTimeout(id as never);
    }) as typeof window.clearTimeout;
    try {
      await submitJob(view.container, "Senior engineer");
      assert.equal(armed.length, 1);
      assert.equal(armed[0]?.delay, CLIENT_FETCH_TIMEOUT_MS);
      assert.equal(held.calls[0]?.signal?.aborted, false);
      const pending = armed[0];
      assert.ok(pending);
      await act(async () => {
        pending.fire();
        await Promise.resolve();
      });
      assert.equal(held.calls[0]?.signal?.aborted, true);
      assert.equal(view.container.querySelector("[role=alert]")?.textContent, TIMEOUT_ERROR);
      assert.equal(view.container.querySelector("button")?.textContent, "Tailor CV");
    } finally {
      window.setTimeout = originalSetTimeout as typeof window.setTimeout;
      window.clearTimeout = originalClearTimeout as typeof window.clearTimeout;
      held.restore();
      await view.cleanup();
    }
  });

  it("cancels the previous tailor request when another is submitted", async () => {
    const held = holdFetches();
    const view = await render(createElement(TailorForm));
    try {
      await submitJob(view.container, "Senior engineer");
      const form = view.container.querySelector("form");
      assert.ok(form instanceof HTMLFormElement);
      await submitForm(form);
      await act(async () => {
        await Promise.resolve();
      });
      assert.equal(held.calls.length, 2);
      assert.equal(held.calls[0]?.signal?.aborted, true);
      assert.equal(held.calls[1]?.signal?.aborted, false);
      assert.equal(view.container.querySelector("[role=alert]"), null);
      assert.equal(view.container.querySelector("button")?.textContent, "Tailoring…");

      held.calls[1]?.resolve(Response.json({ cv: "UEsDbA==", replyText: "Thanks" }));
      await act(async () => {
        await Promise.resolve();
      });
      assert.equal(view.container.querySelector("[role=alert]"), null);
      assert.match(view.container.textContent ?? "", /Download tailored CV/);
      const reply = view.container.querySelector("textarea[readonly]");
      assert.ok(reply instanceof HTMLTextAreaElement);
      assert.equal(reply.value, "Thanks");
    } finally {
      held.restore();
      await view.cleanup();
    }
  });

  it("keeps the latest tailor result when an older request settles late", async () => {
    const held = holdFetches({ rejectOnAbort: false });
    const view = await render(createElement(TailorForm));
    try {
      await submitJob(view.container, "Senior engineer");
      const form = view.container.querySelector("form");
      assert.ok(form instanceof HTMLFormElement);
      await submitForm(form);
      await act(async () => {
        await Promise.resolve();
      });
      assert.equal(held.calls.length, 2);

      held.calls[0]?.resolve(Response.json({ cv: "T0xE", replyText: "Old reply" }));
      await act(async () => {
        await Promise.resolve();
      });
      assert.equal(view.container.querySelector("[role=alert]"), null);
      assert.equal(view.container.querySelector("a"), null);
      assert.equal(view.container.querySelector("button")?.textContent, "Tailoring…");

      held.calls[1]?.resolve(Response.json({ cv: "TkVX", replyText: "New reply" }));
      await act(async () => {
        await Promise.resolve();
      });
      const reply = view.container.querySelector("textarea[readonly]");
      assert.ok(reply instanceof HTMLTextAreaElement);
      assert.equal(reply.value, "New reply");
      const href = view.container.querySelector("a")?.getAttribute("href") ?? "";
      assert.match(href, /TkVX/);
      assert.doesNotMatch(href, /T0xE/);
      assert.equal(view.container.querySelector("[role=alert]"), null);
    } finally {
      held.restore();
      await view.cleanup();
    }

    const errorHeld = holdFetches({ rejectOnAbort: false });
    const errorView = await render(createElement(TailorForm));
    try {
      await submitJob(errorView.container, "Senior engineer");
      const form = errorView.container.querySelector("form");
      assert.ok(form instanceof HTMLFormElement);
      await submitForm(form);
      await act(async () => {
        await Promise.resolve();
      });

      errorHeld.calls[1]?.resolve(Response.json({ cv: "TkVX", replyText: "New reply" }));
      await act(async () => {
        await Promise.resolve();
      });
      errorHeld.calls[0]?.resolve(
        Response.json({ error: "Upstream failed" }, { status: 500 })
      );
      await act(async () => {
        await Promise.resolve();
      });
      const reply = errorView.container.querySelector("textarea[readonly]");
      assert.ok(reply instanceof HTMLTextAreaElement);
      assert.equal(reply.value, "New reply");
      assert.equal(errorView.container.querySelector("[role=alert]"), null);
      assert.equal(errorView.container.textContent?.includes("Upstream failed"), false);
    } finally {
      errorHeld.restore();
      await errorView.cleanup();
    }
  });
});

describe("sign out", { concurrency: 1 }, () => {
  it("redirects to login after a successful sign-out", async () => {
    let release: (result: { error: null }) => void = () => undefined;
    const pending = new Promise<{ error: null }>((resolve) => {
      release = resolve;
    });
    const assigned: string[] = [];
    const view = await render(
      createElement(SignOutButton, {
        signOut: () => pending,
        goToLogin: () => {
          assigned.push("/login");
        },
      })
    );
    try {
      const button = view.container.querySelector("button");
      assert.equal(button?.textContent, "Sign out");
      await act(async () => {
        button?.click();
      });
      assert.equal(view.container.querySelector("button")?.textContent, "Signing out…");
      assert.equal(view.container.querySelector("button")?.disabled, true);
      assert.deepEqual(assigned, []);
      release({ error: null });
      await act(async () => {
        await pending;
      });
      assert.deepEqual(assigned, ["/login"]);
      assert.equal(view.container.querySelector("[role=alert]"), null);
    } finally {
      await view.cleanup();
    }
  });

  it("shows an API error and does not redirect", async () => {
    const assigned: string[] = [];
    const view = await render(
      createElement(SignOutButton, {
        signOut: async () => ({ error: { message: "Session expired" } }),
        goToLogin: () => {
          assigned.push("/login");
        },
      })
    );
    try {
      await act(async () => {
        view.container.querySelector("button")?.click();
      });
      assert.equal(view.container.querySelector("[role=alert]")?.textContent, "Session expired");
      assert.deepEqual(assigned, []);
      assert.equal(view.container.querySelector("button")?.disabled, false);
    } finally {
      await view.cleanup();
    }
  });

  it("shows a generic error when sign-out throws and does not redirect", async () => {
    const assigned: string[] = [];
    const view = await render(
      createElement(SignOutButton, {
        signOut: async () => {
          throw new Error("network down");
        },
        goToLogin: () => {
          assigned.push("/login");
        },
      })
    );
    try {
      await act(async () => {
        view.container.querySelector("button")?.click();
      });
      assert.equal(
        view.container.querySelector("[role=alert]")?.textContent,
        "Sign out failed. Please try again."
      );
      assert.deepEqual(assigned, []);
      assert.equal(view.container.querySelector("button")?.disabled, false);
    } finally {
      await view.cleanup();
    }
  });
});
});
