import { argon2id } from "hash-wasm";
import * as bip39 from "bip39";

// Helper utilities for Base64 and Hex conversions
export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function generateSalt(length = 16): string {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return bufferToBase64(salt);
}

export function generateIV(length = 12): string {
  const iv = new Uint8Array(length);
  crypto.getRandomValues(iv);
  return bufferToBase64(iv);
}

// Memory wiping helper (best effort byte clearing)
export function wipeBytes(arr: Uint8Array | null): void {
  if (!arr || arr.length === 0) return;
  arr.fill(0);
  try {
    crypto.getRandomValues(arr);
    arr.fill(0);
  } catch {
    arr.fill(0);
  }
}


// 1. Primary Key Derivation: Argon2id (MK = 256 bits)
export async function deriveMasterKey(
  password: string,
  saltBase64: string
): Promise<Uint8Array> {
  const saltUint8 = base64ToBuffer(saltBase64);
  const hashHex = await argon2id({
    password,
    salt: saltUint8,
    parallelism: 4,
    iterations: 3,
    memorySize: 65536, // 64 MiB
    hashLength: 32, // 256 bits
    outputType: "hex",
  });
  return hexToBuffer(hashHex);
}

// HKDF-Expand implementation using Web Crypto API
async function hkdfExpand(
  prkBytes: Uint8Array,
  infoStr: string,
  length = 32
): Promise<Uint8Array> {
  const prkKey = await crypto.subtle.importKey(
    "raw",
    prkBytes as unknown as BufferSource,
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const encoder = new TextEncoder();
  const info = encoder.encode(infoStr);

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(32) as unknown as BufferSource, // 32-byte zero salt for expand step
      info: info as unknown as BufferSource,
    },
    prkKey,
    length * 8
  );
  return new Uint8Array(derivedBits);
}

// Derive K_auth (256 bits -> 64 hex characters)
export async function deriveAuthKey(masterKey: Uint8Array): Promise<string> {
  const authKeyBytes = await hkdfExpand(masterKey, "keynix:v1:auth", 32);
  return bufferToHex(authKeyBytes);
}

// Derive K_master_enc (CryptoKey for AES-256-GCM)
export async function deriveMasterEncKey(
  masterKey: Uint8Array
): Promise<CryptoKey> {
  const encKeyBytes = await hkdfExpand(masterKey, "keynix:v1:master_enc", 32);
  return crypto.subtle.importKey(
    "raw",
    encKeyBytes as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// 2. Vault Key Generation & Wrapping
export function generateVaultKey(): Uint8Array {
  const key = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(key);
  return key;
}

export async function importVaultKey(vaultKeyBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    vaultKeyBytes as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVaultKey(
  vaultKey: Uint8Array,
  masterEncKey: CryptoKey,
  userId = "v1"
): Promise<{ iv: string; tag: string; ciphertext: string }> {
  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);

  const encoder = new TextEncoder();
  const aad = encoder.encode(`keynix:v1:vault_key:${userId}`);

  // SubtleCrypto AES-GCM output includes ciphertext + 16-byte tag at the end
  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivBytes as unknown as BufferSource,
      additionalData: aad as unknown as BufferSource,
      tagLength: 128,
    },
    masterEncKey,
    vaultKey as unknown as BufferSource
  );

  const encryptedArray = new Uint8Array(encryptedBuffer);
  const tagBytes = encryptedArray.slice(-16);
  const cipherBytes = encryptedArray.slice(0, -16);

  return {
    iv: bufferToBase64(ivBytes),
    tag: bufferToBase64(tagBytes),
    ciphertext: bufferToBase64(cipherBytes),
  };
}

export async function decryptVaultKey(
  encData: { iv: string; tag: string; ciphertext: string },
  masterEncKey: CryptoKey,
  userId = "v1"
): Promise<Uint8Array> {
  const ivBytes = base64ToBuffer(encData.iv);
  const tagBytes = base64ToBuffer(encData.tag);
  const cipherBytes = base64ToBuffer(encData.ciphertext);

  // Combine ciphertext + tag for SubtleCrypto decrypt
  const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
  combined.set(cipherBytes, 0);
  combined.set(tagBytes, cipherBytes.length);

  const encoder = new TextEncoder();
  const aad = encoder.encode(`keynix:v1:vault_key:${userId}`);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes as unknown as BufferSource,
      additionalData: aad as unknown as BufferSource,
      tagLength: 128,
    },
    masterEncKey,
    combined as unknown as BufferSource
  );

  return new Uint8Array(decryptedBuffer);
}

