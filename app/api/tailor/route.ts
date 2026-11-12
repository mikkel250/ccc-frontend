import { handleTailorPost } from "../lib/tailor-post";

/**
 * Seconds. Keep in sync with `TAILOR_MAX_DURATION_SEC`.
 * `CCC_FETCH_TIMEOUT_MS` is clamped below this so the 504 can be written.
 */
export const maxDuration = 130;

export async function POST(request: Request) {
  return handleTailorPost(request);
}
