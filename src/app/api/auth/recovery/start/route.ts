import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { readLimitedJson } from "@/lib/read-limited-json";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import {
  createChallengeToken,
  getOpaqueServerSetup,
  opaque,
  opaqueIdentifiers,
  RECOVERY_CHALLENGE_TTL_MS,
  sealOpaqueState,
  waitForOpaque,
} from "@/lib/recovery-protocol";

const Schema = z.object({
  email: z.string().email().max(255),
  startLoginRequest: z.string().min(1).max(8192),
});

function dummyRecoveryEnvelope() {
  return {
    version: 2,
    salt: crypto.randomBytes(16).toString("base64"),
    iv: crypto.randomBytes(12).toString("base64"),
    ciphertext: crypto.randomBytes(32).toString("base64"),
    tag: crypto.randomBytes(16).toString("base64"),
  };
}

/** Start an account-bound OPAQUE recovery exchange without a session. */
export async function POST(request: Request) {
  if (!hasSameRequestOrigin(request)) return NextResponse.json({ error: "Unable to start recovery" }, { status: 403 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const limit = await checkRateLimit(ip, "recovery-start", 10, 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "Unable to start recovery" }, { status: 429 });

  const body = await readLimitedJson(request, 12 * 1024);
  if (!body.ok) return NextResponse.json({ error: "Unable to start recovery" }, { status: body.status });
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success) return NextResponse.json({ error: "Unable to start recovery" }, { status: 400 });

  try {
    await waitForOpaque();
    const email = parsed.data.email.toLowerCase().trim();
    const user = await db.user.findUnique({ where: { email } });
    const opaqueStart = opaque.server.startLogin({
      serverSetup: getOpaqueServerSetup(),
      userIdentifier: email,
      registrationRecord: user?.recoveryOpaqueRecord ?? null,
      startLoginRequest: parsed.data.startLoginRequest,
      identifiers: opaqueIdentifiers(email),
    });

    const id = crypto.randomUUID();
    const challenge = createChallengeToken();
    const purpose = "recovery";
    const binding = `${id}:${purpose}:${user?.id ?? "unknown"}`;
    const state = sealOpaqueState(opaqueStart.serverLoginState, binding);
    const now = new Date();

    // Persist only challenges for fully enrolled accounts. Unknown and legacy
    // accounts receive the same-shaped synthetic response without allowing
    // unauthenticated callers to fill the challenge table.
    if (user?.recoveryOpaqueRecord && user.recoveryEncryptedKeyV2) {
      await db.recoveryChallenge.deleteMany({ where: { expiresAt: { lte: now } } });
      await db.recoveryChallenge.create({
        data: {
          id,
          tokenHash: challenge.tokenHash,
          userId: user.id,
          purpose,
          ...state,
          recoveryVersion: user.recoveryVersion,
          expiresAt: new Date(now.getTime() + RECOVERY_CHALLENGE_TTL_MS),
        },
      });
    }

    let envelope = dummyRecoveryEnvelope();
    if (user?.recoveryOpaqueRecord && user.recoveryEncryptedKeyV2) {
      const stored = JSON.parse(user.recoveryEncryptedKeyV2) as Record<string, unknown>;
      if (stored.version === 2) envelope = stored as typeof envelope;
    }

    return NextResponse.json({
      challenge: challenge.token,
      loginResponse: opaqueStart.loginResponse,
      recoveryEnvelope: envelope,
    });
  } catch {
    return NextResponse.json({ error: "Unable to start recovery" }, { status: 503 });
  }
}