// 3. Vault Item Payload Encryption & Decryption with Padding & AAD
const BLOCK_PADDING_SIZE = 256;

function padPayload(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);
  // PKCS7-style padding to multiple of BLOCK_PADDING_SIZE
  const padLen = BLOCK_PADDING_SIZE - (rawBytes.length % BLOCK_PADDING_SIZE);
  const paddedBytes = new Uint8Array(rawBytes.length + padLen);
  paddedBytes.set(rawBytes, 0);
  paddedBytes.fill(padLen, rawBytes.length);
  return paddedBytes;
}

function unpadPayload(paddedBytes: Uint8Array): string {
  const padLen = paddedBytes[paddedBytes.length - 1];
  if (padLen < 1 || padLen > BLOCK_PADDING_SIZE) {
    throw new Error("Invalid PKCS7 padding length");
  }
  const unpaddedBytes = paddedBytes.slice(0, paddedBytes.length - padLen);
  const decoder = new TextDecoder();
  return decoder.decode(unpaddedBytes);
}

export async function encryptVaultPayload(
  payload: Record<string, unknown>,
  vaultKeyInput: Uint8Array | CryptoKey,
  aadContext: Record<string, unknown>
): Promise<{ ciphertext: string; iv: string; tag: string; aadMeta: string }> {
  const vaultKey =
    vaultKeyInput instanceof Uint8Array
      ? await importVaultKey(vaultKeyInput)
      : vaultKeyInput;

  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);

  const plaintextJson = JSON.stringify(payload);
  const paddedBytes = padPayload(plaintextJson);

  const aadMetaStr = JSON.stringify(aadContext);
  const encoder = new TextEncoder();
  const aadBytes = encoder.encode(aadMetaStr);

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivBytes as unknown as BufferSource,
      additionalData: aadBytes as unknown as BufferSource,
      tagLength: 128,
    },
    vaultKey,
    paddedBytes as unknown as BufferSource
  );

  const encryptedArray = new Uint8Array(encryptedBuffer);
  const tagBytes = encryptedArray.slice(-16);
  const cipherBytes = encryptedArray.slice(0, -16);

  return {
    ciphertext: bufferToBase64(cipherBytes),
    iv: bufferToBase64(ivBytes),
    tag: bufferToBase64(tagBytes),
    aadMeta: aadMetaStr,
  };
}

export async function decryptVaultPayload(
  encData: { ciphertext: string; iv: string; tag: string; aadMeta: string },
  vaultKeyInput: Uint8Array | CryptoKey,
  expectedAadContext?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const vaultKey =
    vaultKeyInput instanceof Uint8Array
      ? await importVaultKey(vaultKeyInput)
      : vaultKeyInput;

  const ivBytes = base64ToBuffer(encData.iv);
  const tagBytes = base64ToBuffer(encData.tag);
  const cipherBytes = base64ToBuffer(encData.ciphertext);

  const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
  combined.set(cipherBytes, 0);
  combined.set(tagBytes, cipherBytes.length);

  const encoder = new TextEncoder();
  const aadBytes = encoder.encode(encData.aadMeta);

  // If expected AAD is passed, verify critical metadata match
  if (expectedAadContext) {
    const currentAad = JSON.parse(encData.aadMeta);
    for (const key of Object.keys(expectedAadContext)) {
      if (currentAad[key] !== expectedAadContext[key]) {
        throw new Error(`AAD mismatch for key '${key}'`);
      }
    }
  }

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: ivBytes as unknown as BufferSource,
      additionalData: aadBytes as unknown as BufferSource,
      tagLength: 128,
    },
    vaultKey,
    combined as unknown as BufferSource
  );

  const paddedBytes = new Uint8Array(decryptedBuffer);
  const jsonStr = unpadPayload(paddedBytes);
  return JSON.parse(jsonStr);
}

