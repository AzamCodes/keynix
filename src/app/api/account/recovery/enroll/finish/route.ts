import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { hashAuthKey, timingSafeCompare } from "@/lib/server-auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { readLimitedJson } from "@/lib/read-limited-json";
import { openOpaqueState, opaque, opaqueIdentifiers, waitForOpaque } from "@/lib/recovery-protocol";

const Schema = z.object({
  challenge: z.string().length(43),
  finishLoginRequest: z.string().min(1).max(8192),
  currentAuthKey: z.string().regex(/^[a-f0-9]{64}$/i),
});

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

  const challengeHash = crypto.createHash("sha256").update(parsed.data.challenge).digest("hex");
  try {
    const challenge = await db.recoveryChallenge.findUnique({ where: { tokenHash: challengeHash } });
    const now = new Date();
    if (
      !challenge || challenge.purpose !== "recovery-enroll" || challenge.userId !== session.userId ||
      challenge.sessionId !== session.id || challenge.consumedAt || challenge.expiresAt <= now ||
      challenge.recoveryVersion !== session.user.recoveryVersion || !challenge.candidateOpaqueRecord ||
      !challenge.candidateEnvelope
    ) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 400 });
    const expectedRecoveryVersion = challenge.recoveryVersion;

    const consumed = await db.recoveryChallenge.updateMany({
      where: { id: challenge.id, purpose: "recovery-enroll", userId: session.userId, sessionId: session.id, consumedAt: null, expiresAt: { gt: now } },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 400 });

    await waitForOpaque();
    const state = openOpaqueState(
      challenge.stateIv,
      challenge.stateCiphertext,
      `${challenge.id}:recovery-enroll:${session.userId}:${session.id}`
    );
    opaque.server.finishLogin({
      serverLoginState: state,
      finishLoginRequest: parsed.data.finishLoginRequest,
      identifiers: opaqueIdentifiers(session.user.email),
    });

    const envelope = JSON.parse(challenge.candidateEnvelope) as { version: 2 };
    await db.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: {
          id: session.userId,
          authHash: session.user.authHash,
          recoveryVersion: expectedRecoveryVersion,
        },
        data: {
          recoveryOpaqueRecord: challenge.candidateOpaqueRecord,
          recoveryEncryptedKeyV2: JSON.stringify(envelope),
          // This endpoint is an explicit, confirmed rotation. Retire the old
          // v1 wrapper only after the candidate OPAQUE record was verified.
          recoveryEncryptedKey: null,
          recoveryVersion: { increment: 1 },
        },
      });
      if (updated.count !== 1) throw new Error("Recovery enrollment compare-and-swap failed");
      await tx.auditLog.create({ data: { userId: session.userId, eventType: "RECOVERY_MATERIAL_ROTATED" } });
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Unable to enroll recovery" }, { status: 500 });
  }
}
