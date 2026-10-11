import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashAuthKey } from "@/lib/server-auth";
import { clearSessionCookie } from "@/lib/session";
import { readLimitedJson } from "@/lib/read-limited-json";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import {
  openOpaqueState,
  opaque,
  opaqueIdentifiers,
  waitForOpaque,
} from "@/lib/recovery-protocol";

const Schema = z.object({
  challenge: z.string().length(43),
  finishLoginRequest: z.string().min(1).max(8192),
  newAuthKey: z.string().regex(/^[a-f0-9]{64}$/i),
  newMasterSalt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
  newKdfParams: z.object({
    algorithm: z.literal("argon2id"),
    m: z.literal(65536),
    t: z.literal(3),
    p: z.literal(4),
  }),
  newEncryptedVaultKey: z.object({
    iv: z.string().length(16),
    tag: z.string().length(24),
    ciphertext: z.string().length(44),
  }),
});

const invalidProof = () => NextResponse.json({ error: "Unable to complete recovery" }, { status: 400 });

/** Complete recovery with a one-time OPAQUE proof; no session is accepted as authorization. */
export async function POST(request: Request) {
  if (!hasSameRequestOrigin(request)) return invalidProof();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  const ipLimit = await checkRateLimit(ip, "recovery-finish", 10, 60 * 60 * 1000);
  if (!ipLimit.success) return NextResponse.json({ error: "Unable to complete recovery" }, { status: 429 });

  const body = await readLimitedJson(request, 16 * 1024);
  if (!body.ok) return invalidProof();
  const parsed = Schema.safeParse(body.value);
  if (!parsed.success) return invalidProof();

  const challengeHash = crypto.createHash("sha256").update(parsed.data.challenge).digest("hex");
  const challengeLimit = await checkRateLimit(challengeHash, "recovery-finish", 3, 60 * 60 * 1000);
  if (!challengeLimit.success) return invalidProof();

  try {
    const challenge = await db.recoveryChallenge.findUnique({ where: { tokenHash: challengeHash } });
    const now = new Date();
    if (
      !challenge || challenge.purpose !== "recovery" || challenge.consumedAt ||
      challenge.expiresAt <= now || !challenge.userId || challenge.recoveryVersion === null
    ) return invalidProof();

    // Consume before proof validation so even invalid proof requests cannot replay this state.
    const consumed = await db.recoveryChallenge.updateMany({
      where: {
        id: challenge.id,
        purpose: "recovery",
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return invalidProof();

    const user = await db.user.findUnique({ where: { id: challenge.userId } });
    if (!user?.recoveryOpaqueRecord || user.recoveryVersion !== challenge.recoveryVersion) return invalidProof();
    const expectedRecoveryVersion = challenge.recoveryVersion;

    await waitForOpaque();
    const stateBinding = `${challenge.id}:recovery:${user.id}`;
    const serverLoginState = openOpaqueState(challenge.stateIv, challenge.stateCiphertext, stateBinding);
    opaque.server.finishLogin({
      serverLoginState,
      finishLoginRequest: parsed.data.finishLoginRequest,
      identifiers: opaqueIdentifiers(user.email),
    });

    const authHash = hashAuthKey(parsed.data.newAuthKey);
    await db.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, recoveryVersion: expectedRecoveryVersion },
        data: {
          authHash,
          masterSalt: parsed.data.newMasterSalt,
          kdfParams: JSON.stringify(parsed.data.newKdfParams),
          encryptedVaultKey: JSON.stringify(parsed.data.newEncryptedVaultKey),
          recoveryVersion: { increment: 1 },
        },
      });
      if (changed.count !== 1) throw new Error("Recovery compare-and-swap failed");
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.auditLog.create({
        data: { userId: user.id, eventType: "ACCOUNT_RECOVERED" },
      });
    });

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch {
    // Never log authentication proofs, challenge state, or request bodies.
    return NextResponse.json({ error: "Unable to complete recovery" }, { status: 500 });
  }
}
