import { NextResponse } from "next/server";
import { hasSameRequestOrigin } from "@/lib/request-origin";

export async function POST(req: Request) {
  if (!hasSameRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  // The current primary-authentication protocol has no fresh, non-replayable
  // credential proof. A session and client-supplied replacement key are not
  // sufficient authorization. Keep this route closed until a reviewed PAKE
  // migration supplies operation-bound step-up authorization.
  return NextResponse.json(
    { error: "Password changes require fresh credential authorization, which is not available yet." },
    { status: 501 }
  );
}
