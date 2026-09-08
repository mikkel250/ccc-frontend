import { handleTailorPost } from "../lib/tailor-post";

export async function POST(request: Request) {
  return handleTailorPost(request);
}
