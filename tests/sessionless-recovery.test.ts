import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as opaque from "@serenity-kit/opaque";
import { sealOpaqueState } from "../src/lib/recovery-protocol";

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  challengeCreate: vi.fn(),
  challengeFindUnique: vi.fn(),
  challengeUpdateMany: vi.fn(),
  challengeDeleteMany: vi.fn(),
  userUpdateMany: vi.fn(),
  sessionUpdateMany: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
  rateLimit: vi.fn(),
  clearCookie: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.userFindUnique },
    recoveryChallenge: {
      create: mocks.challengeCreate,
      findUnique: mocks.challengeFindUnique,
      updateMany: mocks.challengeUpdateMany,
      deleteMany: mocks.challengeDeleteMany,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.rateLimit }));
vi.mock("@/lib/request-origin", () => ({ hasSameRequestOrigin: () => true }));
vi.mock("@/lib/session", () => ({ clearSessionCookie: mocks.clearCookie }));

import { POST as startRecovery } from "../src/app/api/auth/recovery/start/route";
import { POST as finishRecovery } from "../src/app/api/auth/recovery/finish/route";

const email = "recovery-test@example.invalid";
const phrase = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const vaultKeyMarker = "synthetic-plaintext-vault-key-marker";
const originalEnvironment = {
  opaque: process.env.OPAQUE_SERVER_SETUP,
  session: process.env.SESSION_SECRET,
};
let serverSetup: string;
let registrationRecord: string;
let fixtureChallenge: Record<string, unknown>;

beforeAll(async () => {
  await opaque.ready;
  serverSetup = opaque.server.createSetup();
  process.env.OPAQUE_SERVER_SETUP = serverSetup;
  process.env.SESSION_SECRET = "synthetic-session-secret-for-tests-only";
  const registration = opaque.client.startRegistration({ password: phrase });
  const { registrationResponse } = opaque.server.createRegistrationResponse({
    serverSetup,
    userIdentifier: email,
    registrationRequest: registration.registrationRequest,
  });
  registrationRecord = opaque.client.finishRegistration({
    clientRegistrationState: registration.clientRegistrationState,
    registrationResponse,
    password: phrase,
    identifiers: { client: email, server: "keynix:recovery:v2" },
    keyStretching: "memory-constrained",
  }).registrationRecord;
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ success: true, remaining: 10, reset: Date.now() + 60_000 });
  mocks.challengeDeleteMany.mockResolvedValue({ count: 0 });
  mocks.challengeCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    fixtureChallenge = { ...data, consumedAt: null };
    return fixtureChallenge;
  });
  mocks.challengeFindUnique.mockImplementation(async () => fixtureChallenge);
  mocks.challengeUpdateMany.mockResolvedValue({ count: 1 });
  mocks.userFindUnique.mockResolvedValue({ id: "synthetic-user-id", email, recoveryOpaqueRecord: registrationRecord, recoveryVersion: 1 });
  mocks.userUpdateMany.mockResolvedValue({ count: 1 });
  mocks.sessionUpdateMany.mockResolvedValue({ count: 2 });
  mocks.auditCreate.mockResolvedValue({});
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
    user: { updateMany: mocks.userUpdateMany },
    session: { updateMany: mocks.sessionUpdateMany },
    auditLog: { create: mocks.auditCreate },
  }));
  mocks.clearCookie.mockResolvedValue(undefined);
});

