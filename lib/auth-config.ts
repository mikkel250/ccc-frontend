function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function loopbackAliasOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      return url.origin;
    }
    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      return url.origin;
    }
  } catch {
    return null;
  }
  return null;
}

export function resolveBetterAuthUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.BETTER_AUTH_URL?.trim();
  if (raw) {
    return stripTrailingSlash(raw);
  }
  if (env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_URL is required when NODE_ENV is production");
  }
  return "http://127.0.0.1:3000";
}

export function resolveBetterAuthTrustedOrigins(baseURL: string): string[] {
  const origins = new Set<string>([baseURL]);
  const alias = loopbackAliasOrigin(baseURL);
  if (alias) {
    origins.add(alias);
  }
  return [...origins];
}