// 4. BIP-39 Recovery Phrase Key Wrapping
export function generateRecoveryPhrase(): string {
  return bip39.generateMnemonic(256); // 24-word recovery phrase
}

export interface RecoveryEncryptedKey {
  iv: string;
  tag: string;
  ciphertext: string;
  salt?: string;
  version?: 1 | 2;
}

function normalizeMnemonic(mnemonic: string): string {
  return mnemonic.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
}

async function deriveRecoveryWrapKey(seed: Uint8Array, salt: Uint8Array, identity: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    seed as unknown as BufferSource,
    "HKDF",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: salt as unknown as BufferSource,
      info: new TextEncoder().encode(`keynix:v2:recovery:${identity}`) as unknown as BufferSource,
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptVaultKeyWithRecovery(
  vaultKey: Uint8Array,
  mnemonic: string,
  accountIdentity: string
): Promise<RecoveryEncryptedKey & { version: 2 }> {
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!accountIdentity || !bip39.validateMnemonic(normalizedMnemonic)) {
    throw new Error("Invalid BIP-39 recovery mnemonic");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const seed = await bip39.mnemonicToSeed(normalizedMnemonic);
  const seedKey = new Uint8Array(seed.subarray(0, 32));
  try {
    const key = await deriveRecoveryWrapKey(seedKey, salt, accountIdentity);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aad = new TextEncoder().encode(`keynix:v2:recovery:${accountIdentity}`);
    const encrypted = new Uint8Array(await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as unknown as BufferSource, additionalData: aad as unknown as BufferSource, tagLength: 128 },
      key,
      vaultKey as unknown as BufferSource
    ));
    return {
      version: 2,
      salt: bufferToBase64(salt),
      iv: bufferToBase64(iv),
      ciphertext: bufferToBase64(encrypted.subarray(0, -16)),
      tag: bufferToBase64(encrypted.subarray(-16)),
    };
  } finally {
    wipeBytes(seedKey);
    wipeBytes(seed);
  }
}

export async function decryptVaultKeyWithRecovery(
  encRecoveryData: RecoveryEncryptedKey,
  mnemonic: string,
  accountIdentity?: string
): Promise<Uint8Array> {
  const normalizedMnemonic = normalizeMnemonic(mnemonic);
  if (!bip39.validateMnemonic(normalizedMnemonic)) {
    throw new Error("Invalid BIP-39 recovery mnemonic");
  }
  const seed = await bip39.mnemonicToSeed(normalizedMnemonic);
  const seedKey = new Uint8Array(seed.subarray(0, 32));
  try {
    if (encRecoveryData.version === 2) {
      if (!accountIdentity || !encRecoveryData.salt) throw new Error("Invalid recovery envelope");
      const salt = base64ToBuffer(encRecoveryData.salt);
      if (salt.length !== 16) throw new Error("Invalid recovery envelope");
      const key = await deriveRecoveryWrapKey(seedKey, salt, accountIdentity);
      const iv = base64ToBuffer(encRecoveryData.iv);
      const tag = base64ToBuffer(encRecoveryData.tag);
      const ciphertext = base64ToBuffer(encRecoveryData.ciphertext);
      if (iv.length !== 12 || tag.length !== 16 || ciphertext.length !== 32) {
        throw new Error("Invalid recovery envelope");
      }
      const combined = new Uint8Array(ciphertext.length + tag.length);
      combined.set(ciphertext);
      combined.set(tag, ciphertext.length);
      const aad = new TextEncoder().encode(`keynix:v2:recovery:${accountIdentity}`);
      return new Uint8Array(await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as unknown as BufferSource, additionalData: aad as unknown as BufferSource, tagLength: 128 },
        key,
        combined as unknown as BufferSource
      ));
    }

    // V1 compatibility: its salt was stored but not used, and AAD was static.
    const recoveryCryptoKey = await crypto.subtle.importKey(
      "raw", seedKey as unknown as BufferSource, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
    return await decryptVaultKey(encRecoveryData, recoveryCryptoKey, "recovery");
  } finally {
    wipeBytes(seedKey);
    wipeBytes(seed);
  }
}

