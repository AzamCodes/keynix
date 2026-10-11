import { NextResponse } from "next/server";
import { hasSameRequestOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!hasSameRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  // Account deletion is destructive and cannot use a session as fresh proof.
  // Keep it closed until reviewed, operation-bound PAKE step-up is available.
  return NextResponse.json(
    { error: "Account deletion requires fresh credential authorization, which is not available yet." },
    { status: 501 }
  );
}
