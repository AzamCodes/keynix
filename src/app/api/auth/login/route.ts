import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getServerSecret, hashAuthKey, timingSafeCompare } from "@/lib/server-auth";
import { createSession } from "@/lib/session";
import { checkRateLimit } from "@/lib/rate-limit";
import { hasSameRequestOrigin } from "@/lib/request-origin";
import { readLimitedJson } from "@/lib/read-limited-json";

const LoginSchema = z.object({
  email: z.string().email(),
  authKey: z.string().length(64),
});

export async function POST(req: Request) {
  if (!hasSameRequestOrigin(req)) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  try {
    getServerSecret();

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "127.0.0.1";
    const ipLimit = await checkRateLimit(clientIp, "login", 5, 60 * 1000);

    if (!ipLimit.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        {
          status: 429,
          headers: { "Retry-After": Math.ceil((ipLimit.reset - Date.now()) / 1000).toString() },
        }
      );
    }

    const body = await readLimitedJson(req, 8 * 1024);
    if (!body.ok) return NextResponse.json({ error: body.error }, { status: body.status });

    const parseResult = LoginSchema.safeParse(body.value);

    if (!parseResult.success) {
      return NextResponse.json(
        { error: "Invalid login payload" },
        { status: 400 }
      );
    }

    const { email, authKey } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await db.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const computedAuthHash = hashAuthKey(authKey);
    const isValid = timingSafeCompare(computedAuthHash, user.authHash);

    if (!isValid) {
      await db.auditLog.create({
        data: {
          userId: user.id,
          eventType: "AUTH_LOGIN_FAILED",
          userAgent: req.headers.get("user-agent") || undefined,
        },
      }).catch(() => {});

      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      );
    }

    const userAgent = req.headers.get("user-agent") || undefined;
    await createSession(user.id, userAgent);

    await db.auditLog.create({
      data: {
        userId: user.id,
        eventType: "AUTH_LOGIN_SUCCESS",
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
        recoveryEncryptedKeyV2: user.recoveryEncryptedKeyV2
          ? JSON.parse(user.recoveryEncryptedKeyV2)
          : null,
      },
    });
  } catch (error: unknown) {
    console.error("Login Error:", error);
    return NextResponse.json(
      { error: "Internal server error during login" },
      { status: 500 }
    );
  }
}
