import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readTailorResponse, settleTailorAttempt, tailorFailureMessage } from "../app/tailor-form";
import { GENERIC_ERROR, TIMEOUT_ERROR } from "../app/lib/tailor-constants";

describe("tailorFailureMessage", () => {
  it("shows the timeout message for 504 even when the body has a generic error", () => {
    assert.equal(tailorFailureMessage(504, GENERIC_ERROR), TIMEOUT_ERROR);
    assert.equal(tailorFailureMessage(504, "  "), TIMEOUT_ERROR);
    assert.equal(tailorFailureMessage(504, undefined), TIMEOUT_ERROR);
  });

  it("shows the server error for other failures", () => {
    assert.equal(tailorFailureMessage(502, "Upstream failed"), "Upstream failed");
    assert.equal(tailorFailureMessage(500, "  "), GENERIC_ERROR);
    assert.equal(tailorFailureMessage(422, undefined), GENERIC_ERROR);
  });
});

describe("tailor response handling", () => {
  it("returns an empty body for malformed JSON and rethrows abort", async () => {
    const malformed = new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
    assert.deepEqual(await readTailorResponse(malformed), {});

    const aborted = {
      json: async () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      },
    } as unknown as Response;
    await assert.rejects(
      () => readTailorResponse(aborted),
      (error: unknown) => error instanceof Error && error.name === "AbortError"
    );
  });

  it("ignores results after unmount and maps abort to the timeout message", () => {
    assert.deepEqual(
      settleTailorAttempt({
        mounted: false,
        response: { ok: true, status: 200, body: { cv: "UEsDbA==" } },
      }),
      { type: "ignored" }
    );
    const abort = new Error("aborted");
    abort.name = "AbortError";
    assert.deepEqual(settleTailorAttempt({ mounted: true, error: abort }), {
      type: "message",
      message: TIMEOUT_ERROR,
    });
    assert.deepEqual(settleTailorAttempt({ mounted: true, error: new Error("network") }), {
      type: "message",
      message: GENERIC_ERROR,
    });
  });

  it("hides a success without cv and keeps a 504 timeout distinct from other errors", () => {
    assert.deepEqual(
      settleTailorAttempt({
        mounted: true,
        response: { ok: true, status: 200, body: { replyText: "Thanks" } },
      }),
      { type: "message", message: GENERIC_ERROR }
    );
    assert.deepEqual(
      settleTailorAttempt({
        mounted: true,
        response: { ok: false, status: 504, body: {} },
      }),
      { type: "message", message: TIMEOUT_ERROR }
    );
    assert.deepEqual(
      settleTailorAttempt({
        mounted: true,
        response: { ok: false, status: 500, body: { error: "Upstream failed" } },
      }),
      { type: "message", message: "Upstream failed" }
    );
    assert.deepEqual(
      settleTailorAttempt({
        mounted: true,
        response: { ok: true, status: 200, body: { cv: "UEsDbA==", replyText: "  Thanks  " } },
      }),
      { type: "success", cv: "UEsDbA==", replyText: "  Thanks  " }
    );
  });
});
