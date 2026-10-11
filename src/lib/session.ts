import { cookies } from "next/headers";
import crypto from "crypto";
import { db } from "./db";

const SESSION_COOKIE_NAME = "keynix_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

export async function createSession(userId: string, userAgent?: string, ipAddress?: string) {
  // Generate 256-bit (32-byte) random session token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  // Store hashed session token in DB
  await db.session.create({
    data: {
      userId,
      tokenHash,
      userAgent: userAgent || null,
      ipAddress: ipAddress || null,
      expiresAt,
    },
  });

  // Set HTTP-only secure cookie
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return rawToken;
}

export async function getCurrentSession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!rawToken) return null;

  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

  const session = await db.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!session) return null;

  // Check expiration or revocation
  if (session.revokedAt || new Date() > session.expiresAt) {
    return null;
  }

  return session;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  let revoked = true;

  if (rawToken) {
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    try {
      const result = await db.session.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // A zero count means this token is absent or already revoked; in either
      // case no active server-side session remains for it.
      revoked = result.count <= 1;
    } catch {
      revoked = false;
    }
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
  return revoked;
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function revokeAllUserSessions(userId: string) {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

