import crypto from "crypto";

export const SERVER_SECRET = process.env.SESSION_SECRET || "default-keynix-server-secret-32bytes-long!!";


/**
 * Computes server-side auth_hash from K_auth to prevent database breach from leaking raw K_auth.
 */
export function hashAuthKey(authKey: string): string {
  return crypto
    .createHmac("sha256", SERVER_SECRET)
    .update(authKey)
    .digest("hex");
}

/**
 * Constant-time comparison to protect against timing attacks.
 */
export function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf-8");
  const bufB = Buffer.from(b, "utf-8");

  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}
