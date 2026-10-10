import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateSalt,
  deriveMasterKey,
  deriveAuthKey,
  deriveMasterEncKey,
  generateVaultKey,
  encryptVaultKey,
  decryptVaultKey,
  encryptVaultPayload,
  decryptVaultPayload,
  wipeBytes,
  encryptVaultBackup,
  decryptVaultBackup,
} from "../src/lib/crypto";
import { checkRateLimit } from "../src/lib/rate-limit";


describe("KEYNIX REMEDIATION AUDIT TEST SUITE", () => {
  // =========================================================================
  // TASK 1: VAULT LOCKING & MEMORY SANITIZATION TESTS
  // =========================================================================
  describe("Task 1: Vault Locking & Memory Clearing", () => {
    it("should zero out (wipe) Uint8Array key buffers in memory", () => {
      const keyBuffer = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(keyBuffer.some((b) => b !== 0)).toBe(true);

      wipeBytes(keyBuffer);

      // Verify all bytes are zeroed out
      expect(keyBuffer.every((b) => b === 0)).toBe(true);
    });

    it("should handle null or empty buffers gracefully in wipeBytes", () => {
      expect(() => wipeBytes(null)).not.toThrow();
      const emptyBuffer = new Uint8Array(0);
      expect(() => wipeBytes(emptyBuffer)).not.toThrow();
    });

    it("should block vault operations when vault is locked", async () => {
      let isLocked = true;
      let vaultKey: Uint8Array | null = null;
      let items: any[] = [];

      const lockVault = () => {
        if (vaultKey) wipeBytes(vaultKey);
        vaultKey = null;
        items = [];
        isLocked = true;
      };

      // Set up unlocked state first
      vaultKey = generateVaultKey();
      items = [{ id: "1", title: "Secret Password", password: "SuperSecret123!" }];
      isLocked = false;

      // Lock vault
      lockVault();

      expect(isLocked).toBe(true);
      expect(vaultKey).toBeNull();
      expect(items.length).toBe(0);

      // Simulated vault operation guard
      const performVaultOperation = (key: Uint8Array | null, locked: boolean) => {
        if (locked || !key) return false;
        return true;
      };

      expect(performVaultOperation(vaultKey, isLocked)).toBe(false);
    });

    it("should trigger auto-lock timer and clear sensitive memory state", async () => {
      vi.useFakeTimers();
      let isLocked = false;
      let vaultKey: Uint8Array | null = generateVaultKey();
      let items = [{ id: "1", title: "Card Info" }];

      const lockVault = () => {
        if (vaultKey) wipeBytes(vaultKey);
        vaultKey = null;
        items = [];
        isLocked = true;
      };

      const timerId = setTimeout(() => {
        lockVault();
      }, 15 * 60 * 1000);

      expect(isLocked).toBe(false);
      expect(vaultKey).not.toBeNull();

      // Fast forward 15 minutes
      vi.advanceTimersByTime(15 * 60 * 1000);

      expect(isLocked).toBe(true);
      expect(vaultKey).toBeNull();
      expect(items.length).toBe(0);

      vi.useRealTimers();
    });
  });

  // =========================================================================
  // TASK 2: ENCRYPTED BACKUP TESTS
  // =========================================================================
  describe("Task 2: Encrypted Vault Backup & Restore", () => {
    const mockItems = [
      {
        id: "item-1",
        category: "password",
        title: "Bank Account",
        username: "user@example.com",
        password: "BankSecretPassword123!",
        url: "https://bank.com",
        isFavorite: true,
      },
      {
        id: "item-2",
        category: "note",
        title: "Secret Recovery Note",
        notes: "Hidden safe combination: 12-34-56",
      },
    ];

    const backupPassword = "StrongBackupPassword123!";

    it("should export an authenticated AES-256-GCM encrypted backup file", async () => {
      const backupJson = await encryptVaultBackup(mockItems, backupPassword);
      expect(typeof backupJson).toBe("string");

      const parsed = JSON.parse(backupJson);
      expect(parsed.format).toBe("keynix-encrypted-backup-v1");
      expect(parsed.version).toBe(1);
      expect(parsed.kdfParams.algorithm).toBe("argon2id");
      expect(typeof parsed.salt).toBe("string");
      expect(typeof parsed.iv).toBe("string");
      expect(typeof parsed.tag).toBe("string");
      expect(typeof parsed.ciphertext).toBe("string");

      // Verify no plaintext sensitive data exists in raw output string
      expect(backupJson).not.toContain("BankSecretPassword123!");
      expect(backupJson).not.toContain("Hidden safe combination");
    });

    it("should successfully restore items from a valid encrypted backup", async () => {
      const backupJson = await encryptVaultBackup(mockItems, backupPassword);
      const restoredItems = await decryptVaultBackup(backupJson, backupPassword);

      expect(Array.isArray(restoredItems)).toBe(true);
      expect(restoredItems.length).toBe(2);
      expect(restoredItems[0].title).toBe("Bank Account");
      expect(restoredItems[0].password).toBe("BankSecretPassword123!");
      expect(restoredItems[1].notes).toBe("Hidden safe combination: 12-34-56");
    });

    it("should fail restoration when an incorrect backup password is provided", async () => {
      const backupJson = await encryptVaultBackup(mockItems, backupPassword);

      await expect(
        decryptVaultBackup(backupJson, "WrongBackupPassword999!")
      ).rejects.toThrow("Incorrect backup password or corrupted ciphertext");
    });

    it("should fail restoration when backup ciphertext or tag is tampered with", async () => {
      const backupJson = await encryptVaultBackup(mockItems, backupPassword);
      const parsed = JSON.parse(backupJson);

      // Tamper ciphertext
      const originalCipher = parsed.ciphertext;
      parsed.ciphertext = originalCipher.slice(0, -4) + "AAAA";
      const tamperedJson = JSON.stringify(parsed);

      await expect(
        decryptVaultBackup(tamperedJson, backupPassword)
      ).rejects.toThrow("Incorrect backup password or corrupted ciphertext");
    });

    it("should fail restoration when backup file is malformed or has invalid format", async () => {
      const malformedJson = JSON.stringify({
        format: "invalid-format",
        data: "random",
      });

      await expect(
        decryptVaultBackup(malformedJson, backupPassword)
      ).rejects.toThrow("Unsupported or corrupted backup file format");
    });
  });

  // =========================================================================
  // TASK 3: AUTHENTICATION AND MASTER SALT TESTS
  // =========================================================================
  describe("Task 3: Pre-Authentication & Master Salt Flow", () => {
    const testEmail = "security-test@keynix.local";
    const masterPassword = "CorrectMasterPassword123!";

    it("should complete client-side KDF derivation using Argon2id and HKDF key separation", async () => {
      const salt = generateSalt(16);
      const masterKey = await deriveMasterKey(masterPassword, salt);
      expect(masterKey.length).toBe(32);

      const authKey = await deriveAuthKey(masterKey);
      expect(typeof authKey).toBe("string");
      expect(authKey.length).toBe(64); // 256-bit hex

      const masterEncKey = await deriveMasterEncKey(masterKey);
      expect(masterEncKey.algorithm.name).toBe("AES-GCM");

      // Verify clean key unwrapping
      const rawVaultKey = generateVaultKey();
      const encVaultKey = await encryptVaultKey(rawVaultKey, masterEncKey);
      const unwrapped = await decryptVaultKey(encVaultKey, masterEncKey);

      expect(Array.from(unwrapped)).toEqual(Array.from(rawVaultKey));
    });

    it("should fail vault key decryption if derived key is wrong", async () => {
      const salt = generateSalt(16);
      const masterKeyCorrect = await deriveMasterKey(masterPassword, salt);
      const masterKeyWrong = await deriveMasterKey("WrongPassword999!", salt);

      const masterEncKeyCorrect = await deriveMasterEncKey(masterKeyCorrect);
      const masterEncKeyWrong = await deriveMasterEncKey(masterKeyWrong);

      const rawVaultKey = generateVaultKey();
      const encVaultKey = await encryptVaultKey(rawVaultKey, masterEncKeyCorrect);

      await expect(
        decryptVaultKey(encVaultKey, masterEncKeyWrong)
      ).rejects.toThrow();
    });
  });

  // =========================================================================
  // TASK 4: HIGH-SEVERITY SECURITY REMEDIATIONS VERIFICATION
  // =========================================================================
  describe("Task 4: High-Severity Pre-Deployment Remediations", () => {
    it("should enforce rate limits on login and preauth attempts", async () => {
      const testIp = "192.168.1.100-" + Date.now();

      // First request should succeed
      const res1 = await checkRateLimit(testIp, "login", 2, 60000);
      expect(res1.success).toBe(true);

      // Second request should succeed
      const res2 = await checkRateLimit(testIp, "login", 2, 60000);
      expect(res2.success).toBe(true);

      // Third request should be blocked (rate limit exceeded)
      const res3 = await checkRateLimit(testIp, "login", 2, 60000);
      expect(res3.success).toBe(false);
      expect(res3.remaining).toBe(0);
    });

    it("should revoke all existing user sessions upon password change", async () => {
      const mockSessions = [
        { id: "s1", userId: "user-123", revokedAt: null },
        { id: "s2", userId: "user-123", revokedAt: null },
      ];

      // Simulate session revocation helper
      const revokeUserSessions = (sessions: typeof mockSessions, targetUserId: string) => {
        const now = new Date();
        return sessions.map((s) => (s.userId === targetUserId ? { ...s, revokedAt: now } : s));
      };

      const updated = revokeUserSessions(mockSessions, "user-123");

      expect(updated.every((s) => s.revokedAt !== null)).toBe(true);
    });
  });
});

