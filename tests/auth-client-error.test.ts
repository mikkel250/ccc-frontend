import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  clientSafeSignInError,
  clientSafeSignOutError,
  clientSafeSignUpError,
} from "../lib/auth-client-error";

const leak = "connect ECONNREFUSED postgresql://ccc:secret@db/ccc Invalid email or password";

describe("client-safe auth errors", () => {
  it("shows allowlisted sign-in failures and hides everything else", () => {
    assert.equal(clientSafeSignInError("Invalid email or password"), "Invalid email or password");
    assert.equal(clientSafeSignInError("  Invalid email  "), "Invalid email");
    assert.equal(clientSafeSignInError("Password too long"), "Password too long");
    assert.equal(
      clientSafeSignInError("Too many requests. Please try again later."),
      "Too many requests. Please try again later."
    );
    assert.equal(clientSafeSignInError(leak), "Sign in failed. Please try again.");
    assert.equal(clientSafeSignInError("Invalid password"), "Sign in failed. Please try again.");
    assert.equal(clientSafeSignInError(undefined), "Sign in failed. Please try again.");
  });

  it("shows allowlisted sign-up failures and hides everything else", () => {
    assert.equal(clientSafeSignUpError("Registration is closed."), "Registration is closed.");
    assert.equal(clientSafeSignUpError("User already exists."), "User already exists.");
    assert.equal(
      clientSafeSignUpError("User already exists. Use another email."),
      "User already exists. Use another email."
    );
    assert.equal(clientSafeSignUpError("Password too short"), "Password too short");
    assert.equal(clientSafeSignUpError("Invalid password"), "Invalid password");
    assert.equal(clientSafeSignUpError(leak), "Registration failed. Please try again.");
    assert.equal(clientSafeSignUpError("Credential account not found"), "Registration failed. Please try again.");
  });

  it("shows only the allowlisted sign-out failure", () => {
    assert.equal(
      clientSafeSignOutError("Too many requests. Please try again later."),
      "Too many requests. Please try again later."
    );
    assert.equal(clientSafeSignOutError("Session expired"), "Sign out failed. Please try again.");
    assert.equal(clientSafeSignOutError(leak), "Sign out failed. Please try again.");
  });
});