afterAll(() => {
  if (originalEnvironment.opaque === undefined) delete process.env.OPAQUE_SERVER_SETUP;
  else process.env.OPAQUE_SERVER_SETUP = originalEnvironment.opaque;
  if (originalEnvironment.session === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = originalEnvironment.session;
});

function request(url: string, payload: unknown) {
  return new Request(`https://keynix.example${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://keynix.example" },
    body: JSON.stringify(payload),
  });
}

describe("sessionless account recovery", () => {
  it("recovers without a session and persists no phrase or plaintext vault key", async () => {
    const storedEnvelope = JSON.stringify({ version: 2, ciphertext: "synthetic-ciphertext-only" });
    mocks.userFindUnique.mockResolvedValue({ id: "synthetic-user-id", email, recoveryOpaqueRecord: registrationRecord, recoveryEncryptedKeyV2: storedEnvelope, recoveryVersion: 1 });
    const clientStart = opaque.client.startLogin({ password: phrase });
    const startResponse = await startRecovery(request("/api/auth/recovery/start", {
      email,
      startLoginRequest: clientStart.startLoginRequest,
    }));
    expect(startResponse.status).toBe(200);
    const started = await startResponse.json();
    expect(started.recoveryEnvelope).toEqual(JSON.parse(storedEnvelope));

    const persistedChallenge = JSON.stringify(mocks.challengeCreate.mock.calls[0][0].data);
    expect(persistedChallenge).not.toContain(phrase);
    expect(persistedChallenge).not.toContain(vaultKeyMarker);
    expect(persistedChallenge).not.toContain("startLoginRequest");
    expect(mocks.challengeCreate.mock.calls[0][0].data.stateCiphertext).not.toContain("serverLoginState");

    const clientFinish = opaque.client.finishLogin({
      clientLoginState: clientStart.clientLoginState,
      loginResponse: started.loginResponse,
      password: phrase,
      identifiers: { client: email, server: "keynix:recovery:v2" },
      keyStretching: "memory-constrained",
    });
    expect(clientFinish).toBeTruthy();
    const response = await finishRecovery(request("/api/auth/recovery/finish", {
      challenge: started.challenge,
      finishLoginRequest: clientFinish!.finishLoginRequest,
      newAuthKey: "a".repeat(64),
      newMasterSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
      newKdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
      newEncryptedVaultKey: { iv: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    }));

    expect(response.status).toBe(200);
    expect(mocks.challengeUpdateMany).toHaveBeenCalledOnce();
    expect(mocks.userUpdateMany).toHaveBeenCalledOnce();
    expect(mocks.userUpdateMany.mock.calls[0][0].where).toMatchObject({ id: "synthetic-user-id", recoveryVersion: 1 });
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({ where: { userId: "synthetic-user-id", revokedAt: null }, data: { revokedAt: expect.any(Date) } });
    expect(mocks.clearCookie).toHaveBeenCalledOnce();
  });

  it("rejects invalid proof after consuming the one-time challenge", async () => {
    const challengeId = "synthetic-challenge-id";
    const userId = "synthetic-user-id";
    const state = sealOpaqueState("synthetic-invalid-server-state", `${challengeId}:recovery:${userId}`);
    fixtureChallenge = {
      id: challengeId,
      tokenHash: "a".repeat(64),
      userId: "synthetic-user-id",
      purpose: "recovery",
      ...state,
      recoveryVersion: 1,
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    const response = await finishRecovery(request("/api/auth/recovery/finish", {
      challenge: "A".repeat(43),
      finishLoginRequest: "invalid-synthetic-proof",
      newAuthKey: "b".repeat(64),
      newMasterSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
      newKdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
      newEncryptedVaultKey: { iv: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    }));
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(mocks.challengeUpdateMany).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not persist challenges for unknown or not-yet-enrolled accounts", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    const clientStart = opaque.client.startLogin({ password: phrase });
    const response = await startRecovery(request("/api/auth/recovery/start", {
      email,
      startLoginRequest: clientStart.startLoginRequest,
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.recoveryEnvelope).toHaveProperty("version", 2);
    expect(mocks.challengeCreate).not.toHaveBeenCalled();
    expect(mocks.challengeDeleteMany).not.toHaveBeenCalled();
  });

  it("does not offer a weak fallback for a legacy account with only v1 recovery data", async () => {
    mocks.userFindUnique.mockResolvedValue({
      id: "legacy-user-id",
      email,
      recoveryOpaqueRecord: null,
      recoveryEncryptedKey: JSON.stringify({ iv: "legacy", tag: "legacy", ciphertext: "legacy", salt: "legacy" }),
      recoveryEncryptedKeyV2: null,
      recoveryVersion: 1,
    });
    const clientStart = opaque.client.startLogin({ password: phrase });
    const response = await startRecovery(request("/api/auth/recovery/start", {
      email,
      startLoginRequest: clientStart.startLoginRequest,
    }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.recoveryEnvelope.ciphertext).not.toBe("legacy");
    expect(mocks.challengeCreate).not.toHaveBeenCalled();
    expect(mocks.challengeDeleteMany).not.toHaveBeenCalled();
  });

  it("rejects an expired challenge and will not update credentials", async () => {
    fixtureChallenge = {
      id: "expired-challenge",
      userId: "synthetic-user-id",
      purpose: "recovery",
      consumedAt: null,
      expiresAt: new Date(Date.now() - 1),
      recoveryVersion: 1,
    };
    const response = await finishRecovery(request("/api/auth/recovery/finish", {
      challenge: "B".repeat(43),
      finishLoginRequest: "synthetic-proof",
      newAuthKey: "c".repeat(64),
      newMasterSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
      newKdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
      newEncryptedVaultKey: { iv: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    }));
    expect(response.status).toBe(400);
    expect(mocks.challengeUpdateMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a challenge issued for another operation", async () => {
    fixtureChallenge = {
      id: "wrong-purpose-challenge",
      userId: "synthetic-user-id",
      purpose: "recovery-enroll",
      consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      recoveryVersion: 1,
    };
    const response = await finishRecovery(request("/api/auth/recovery/finish", {
      challenge: "C".repeat(43),
      finishLoginRequest: "synthetic-proof",
      newAuthKey: "d".repeat(64),
      newMasterSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
      newKdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
      newEncryptedVaultKey: { iv: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    }));
    expect(response.status).toBe(400);
    expect(mocks.challengeUpdateMany).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("allows only one of two concurrent requests to consume and update credentials", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "synthetic-user-id", email, recoveryOpaqueRecord: registrationRecord, recoveryEncryptedKeyV2: "{}", recoveryVersion: 1 });
    const clientStart = opaque.client.startLogin({ password: phrase });
    const startedResponse = await startRecovery(request("/api/auth/recovery/start", { email, startLoginRequest: clientStart.startLoginRequest }));
    const started = await startedResponse.json();
    const clientFinish = opaque.client.finishLogin({
      clientLoginState: clientStart.clientLoginState,
      loginResponse: started.loginResponse,
      password: phrase,
      identifiers: { client: email, server: "keynix:recovery:v2" },
      keyStretching: "memory-constrained",
    });
    expect(clientFinish).toBeTruthy();
    mocks.challengeUpdateMany.mockReset();
    mocks.challengeUpdateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const payload = {
      challenge: started.challenge,
      finishLoginRequest: clientFinish!.finishLoginRequest,
      newAuthKey: "e".repeat(64),
      newMasterSalt: "AAAAAAAAAAAAAAAAAAAAAA==",
      newKdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
      newEncryptedVaultKey: { iv: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ciphertext: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" },
    };
    const responses = await Promise.all([
      finishRecovery(request("/api/auth/recovery/finish", payload)),
      finishRecovery(request("/api/auth/recovery/finish", payload)),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.userUpdateMany).toHaveBeenCalledOnce();
  });
});
