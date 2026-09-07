import { NextResponse } from "next/server";
import { tailorOnDemand } from "../lib/ccc-tailor";
import { authorizeOperator } from "../lib/operator-auth";
import { readTailorJobDescription } from "../lib/read-json-body";

/** Seconds. Must exceed DEFAULT_CCC_FETCH_TIMEOUT_MS. */
export const maxDuration = 130;

export async function POST(request: Request) {
  const auth = authorizeOperator(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = await readTailorJobDescription(request);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  }

  const result = await tailorOnDemand(parsed.jobDescription);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ cv: result.cv, replyText: result.replyText });
}
