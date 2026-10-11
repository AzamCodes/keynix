import crypto from "crypto";

// Preserve the existing local/test key so development data remains compatible.
// This known value must never be used by a production server.
const DEVELOPMENT_SESSION_SECRET = "default-keynix-server-secret-32bytes-long!!";
const MIN_DEPLOYED_SECRET_BYTES = 32;

function isDeployedEnvironment(): boolean {
  return process.env.NODE_ENV === "production" ||
    process.env.VERCEL_ENV === "production" ||
    process.env.VERCEL_ENV === "preview";
}

export function getServerSecret(): string {
  const configuredSecret = process.env.SESSION_SECRET;
  if (configuredSecret?.trim()) {
    if (isDeployedEnvironment()) {
      const secretBytes = Buffer.from(configuredSecret, "utf8");
      const normalized = configuredSecret.trim().toLowerCase();
      const knownWeak = configuredSecret === DEVELOPMENT_SESSION_SECRET ||
        /^(.)\1+$/.test(configuredSecret) ||
        ["change-me", "changeme", "replace-me", "example", "password", "test-secret"].some((value) => normalized.includes(value));
      if (secretBytes.length < MIN_DEPLOYED_SECRET_BYTES || knownWeak) {
        throw new Error("SESSION_SECRET must be a non-placeholder secret of at least 32 UTF-8 bytes in deployed environments.");
      }
    }
    return configuredSecret;
  }

  if (
    !isDeployedEnvironment() &&
    (process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
  ) {
    return DEVELOPMENT_SESSION_SECRET;
  }

  throw new Error("SESSION_SECRET must be configured outside development and test.");
}


/**
 * Computes server-side auth_hash from K_auth to prevent database breach from leaking raw K_auth.
 */
export function hashAuthKey(authKey: string): string {
  return crypto
    .createHmac("sha256", getServerSecret())
    .update(authKey)
    .digest("hex");
}

/** Creates the deterministic salt returned for an unknown email address. */
export function generatePreauthDummySalt(normalizedEmail: string): string {
  return crypto
    .createHmac("sha256", getServerSecret())
    .update(`preauth_salt:${normalizedEmail}`)
    .digest()
    .subarray(0, 16)
    .toString("base64");
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
