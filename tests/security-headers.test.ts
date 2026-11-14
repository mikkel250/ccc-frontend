import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import nextConfig from "../next.config";
import {
  SECURITY_HEADERS_SOURCE,
  contentSecurityPolicy,
  securityHeaders,
} from "../lib/security-headers";

function headerValue(headers: { key: string; value: string }[], key: string): string {
  const found = headers.find((header) => header.key.toLowerCase() === key.toLowerCase());
  assert.ok(found, `missing ${key}`);
  return found.value;
}

function cspTokens(csp: string, directive: string): string[] | undefined {
  for (const part of csp.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (tokens[0] === directive) {
      return tokens.slice(1);
    }
  }
  return undefined;
}

describe("contentSecurityPolicy", () => {
  it("matches Next.js without-nonce defaults plus same-origin connect", () => {
    const csp = contentSecurityPolicy({ isProduction: true });

    assert.deepEqual(cspTokens(csp, "default-src"), ["'self'"]);
    assert.deepEqual(cspTokens(csp, "script-src"), ["'self'", "'unsafe-inline'"]);
    assert.deepEqual(cspTokens(csp, "style-src"), ["'self'", "'unsafe-inline'"]);
    assert.deepEqual(cspTokens(csp, "img-src"), ["'self'", "blob:", "data:"]);
    assert.deepEqual(cspTokens(csp, "font-src"), ["'self'"]);
    assert.deepEqual(cspTokens(csp, "connect-src"), ["'self'"]);
    assert.deepEqual(cspTokens(csp, "object-src"), ["'none'"]);
    assert.deepEqual(cspTokens(csp, "base-uri"), ["'self'"]);
    assert.deepEqual(cspTokens(csp, "form-action"), ["'self'"]);
    assert.deepEqual(cspTokens(csp, "frame-ancestors"), ["'none'"]);
    // Skip upgrade-insecure-requests: host is TBD and local `next start` is HTTP.
    assert.equal(cspTokens(csp, "upgrade-insecure-requests"), undefined);
  });

  it("allows eval only in development (React refresh / Next.js)", () => {
    const production = contentSecurityPolicy({ isProduction: true });
    const development = contentSecurityPolicy({ isProduction: false });

    assert.deepEqual(cspTokens(production, "script-src"), ["'self'", "'unsafe-inline'"]);
    assert.equal(cspTokens(production, "script-src")?.includes("'unsafe-eval'"), false);
    assert.deepEqual(cspTokens(development, "script-src"), [
      "'self'",
      "'unsafe-inline'",
      "'unsafe-eval'",
    ]);
  });

  it("does not open script or connect origins beyond this app", () => {
    const csp = contentSecurityPolicy({ isProduction: true });
    assert.doesNotMatch(csp, /https:/);
    assert.doesNotMatch(csp, /\s\*(;|$)/);
    assert.equal(csp.includes("CCC_API_URL"), false);
  });

  it("does not set navigate-to, so the tailor data: download link is not CSP-blocked", () => {
    const form = readFileSync(join(process.cwd(), "app/tailor-form.tsx"), "utf8");
    assert.match(
      form,
      /data:application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document;base64/
    );
    assert.equal(cspTokens(contentSecurityPolicy({ isProduction: true }), "navigate-to"), undefined);
  });
});

describe("securityHeaders", () => {
  it("sets clickjacking, MIME, referrer, and permissions policies on every response", () => {
    const headers = securityHeaders({ isProduction: false });
    assert.equal(headerValue(headers, "X-Frame-Options"), "DENY");
    assert.equal(headerValue(headers, "X-Content-Type-Options"), "nosniff");
    assert.equal(headerValue(headers, "Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.equal(
      headerValue(headers, "Permissions-Policy"),
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
    );
    assert.equal(
      headerValue(headers, "Content-Security-Policy"),
      contentSecurityPolicy({ isProduction: false })
    );
    assert.equal(
      headers.some((header) => header.key.toLowerCase() === "strict-transport-security"),
      false
    );
  });

  it("adds HSTS only in production, without preload", () => {
    const headers = securityHeaders({ isProduction: true });
    assert.equal(
      headerValue(headers, "Strict-Transport-Security"),
      "max-age=31536000; includeSubDomains"
    );
    assert.doesNotMatch(headerValue(headers, "Strict-Transport-Security"), /preload/i);
    assert.equal(
      headerValue(headers, "Content-Security-Policy"),
      contentSecurityPolicy({ isProduction: true })
    );
  });
});

describe("next.config headers", () => {
  it("applies security headers to every path and hides X-Powered-By", async () => {
    assert.equal(nextConfig.poweredByHeader, false);
    assert.equal(typeof nextConfig.headers, "function");

    const entries = await nextConfig.headers!();
    assert.equal(entries.length, 1);
    assert.equal(entries[0]?.source, SECURITY_HEADERS_SOURCE);
    assert.equal(SECURITY_HEADERS_SOURCE, "/(.*)");
    assert.deepEqual(
      entries[0]?.headers,
      securityHeaders({ isProduction: process.env.NODE_ENV === "production" })
    );
  });
});
