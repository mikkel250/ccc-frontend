import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tailorFailureMessage } from "../app/tailor-form";
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
