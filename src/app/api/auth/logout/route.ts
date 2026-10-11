import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";
import { hasSameRequestOrigin } from "@/lib/request-origin";

export async function POST(request: Request) {
  if (!hasSameRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const revoked = await destroySession();
  if (!revoked) {
    return NextResponse.json({ error: "Session revocation failed" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