// 4b. Encrypted Backup Functions (Authenticated AES-256-GCM Backup Export/Import)
export interface EncryptedBackupFormat {
  format: "keynix-encrypted-backup-v1";
  version: 1;
  exportedAt: string;
  kdfParams: { algorithm: "argon2id"; m: number; t: number; p: number };
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export async function encryptVaultBackup(
  items: Record<string, unknown>[],
  backupPassword: string
): Promise<string> {
  if (!backupPassword || backupPassword.length < 12) {
    throw new Error("Backup password must be at least 12 characters");
  }

  const saltBase64 = generateSalt(16);
  const kdfParams = { algorithm: "argon2id" as const, m: 65536, t: 3, p: 4 };
  const backupKeyBytes = await deriveMasterKey(backupPassword, saltBase64);

  const backupCryptoKey = await crypto.subtle.importKey(
    "raw",
    backupKeyBytes as unknown as BufferSource,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const ivBytes = new Uint8Array(12);
  crypto.getRandomValues(ivBytes);

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
  };

  const plaintextJson = JSON.stringify(payload);
  const paddedBytes = padPayload(plaintextJson);

  const encoder = new TextEncoder();
  const aadBytes = encoder.encode("keynix:v1:backup");

  const encryptedBuffer = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: ivBytes as unknown as BufferSource,
      additionalData: aadBytes as unknown as BufferSource,
      tagLength: 128,
    },
    backupCryptoKey,
    paddedBytes as unknown as BufferSource
  );

  wipeBytes(backupKeyBytes);

  const encryptedArray = new Uint8Array(encryptedBuffer);
  const tagBytes = encryptedArray.slice(-16);
  const cipherBytes = encryptedArray.slice(0, -16);

  const backupObject: EncryptedBackupFormat = {
    format: "keynix-encrypted-backup-v1",
    version: 1,
    exportedAt: payload.exportedAt,
    kdfParams,
    salt: saltBase64,
    iv: bufferToBase64(ivBytes),
    tag: bufferToBase64(tagBytes),
    ciphertext: bufferToBase64(cipherBytes),
  };

  return JSON.stringify(backupObject, null, 2);
}

export async function decryptVaultBackup(
  backupJsonStr: string,
  backupPassword: string
): Promise<Record<string, unknown>[]> {
  if (!backupPassword) {
    throw new Error("Backup password is required");
  }

  let backupObj: EncryptedBackupFormat;
  try {
    backupObj = JSON.parse(backupJsonStr);
  } catch {
    throw new Error("Invalid or corrupted backup JSON file format");
  }

  if (
    !backupObj ||
    backupObj.format !== "keynix-encrypted-backup-v1" ||
    backupObj.version !== 1 ||
    !backupObj.salt ||
    !backupObj.iv ||
    !backupObj.tag ||
    !backupObj.ciphertext
  ) {
    throw new Error("Unsupported or corrupted backup file format");
  }

  let backupKeyBytes: Uint8Array | null = null;
  try {
    backupKeyBytes = await deriveMasterKey(backupPassword, backupObj.salt);
    const backupCryptoKey = await crypto.subtle.importKey(
      "raw",
      backupKeyBytes as unknown as BufferSource,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"]
    );

    const ivBytes = base64ToBuffer(backupObj.iv);
    const tagBytes = base64ToBuffer(backupObj.tag);
    const cipherBytes = base64ToBuffer(backupObj.ciphertext);

    const combined = new Uint8Array(cipherBytes.length + tagBytes.length);
    combined.set(cipherBytes, 0);
    combined.set(tagBytes, cipherBytes.length);

    const encoder = new TextEncoder();
    const aadBytes = encoder.encode("keynix:v1:backup");

    const decryptedBuffer = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBytes as unknown as BufferSource,
        additionalData: aadBytes as unknown as BufferSource,
        tagLength: 128,
      },
      backupCryptoKey,
      combined as unknown as BufferSource
    );

    const paddedBytes = new Uint8Array(decryptedBuffer);
    const jsonStr = unpadPayload(paddedBytes);
    const payload = JSON.parse(jsonStr);

    if (!payload || !Array.isArray(payload.items)) {
      throw new Error("Corrupted backup payload: items missing");
    }

    return payload.items;
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    if (
      errorMessage === "Invalid or corrupted backup JSON file format" ||
      errorMessage === "Unsupported or corrupted backup file format" ||
      errorMessage === "Corrupted backup payload: items missing" ||
      errorMessage.includes("PKCS7")
    ) {
      throw err;
    }
    throw new Error("Incorrect backup password or corrupted ciphertext");
  } finally {
    if (backupKeyBytes) {
      wipeBytes(backupKeyBytes);
    }
  }
}

