import { isIP } from "node:net";

const LOOPBACK_CLIENT_IP = "127.0.0.1";

export type ClientIpEnv = {
  VERCEL?: string;
  CCC_TRUSTED_PROXY?: string;
};

function trustsVercelPlatform(env: ClientIpEnv): boolean {
  const mode = env.CCC_TRUSTED_PROXY?.trim();
  if (mode === "vercel") {
    return true;
  }
  if (mode) {
    return false;
  }
  return env.VERCEL === "1";
}

function firstPlatformIp(header: string | null): string | null {
  const token = header?.split(",")[0]?.trim() ?? "";
  const bare = token.startsWith("[") && token.endsWith("]") ? token.slice(1, -1) : token;
  return isIP(bare) ? bare : null;
}

export function clientIpForCcc(
  request: Pick<Request, "headers">,
  env?: ClientIpEnv
): string {
  const source: ClientIpEnv = env ?? {
    VERCEL: process.env.VERCEL,
    CCC_TRUSTED_PROXY: process.env.CCC_TRUSTED_PROXY,
  };
  if (!trustsVercelPlatform(source)) {
    return LOOPBACK_CLIENT_IP;
  }
  return firstPlatformIp(request.headers.get("x-vercel-forwarded-for")) ?? LOOPBACK_CLIENT_IP;
}
