import { NextResponse } from "next/server";
import { tailorOnDemand, type TailorDeps, type TailorResult } from "./ccc-tailor";
import { readTailorJobDescription } from "./read-json-body";
import { getSessionUserId } from "@/lib/session";

export type TailorPostDeps = {
  getSessionUserId?: () => Promise<string | null>;
  tailor?: (jobDescription: string, deps?: TailorDeps) => Promise<TailorResult>;
};

export async function handleTailorPost(
  request: Request,
  deps: TailorPostDeps = {}
) {
  const userId = await (deps.getSessionUserId ?? getSessionUserId)();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = await readTailorJobDescription(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const result = await (deps.tailor ?? tailorOnDemand)(parsed.jobDescription);
  if (!result.ok) {
    const status = result.status === 401 || result.status === 403 ? 502 : result.status;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ cv: result.cv, replyText: result.replyText });
}
