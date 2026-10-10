import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentSession, revokeAllUserSessions, createSession } from "@/lib/session";
import { hashAuthKey } from "@/lib/server-auth";

const ChangePasswordSchema = z.object({
  newAuthKey: z.string().length(64),
  newMasterSalt: z.string(),
  newKdfParams: z.object({
    algorithm: z.literal("argon2id"),
    m: z.number(),
    t: z.number(),
    p: z.number(),
  }),
  newEncryptedVaultKey: z.object({
    iv: z.string(),
    tag: z.string(),
    ciphertext: z.string(),
  }),
});

export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parseResult = ChangePasswordSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid password change payload" },
        { status: 400 }
      );
    }

    const { newAuthKey, newMasterSalt, newKdfParams, newEncryptedVaultKey } = parseResult.data;
    const newAuthHash = hashAuthKey(newAuthKey);

    await db.user.update({
      where: { id: session.userId },
      data: {
        authHash: newAuthHash,
        masterSalt: newMasterSalt,
        kdfParams: JSON.stringify(newKdfParams),
        encryptedVaultKey: JSON.stringify(newEncryptedVaultKey),
      },
    });

    // Revoke all active sessions across all devices for security
    await revokeAllUserSessions(session.userId);

    // Re-authenticate current device session
    const userAgent = req.headers.get("user-agent") || undefined;
    await createSession(session.userId, userAgent);

    await db.auditLog.create({
      data: {
        userId: session.userId,
        eventType: "MASTER_PASSWORD_CHANGED",
        userAgent,
      },
    }).catch(() => {});


    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Change Password Error:", error);
    return NextResponse.json(
      { error: "Failed to update master password" },
      { status: 500 }
    );
  }
}
