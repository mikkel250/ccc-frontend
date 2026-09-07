import { isIP } from "node:net";

function parsedIp(value: string | null | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  let candidate = value.trim();
  if (candidate.startsWith("[") && candidate.endsWith("]")) {
    candidate = candidate.slice(1, -1).trim();
  }
  return isIP(candidate) ? candidate : undefined;
}

/** First valid hop from proxy headers; undefined when none can be trusted. */
export function requestClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const firstHop = forwarded?.split(",")[0];
  return parsedIp(firstHop) ?? parsedIp(request.headers.get("x-real-ip"));
}
