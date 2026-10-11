import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getServerSecret, hashAuthKey } from "@/lib/server-auth";
import { createSession } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { readLimitedJson } from "@/lib/read-limited-json";

const RegisterSchema = z.object({
  email: z.string().email().max(255),
  authKey: z.string().length(64),
  masterSalt: z.string().min(16),
  kdfParams: z.object({
    algorithm: z.literal("argon2id"),
    m: z.number().min(8192).max(1048576),
    t: z.number().min(1).max(10),
    p: z.number().min(1).max(16),
  }),

  encryptedVaultKey: z.object({
    iv: z.string(),
    tag: z.string(),
    ciphertext: z.string(),
  }),
  recoveryEncryptedKey: z
    .object({
      iv: z.string(),
      tag: z.string(),
      ciphertext: z.string(),
      salt: z.string(),
    })
    .optional(),
  recoveryEncryptedKeyV2: z.object({
    version: z.literal(2),
    iv: z.string().length(16),
    tag: z.string().length(24),
    ciphertext: z.string().length(44),
    salt: z.string().length(24),
  }),
  recoveryOpaqueRecord: z.string().min(1).max(16384),
});

export async function POST(req: Request) {
  if (!hasSameRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  try {
    getServerSecret();

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const ipLimit = await checkRateLimit(clientIp, "register", 3, 15 * 60 * 1000);

    if (!ipLimit.success) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": Math.ceil((ipLimit.reset - Date.now()) / 1000).toString() },
        }
      );
    }

    const body = await readLimitedJson(req, 32 * 1024);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

    const parseResult = RegisterSchema.safeParse(body.value);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid registration payload", details: parseResult.error.flatten() },
        { status: 400 }
      );
    }

    const { email, authKey, masterSalt, kdfParams, encryptedVaultKey, recoveryEncryptedKey, recoveryEncryptedKeyV2, recoveryOpaqueRecord } =
      parseResult.data;

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists
    const existingUser = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }

    const authHash = hashAuthKey(authKey);

    const user = await db.user.create({
      data: {
        email: normalizedEmail,
        authHash,
        masterSalt,
        kdfParams: JSON.stringify(kdfParams),
        encryptedVaultKey: JSON.stringify(encryptedVaultKey),
        recoveryEncryptedKey: recoveryEncryptedKey
          ? JSON.stringify(recoveryEncryptedKey)
          : null,
        recoveryEncryptedKeyV2: JSON.stringify(recoveryEncryptedKeyV2),
        recoveryOpaqueRecord,
      },
    });

    const userAgent = req.headers.get("user-agent") || undefined;
    await createSession(user.id, userAgent);

    await db.auditLog.create({
      data: {
        userId: user.id,
        eventType: "AUTH_REGISTER_SUCCESS",
        userAgent,
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        masterSalt: user.masterSalt,
        kdfParams: JSON.parse(user.kdfParams),
        encryptedVaultKey: JSON.parse(user.encryptedVaultKey),
        recoveryEncryptedKey: user.recoveryEncryptedKey
          ? JSON.parse(user.recoveryEncryptedKey)
          : null,
        recoveryEncryptedKeyV2: JSON.parse(user.recoveryEncryptedKeyV2!),
      },
    });
  } catch (error: unknown) {
    console.error("Register Error:", error);
    return NextResponse.json(
      { error: "Internal server error during registration" },
      { status: 500 }
    );
  }
}
