import { NextResponse } from "next/server";
import { tailorOnDemand } from "../lib/ccc-tailor";

export async function POST(request: Request) {
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

  const result = await tailorOnDemand(jobDescription);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ cv: result.cv, replyText: result.replyText });
}
