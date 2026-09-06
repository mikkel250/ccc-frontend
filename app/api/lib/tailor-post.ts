import { NextResponse } from "next/server";
import { tailorOnDemand, TRUSTED_CCC_CLIENT_IP, type TailorDeps, type TailorResult } from "./ccc-tailor";
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

  let jobDescription = "";
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "jobDescription" in body) {
      const value = (body as { jobDescription: unknown }).jobDescription;
      if (typeof value === "string") {
        jobDescription = value;
      }
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const result = await (deps.tailor ?? tailorOnDemand)(jobDescription, {
    clientIp: TRUSTED_CCC_CLIENT_IP,
  });
  if (!result.ok) {
    const status = result.status === 401 || result.status === 403 ? 502 : result.status;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ cv: result.cv, replyText: result.replyText });
}
