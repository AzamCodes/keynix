import "server-only";
import crypto from "node:crypto";
import * as opaque from "@serenity-kit/opaque";
import { getServerSecret } from "@/lib/server-auth";

export const RECOVERY_IDENTIFIER = "keynix:recovery:v2";
export const RECOVERY_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function normalizeRecoveryPhrase(phrase: string): string {
  return phrase.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
}

export function opaqueIdentifiers(normalizedEmail: string) {
  return { client: normalizedEmail, server: RECOVERY_IDENTIFIER };
}

export function getOpaqueServerSetup(): string {
  const setup = process.env.OPAQUE_SERVER_SETUP;
  // serenity-kit/opaque 1.1.0 documents a stable, 171-character generated
  // setup string. Do not generate a replacement at runtime: that would make
  // all existing OPAQUE records unusable after restart.
  if (!setup?.trim() || setup.length !== 171 || !/^[A-Za-z0-9+/=_-]+$/.test(setup)) {
    throw new Error("OPAQUE server setup must use the documented 171-character format");
  }
  return setup;
}

function stateKey(): Buffer {
  return crypto
    .createHmac("sha256", getServerSecret())
    .update("keynix:recovery:opaque-state:v1")
    .digest();
}

export function sealOpaqueState(state: string, associatedData: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", stateKey(), iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(state, "utf8"), cipher.final()]);
  const combined = Buffer.concat([ciphertext, cipher.getAuthTag()]);
  return { stateIv: iv.toString("base64"), stateCiphertext: combined.toString("base64") };
}

export function openOpaqueState(stateIv: string, stateCiphertext: string, associatedData: string): string {
  const combined = Buffer.from(stateCiphertext, "base64");
  if (combined.length < 16) throw new Error("Invalid challenge state");
  const iv = Buffer.from(stateIv, "base64");
  if (iv.length !== 12) throw new Error("Invalid challenge state");
  const decipher = crypto.createDecipheriv("aes-256-gcm", stateKey(), iv);
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(combined.subarray(-16));
  return Buffer.concat([decipher.update(combined.subarray(0, -16)), decipher.final()]).toString("utf8");
}

export function createChallengeToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex"),
  };
}

export async function waitForOpaque(): Promise<void> {
  await opaque.ready;
}

export { opaque };