// 5. Password Generator & Entropy Meter
const CHARSETS = {
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  numbers: "0123456789",
  symbols: "!@#$%^&*()_+-=[]{}|;:,.<>?",
};

const WORDS_LIST = [
  "falcon", "orbit", "prism", "quantum", "nebula", "starlight", "vortex",
  "zenith", "cipher", "anchor", "beacon", "titan", "phoenix", "glacier",
  "shadow", "aurora", "cascade", "ember", "horizon", "solaris", "velox",
  "matrix", "vector", "summit", "ignite", "shield", "pulse", "echo"
];

export function generatePassword(options: {
  length?: number;
  uppercase?: boolean;
  lowercase?: boolean;
  numbers?: boolean;
  symbols?: boolean;
  passphrase?: boolean;
  wordCount?: number;
}): string {
  if (options.passphrase) {
    const count = options.wordCount || 4;
    const words: string[] = [];
    const randValues = new Uint32Array(count);
    crypto.getRandomValues(randValues);
    for (let i = 0; i < count; i++) {
      words.push(WORDS_LIST[randValues[i] % WORDS_LIST.length]);
    }
    return words.join("-");
  }

  const length = options.length || 20;
  let pool = "";
  if (options.lowercase !== false) pool += CHARSETS.lowercase;
  if (options.uppercase !== false) pool += CHARSETS.uppercase;
  if (options.numbers !== false) pool += CHARSETS.numbers;
  if (options.symbols !== false) pool += CHARSETS.symbols;

  if (!pool) pool = CHARSETS.lowercase + CHARSETS.numbers;

  const randValues = new Uint32Array(length);
  crypto.getRandomValues(randValues);

  let password = "";
  for (let i = 0; i < length; i++) {
    password += pool[randValues[i] % pool.length];
  }
  return password;
}

export function evaluatePasswordStrength(password: string): {
  score: number; // 0 to 100
  label: "Weak" | "Fair" | "Strong" | "Ultra";
  entropyBits: number;
  feedback: string[];
} {
  if (!password) {
    return { score: 0, label: "Weak", entropyBits: 0, feedback: ["Password is empty"] };
  }

  let poolSize = 0;
  if (/[a-z]/.test(password)) poolSize += 26;
  if (/[A-Z]/.test(password)) poolSize += 26;
  if (/[0-9]/.test(password)) poolSize += 10;
  if (/[^a-zA-Z0-9]/.test(password)) poolSize += 32;

  const entropyBits = Math.floor(password.length * (Math.log2(poolSize || 26)));
  const feedback: string[] = [];

  if (password.length < 12) feedback.push("Use at least 12 characters");
  if (!/[A-Z]/.test(password)) feedback.push("Add uppercase letters");
  if (!/[0-9]/.test(password)) feedback.push("Add numbers");
  if (!/[^a-zA-Z0-9]/.test(password)) feedback.push("Add special symbols");

  let score = Math.min(100, Math.round((entropyBits / 128) * 100));
  if (entropyBits < 40) score = Math.min(score, 30);

  let label: "Weak" | "Fair" | "Strong" | "Ultra" = "Weak";
  if (score >= 85) label = "Ultra";
  else if (score >= 65) label = "Strong";
  else if (score >= 40) label = "Fair";

  return { score, label, entropyBits, feedback };
}
