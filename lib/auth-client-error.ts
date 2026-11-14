const SIGN_IN_FAILED = "Sign in failed. Please try again.";
const SIGN_UP_FAILED = "Registration failed. Please try again.";
const SIGN_OUT_FAILED = "Sign out failed. Please try again.";
const TOO_MANY_REQUESTS = "Too many requests. Please try again later.";

const SIGN_IN_SAFE = new Set([
  "Invalid email or password",
  "Invalid email",
  "Password too long",
  TOO_MANY_REQUESTS,
]);

const SIGN_UP_SAFE = new Set([
  "Registration is closed.",
  "User already exists.",
  "User already exists. Use another email.",
  "Invalid email",
  "Invalid password",
  "Password too short",
  "Password too long",
  TOO_MANY_REQUESTS,
]);

const SIGN_OUT_SAFE = new Set([TOO_MANY_REQUESTS]);

function clientSafeAuthMessage(
  message: string | undefined,
  allowlist: ReadonlySet<string>,
  fallback: string
): string {
  const trimmed = message?.trim() ?? "";
  if (allowlist.has(trimmed)) {
    return trimmed;
  }
  return fallback;
}

export function clientSafeSignInError(message: string | undefined): string {
  return clientSafeAuthMessage(message, SIGN_IN_SAFE, SIGN_IN_FAILED);
}

export function clientSafeSignUpError(message: string | undefined): string {
  return clientSafeAuthMessage(message, SIGN_UP_SAFE, SIGN_UP_FAILED);
}

export function clientSafeSignOutError(message: string | undefined): string {
  return clientSafeAuthMessage(message, SIGN_OUT_SAFE, SIGN_OUT_FAILED);
}
