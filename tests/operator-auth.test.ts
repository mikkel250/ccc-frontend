import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { authorizeOperator } from "../app/api/lib/operator-auth";
import { GENERIC_ERROR, MISSING_ENV, OPERATOR_TOKEN_HEADER } from "../app/lib/tailor-constants";

function requestWithToken(token?: string): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== undefined) {
    headers.set(OPERATOR_TOKEN_HEADER, token);
  }
  return new Request("http://127.0.0.1/api/tailor", { method: "POST", headers });
}

describe("authorizeOperator", () => {
  it("allows local requests when OPERATOR_TOKEN is unset", () => {
    const result = authorizeOperator(requestWithToken(), { NODE_ENV: "development" });
    assert.deepEqual(result, { ok: true });
  });

  it("fails closed in production when OPERATOR_TOKEN is unset", () => {
    const result = authorizeOperator(requestWithToken(), { NODE_ENV: "production" });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, 503);
      assert.equal(result.error, MISSING_ENV);
    }
  });

  it("rejects a missing or wrong token when OPERATOR_TOKEN is set", () => {
    const env = { OPERATOR_TOKEN: "correct-operator-token", NODE_ENV: "development" };
    const missing = authorizeOperator(requestWithToken(), env);
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.status, 401);
      assert.equal(missing.error, GENERIC_ERROR);
    }

    const wrong = authorizeOperator(requestWithToken("nope"), env);
    assert.equal(wrong.ok, false);
    if (!wrong.ok) {
      assert.equal(wrong.status, 401);
    }
  });

  it("accepts a matching operator token", () => {
    const result = authorizeOperator(requestWithToken("correct-operator-token"), {
      OPERATOR_TOKEN: "correct-operator-token",
      NODE_ENV: "production",
    });
    assert.deepEqual(result, { ok: true });
  });
});
