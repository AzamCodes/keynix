import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { hashAuthKey, timingSafeCompare } from "@/lib/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { readLimitedJson } from "@/lib/read-limited-json";
import {
  createChallengeToken,
  getOpaqueServerSetup,
  opaque,
  opaqueIdentifiers,
  RECOVERY_CHALLENGE_TTL_MS,
  sealOpaqueState,
  waitForOpaque,
} from "@/lib/recovery-protocol";

const EnvelopeSchema = z.object({
  version: z.literal(2), salt: z.string().length(24), iv: z.string().length(16),
  ciphertext: z.string().length(44), tag: z.string().length(24),
});
const Schema = z.object({
  currentAuthKey: z.string().regex(/^[a-f0-9]{64}$/i),
  recoveryOpaqueRecord: z.string().min(1).max(16384),
  recoveryEnvelope: EnvelopeSchema,
  startLoginRequest: z.string().min(1).max(8192),
});

export async function POST(request: Request) {
  if (!hasSameRequestOrigin(request)) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 403 });
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 401 });
  const limit = await checkRateLimit(`user:${session.userId}`, "recovery-enroll", 5, 60 * 60 * 1000);
  if (!limit.success) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 429 });
  const body = await readLimitedJson(request, 32 * 1024);
  if (!body.ok) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: body.status });
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success || !timingSafeCompare(hashAuthKey(parsed.data.currentAuthKey), session.user.authHash)) {
    return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 401 });
  }

  try {
    await waitForOpaque();
    const login = opaque.server.startLogin({
      serverSetup: getOpaqueServerSetup(),
      userIdentifier: session.user.email,
      registrationRecord: parsed.data.recoveryOpaqueRecord,
      startLoginRequest: parsed.data.startLoginRequest,
      identifiers: opaqueIdentifiers(session.user.email),
    });
    const id = crypto.randomUUID();
    const challenge = createChallengeToken();
    const purpose = "recovery-enroll";
    const state = sealOpaqueState(login.serverLoginState, `${id}:${purpose}:${session.userId}:${session.id}`);
    const now = new Date();
    await db.recoveryChallenge.deleteMany({ where: { expiresAt: { lte: now } } });
    await db.recoveryChallenge.create({
      data: {
        id,
        tokenHash: challenge.tokenHash,
        userId: session.userId,
        purpose,
        ...state,
        recoveryVersion: session.user.recoveryVersion,
        sessionId: session.id,
        candidateOpaqueRecord: parsed.data.recoveryOpaqueRecord,
        candidateEnvelope: JSON.stringify(parsed.data.recoveryEnvelope),
        expiresAt: new Date(now.getTime() + RECOVERY_CHALLENGE_TTL_MS),
      },
    });
    return NextResponse.json({ challenge: challenge.token, loginResponse: login.loginResponse });
  } catch {
    return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 503 });
  }
}
