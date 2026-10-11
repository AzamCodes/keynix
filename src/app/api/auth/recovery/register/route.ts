import { NextResponse } from "next/server";
import { z } from "zod";
import { readLimitedJson } from "@/lib/read-limited-json";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { getOpaqueServerSetup, opaque, waitForOpaque } from "@/lib/recovery-protocol";

const Schema = z.object({ email: z.string().email().max(255), registrationRequest: z.string().min(1).max(8192) });

/** Start OPAQUE registration for a new recovery credential. */
export async function POST(request: Request) {
  if (!hasSameRequestOrigin(request)) return NextResponse.json({ error: "Invalid request" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const limit = await checkRateLimit(ip, "recovery-enroll", 5, 60 * 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "Unable to start recovery setup" }, { status: 429 });

  const body = await readLimitedJson(request, 12 * 1024);
  if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Invalid recovery setup" }, { status: 400 });

  try {
    await waitForOpaque();
    const email = parsed.data.email.toLowerCase().trim();
    const { registrationResponse } = opaque.server.createRegistrationResponse({
      serverSetup: getOpaqueServerSetup(),
      userIdentifier: email,
      registrationRequest: parsed.data.registrationRequest,
    });
    return NextResponse.json({ registrationResponse });
  } catch {
    return NextResponse.json({ error: "Recovery setup unavailable" }, { status: 503 });
  }
}
