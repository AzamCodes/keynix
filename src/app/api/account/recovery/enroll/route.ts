import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/session";
import { hashAuthKey, timingSafeCompare } from "@/lib/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { readLimitedJson } from "@/lib/read-limited-json";
import { getOpaqueServerSetup, opaque, waitForOpaque } from "@/lib/recovery-protocol";

const Schema = z.object({ registrationRequest: z.string().min(1).max(8192), currentAuthKey: z.string().regex(/^[a-f0-9]{64}$/i) });

/** Return a recovery registration response only after fresh legacy credential proof. */
export async function POST(request: Request) {
  if (!hasSameRequestOrigin(request)) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 403 });
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 401 });
  const limit = await checkRateLimit(`user:${session.userId}`, "recovery-enroll", 5, 60 * 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 429 });
  const body = await readLimitedJson(request, 12 * 1024);
  if (!body.ok) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: body.status });
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success || !timingSafeCompare(hashAuthKey(parsed.data.currentAuthKey), session.user.authHash)) {
    return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 401 });
  }
  try {
    await waitForOpaque();
    const { registrationResponse } = opaque.server.createRegistrationResponse({
      serverSetup: getOpaqueServerSetup(),
      userIdentifier: session.user.email,
      registrationRequest: parsed.data.registrationRequest,
    });
    return NextResponse.json({ registrationResponse });
  } catch {
    return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 503 });
  }
}
