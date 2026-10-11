import { beforeAll, describe, expect, it } from "vitest";
import * as opaque from "@serenity-kit/opaque";
import {
  decryptVaultKey,
  decryptVaultKeyWithRecovery,
  decryptVaultPayload,
  encryptVaultPayload,
  encryptVaultKey,
  encryptVaultKeyWithRecovery,
  generateRecoveryPhrase,
  generateVaultKey,
  importVaultKey,
} from "../src/lib/crypto";

const account = "synthetic-user@example.invalid";

beforeAll(async () => {
  await opaque.ready;
  if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, "crypto", { value: (await import("node:crypto")).webcrypto });
  }
});

describe("versioned recovery wrapper", () => {
  it("uses the stored random salt and account-bound authenticated data", async () => {
    const phrase = generateRecoveryPhrase();
    const vaultKey = generateVaultKey();
    const envelope = await encryptVaultKeyWithRecovery(vaultKey, phrase, account);

    expect(envelope.version).toBe(2);
    expect(envelope.salt).toHaveLength(24);
    const recoveredKey = await decryptVaultKeyWithRecovery(envelope, phrase, account);
    expect(recoveredKey).toEqual(vaultKey);
    const itemAad = { version: 2, itemId: "synthetic-item-id", userId: "synthetic-user-id" };
    const itemCiphertext = await encryptVaultPayload({ password: "synthetic-existing-record" }, vaultKey, itemAad);
    await expect(decryptVaultPayload(itemCiphertext, recoveredKey, itemAad)).resolves.toMatchObject({ password: "synthetic-existing-record" });
    await expect(decryptVaultKeyWithRecovery(envelope, phrase, "other@example.invalid")).rejects.toThrow();
    await expect(decryptVaultKeyWithRecovery(envelope, generateRecoveryPhrase(), account)).rejects.toThrow();
    await expect(decryptVaultKeyWithRecovery(envelope, "malformed synthetic phrase", account)).rejects.toThrow();
  });

  it("continues to decrypt legacy v1 wrappers without rewriting them", async () => {
    const phrase = generateRecoveryPhrase();
    const vaultKey = generateVaultKey();
    const seed = await (await import("bip39")).mnemonicToSeed(phrase);
    const legacyKey = await importVaultKey(new Uint8Array(seed.subarray(0, 32)));
    const legacyEnvelope = await encryptVaultKey(vaultKey, legacyKey, "recovery");

    await expect(decryptVaultKeyWithRecovery(legacyEnvelope, phrase)).resolves.toEqual(vaultKey);
    await expect(decryptVaultKey(legacyEnvelope, legacyKey, "recovery")).resolves.toEqual(vaultKey);
  });
});

describe("OPAQUE recovery credential exchange", () => {
  let serverSetup: string;
  const identifiers = { client: account, server: "keynix:recovery:v2" };
  beforeAll(() => { serverSetup = opaque.server.createSetup(); });

  it("accepts the enrolled phrase and rejects a different phrase", () => {
    const phrase = generateRecoveryPhrase();
    const startedRegistration = opaque.client.startRegistration({ password: phrase });
    const { registrationResponse } = opaque.server.createRegistrationResponse({
      serverSetup,
      userIdentifier: account,
      registrationRequest: startedRegistration.registrationRequest,
    });
    const { registrationRecord } = opaque.client.finishRegistration({
      clientRegistrationState: startedRegistration.clientRegistrationState,
      registrationResponse,
      password: phrase,
      identifiers,
      keyStretching: "memory-constrained",
    });

    const clientLogin = opaque.client.startLogin({ password: phrase });
    const serverLogin = opaque.server.startLogin({
      serverSetup,
      userIdentifier: account,
      registrationRecord,
      startLoginRequest: clientLogin.startLoginRequest,
      identifiers,
    });
    const clientFinish = opaque.client.finishLogin({
      clientLoginState: clientLogin.clientLoginState,
      loginResponse: serverLogin.loginResponse,
      password: phrase,
      identifiers,
      keyStretching: "memory-constrained",
    });
    expect(clientFinish).toBeTruthy();
    expect(() => opaque.server.finishLogin({
      serverLoginState: serverLogin.serverLoginState,
      finishLoginRequest: clientFinish!.finishLoginRequest,
      identifiers,
    })).not.toThrow();

    const wrongPhrase = generateRecoveryPhrase();
    const wrongLogin = opaque.client.startLogin({ password: wrongPhrase });
    const wrongServer = opaque.server.startLogin({
      serverSetup,
      userIdentifier: account,
      registrationRecord,
      startLoginRequest: wrongLogin.startLoginRequest,
      identifiers,
    });
    const wrongFinish = opaque.client.finishLogin({
      clientLoginState: wrongLogin.clientLoginState,
      loginResponse: wrongServer.loginResponse,
      password: wrongPhrase,
      identifiers,
      keyStretching: "memory-constrained",
    });
    expect(wrongFinish).toBeUndefined();
  });

  it("binds the registration record to account and operation identifiers", () => {
    const phrase = generateRecoveryPhrase();
    const registration = opaque.client.startRegistration({ password: phrase });
    const { registrationResponse } = opaque.server.createRegistrationResponse({
      serverSetup,
      userIdentifier: account,
      registrationRequest: registration.registrationRequest,
    });
    const { registrationRecord } = opaque.client.finishRegistration({
      clientRegistrationState: registration.clientRegistrationState,
      registrationResponse,
      password: phrase,
      identifiers,
      keyStretching: "memory-constrained",
    });
    const login = opaque.client.startLogin({ password: phrase });
    const server = opaque.server.startLogin({
      serverSetup,
      userIdentifier: account,
      registrationRecord,
      startLoginRequest: login.startLoginRequest,
      identifiers: { client: "other@example.invalid", server: "keynix:recovery:v2" },
    });
    const result = opaque.client.finishLogin({
      clientLoginState: login.clientLoginState,
      loginResponse: server.loginResponse,
      password: phrase,
      identifiers,
      keyStretching: "memory-constrained",
    });
    expect(result).toBeUndefined();
  });
});
