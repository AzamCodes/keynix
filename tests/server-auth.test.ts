import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
import {
  generatePreauthDummySalt,
  getServerSecret,
  hashAuthKey,
} from "../src/lib/server-auth";
import { POST as preauthPost } from "../src/app/api/auth/preauth/route";
import { db } from "../src/lib/db";

vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: vi.fn() } },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalVercelEnv = process.env.VERCEL_ENV;
const originalSessionSecret = process.env.SESSION_SECRET;
const mutableEnvironment = process.env as Record<string, string | undefined>;

function setEnvironmentValue(name: string, value: string | undefined): void {
  if (value === undefined) delete mutableEnvironment[name];
  else mutableEnvironment[name] = value;
}

afterEach(() => {
  setEnvironmentValue("NODE_ENV", originalNodeEnv);
  setEnvironmentValue("VERCEL_ENV", originalVercelEnv);
  setEnvironmentValue("SESSION_SECRET", originalSessionSecret);
});

describe("server authentication secret configuration", () => {
  it("fails closed when production has no SESSION_SECRET", () => {
    setEnvironmentValue("NODE_ENV", "production");
    setEnvironmentValue("VERCEL_ENV", undefined);
    setEnvironmentValue("SESSION_SECRET", undefined);

    expect(() => getServerSecret()).toThrow(
      "SESSION_SECRET must be configured outside development and test."
    );
    expect(() => hashAuthKey("a".repeat(64))).toThrow(/SESSION_SECRET/);
    expect(() => generatePreauthDummySalt("unknown@example.test")).toThrow(/SESSION_SECRET/);
  });

  it("fails pre-auth before account lookup when production configuration is missing", async () => {
    setEnvironmentValue("NODE_ENV", "production");
    setEnvironmentValue("VERCEL_ENV", undefined);
    setEnvironmentValue("SESSION_SECRET", undefined);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    try {
      const responses = await Promise.all(
        ["known@example.test", "unknown@example.test"].map((email) =>
          preauthPost(
            new Request("https://keynix.invalid/api/auth/preauth", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Origin: "https://keynix.invalid",
              },
              body: JSON.stringify({ email }),
            })
          )
        )
      );

      expect(responses.map((response) => response.status)).toEqual([500, 500]);
      expect(db.user.findUnique).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("does not use the development fallback in a Vercel Production environment", () => {
    setEnvironmentValue("NODE_ENV", "test");
    setEnvironmentValue("VERCEL_ENV", "production");
    setEnvironmentValue("SESSION_SECRET", undefined);

    expect(() => getServerSecret()).toThrow(/SESSION_SECRET/);
  });

  it("does not use the development fallback in a Vercel Preview environment", () => {
    setEnvironmentValue("NODE_ENV", "test");
    setEnvironmentValue("VERCEL_ENV", "preview");
    setEnvironmentValue("SESSION_SECRET", undefined);

    expect(() => getServerSecret()).toThrow(/SESSION_SECRET/);
  });

  it("uses a configured production secret for auth hashes", () => {
    const syntheticSecret = "N7pR2xV9cL4mQ8wK5yD1fH6uB3zA0sE9";
    const syntheticAuthKey = "a".repeat(64);
    setEnvironmentValue("NODE_ENV", "production");
    setEnvironmentValue("SESSION_SECRET", syntheticSecret);

    const expectedHash = crypto
      .createHmac("sha256", syntheticSecret)
      .update(syntheticAuthKey)
      .digest("hex");

    expect(getServerSecret()).toBe(syntheticSecret);
    expect(hashAuthKey(syntheticAuthKey)).toBe(expectedHash);
  });

  it("keeps dummy salts deterministic per email and keyed by the configured secret", () => {
    setEnvironmentValue("NODE_ENV", "production");
    setEnvironmentValue("SESSION_SECRET", "N7pR2xV9cL4mQ8wK5yD1fH6uB3zA0sE9");

    const firstSalt = generatePreauthDummySalt("unknown@example.test");
    expect(generatePreauthDummySalt("unknown@example.test")).toBe(firstSalt);
    expect(Buffer.from(firstSalt, "base64")).toHaveLength(16);
    expect(generatePreauthDummySalt("another@example.test")).not.toBe(firstSalt);

    setEnvironmentValue("SESSION_SECRET", "P4qT8vW2xZ6bN0mK3jH7fD1sA5cE9yUQ");
    expect(generatePreauthDummySalt("unknown@example.test")).not.toBe(firstSalt);
  });

  it("rejects the known development fallback if explicitly configured in Production or Preview", () => {
    setEnvironmentValue("NODE_ENV", "production");
    setEnvironmentValue("VERCEL_ENV", "production");
    setEnvironmentValue("SESSION_SECRET", "default-keynix-server-secret-32bytes-long!!");
    expect(() => getServerSecret()).toThrow(/non-placeholder secret/);

    setEnvironmentValue("NODE_ENV", "test");
    setEnvironmentValue("VERCEL_ENV", "preview");
    expect(() => getServerSecret()).toThrow(/non-placeholder secret/);
  });

  it("rejects short, repeated, and placeholder deployed secrets", () => {
    setEnvironmentValue("NODE_ENV", "production");
    setEnvironmentValue("VERCEL_ENV", undefined);
    for (const weakSecret of ["short", "x".repeat(40), "example-key-".padEnd(40, "x")]) {
      setEnvironmentValue("SESSION_SECRET", weakSecret);
      expect(() => getServerSecret()).toThrow(/non-placeholder secret/);
    }
  });

  it("retains the development fallback only for development and tests", () => {
    setEnvironmentValue("SESSION_SECRET", undefined);
    setEnvironmentValue("VERCEL_ENV", undefined);
    setEnvironmentValue("NODE_ENV", "development");
    expect(() => getServerSecret()).not.toThrow();

    setEnvironmentValue("NODE_ENV", "test");
    expect(() => getServerSecret()).not.toThrow();

    setEnvironmentValue("NODE_ENV", undefined);
    expect(() => getServerSecret()).toThrow(/SESSION_SECRET/);
  });
});
