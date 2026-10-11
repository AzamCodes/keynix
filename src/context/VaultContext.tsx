"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import * as opaque from "@serenity-kit/opaque";
import * as bip39 from "bip39";
import {
  deriveMasterKey,
  deriveAuthKey,
  deriveMasterEncKey,
  decryptVaultKey,
  encryptVaultPayload,
  decryptVaultPayload,
  generateVaultKey,
  encryptVaultKey,
  generateSalt,
  generateRecoveryPhrase,
  encryptVaultKeyWithRecovery,
  decryptVaultKeyWithRecovery,
  RecoveryEncryptedKey,
  wipeBytes,
} from "@/lib/crypto";
import { installIdleLock } from "@/lib/idle-lock";


export interface DecryptedVaultItem {
  id: string;
  category: "password" | "note" | "card" | "apikey" | "passkey";
  title: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  cardName?: string;
  cardNumber?: string;
  cardExp?: string;
  cardCvc?: string;
  apiKey?: string;
  tags?: string[];
  isFavorite?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSessionData {
  id: string;
  email: string;
  masterSalt: string;
  kdfParams: { algorithm: string; m: number; t: number; p: number };
  encryptedVaultKey: { iv: string; tag: string; ciphertext: string };
  recoveryEncryptedKey?: { iv: string; tag: string; ciphertext: string; salt: string } | null;
  recoveryEncryptedKeyV2?: RecoveryEncryptedKey | null;
}

interface VaultContextType {
  user: UserSessionData | null;
  isAuthenticated: boolean;
  isLocked: boolean;
  isLoading: boolean;
  vaultKey: Uint8Array | null;
  items: DecryptedVaultItem[];
  selectedCategory: string;
  searchQuery: string;
  setSelectedCategory: (cat: string) => void;
  setSearchQuery: (query: string) => void;
  
  // Auth actions
  login: (email: string, masterPassword: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    email: string,
    masterPassword: string
  ) => Promise<{ success: boolean; recoveryPhrase?: string; error?: string }>;
  recoverAccount: (
    email: string,
    recoveryPhrase: string,
    newMasterPassword: string
  ) => Promise<{ success: boolean; error?: string }>;
  unlockVault: (masterPassword: string) => Promise<{ success: boolean; error?: string }>;
  lockVault: () => void;
  logout: () => Promise<void>;
  
  // Vault operations
  fetchAndDecryptVault: () => Promise<void>;
  addItem: (item: Omit<DecryptedVaultItem, "id" | "createdAt" | "updatedAt">) => Promise<boolean>;
  updateItem: (id: string, updates: Partial<DecryptedVaultItem>) => Promise<boolean>;
  deleteItem: (id: string) => Promise<boolean>;
  toggleFavorite: (id: string) => Promise<boolean>;
  changeMasterPassword: (newPassword: string) => Promise<{ success: boolean; error?: string }>;
  rotateRecoveryMaterial: (currentPassword: string, recoveryPhrase: string) => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<boolean>;

  // Clipboard & UI Helpers
  copyToClipboard: (text: string, label?: string) => void;
  activeToast: string | null;
  securityStats: {
    total: number;
    weakCount: number;
    reusedCount: number;
    favoriteCount: number;
  };
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

const AUTO_LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes auto-lock

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserSessionData | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Sensitive vault key held ONLY in memory
  const [vaultKey, setVaultKey] = useState<Uint8Array | null>(null);
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [activeToast, setActiveToast] = useState<string | null>(null);

  const idleCleanupRef = useRef<(() => void) | null>(null);
  const lockVersionRef = useRef<number>(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionCheckVersionRef = useRef(0);

  const lockVault = useCallback(() => {
    lockVersionRef.current += 1;
    window.dispatchEvent(new Event("keynix:lock"));
    idleCleanupRef.current?.();
    idleCleanupRef.current = null;
    setVaultKey((prevKey) => {
      if (prevKey) {
        wipeBytes(prevKey);
      }
      return null;
    });
    setItems([]);
    setIsLocked(true);
    setSearchQuery("");
    setSelectedCategory("all");
    setActiveToast(null);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isLocked || !vaultKey) return;
    const cleanup = installIdleLock(AUTO_LOCK_TIMEOUT_MS, lockVault);
    idleCleanupRef.current = cleanup;
    return () => {
      cleanup();
      if (idleCleanupRef.current === cleanup) idleCleanupRef.current = null;
    };
  }, [isAuthenticated, isLocked, vaultKey, lockVault]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
  }, []);

  // Toast notification helper
  const copyToClipboard = useCallback(async (text: string, label = "Copied to clipboard!") => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setActiveToast("Clipboard access was unavailable.");
      return;
    }
    setActiveToast(label);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setActiveToast(null), 3000);

    // Best effort only: browser permissions and external clipboard managers
    // may prevent reading or clearing the copied value.
    if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current);
    clipboardTimerRef.current = setTimeout(async () => {
      try {
        if ((await navigator.clipboard.readText()) === text) {
          await navigator.clipboard.writeText("");
        }
      } catch {
        // Clipboard read/clear is not supported in every browser context.
      }
    }, 20000);
  }, []);

  // Check current session on mount
  const checkSession = useCallback(async (showLoading = true) => {
    const checkVersion = ++sessionCheckVersionRef.current;
    try {
      if (showLoading) setIsLoading(true);
      const res = await fetch("/api/auth/session");
      if (checkVersion !== sessionCheckVersionRef.current) return;
      if (res.ok) {
        const data = await res.json();
        if (checkVersion !== sessionCheckVersionRef.current) return;
        if (data.authenticated && data.user) {
          setUser(data.user);
          setIsAuthenticated(true);
          if (!vaultKey) setIsLocked(true); // Initial session restore needs a fresh unlock.
        }
      } else {
        lockVault();
        setUser(null);
        setIsAuthenticated(false);
      }
    } catch {
      // If the session cannot be confirmed, do not keep decrypted content open.
      lockVault();
      setUser(null);
      setIsAuthenticated(false);
    } finally {
      if (showLoading && checkVersion === sessionCheckVersionRef.current) setIsLoading(false);
    }
  }, [lockVault, vaultKey]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const checkWhenVisible = () => {
      if (document.visibilityState === "visible") void checkSession(false);
    };
    const timer = setInterval(() => void checkSession(false), 60_000);
    document.addEventListener("visibilitychange", checkWhenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", checkWhenVisible);
    };
  }, [isAuthenticated, checkSession]);

  const fetchAndDecryptVault = useCallback(async () => {
    if (!vaultKey || !user || isLocked) return;
    const currentLockVersion = lockVersionRef.current;

    try {
      const res = await fetch("/api/vault/items");
      if (lockVersionRef.current !== currentLockVersion) return;
      if (!res.ok) {
        if (res.status === 401) {
          lockVault();
          setUser(null);
          setIsAuthenticated(false);
        }
        return;
      }
      const data = await res.json();
      const rawItems = data.items || [];

      const decryptedList: DecryptedVaultItem[] = [];
      for (const item of rawItems) {
        if (isLocked || lockVersionRef.current !== currentLockVersion) return;
        try {
          const aadMetadata = JSON.parse(item.aadMeta) as { version?: number };
          const expectedAadContext = aadMetadata.version === 2
            ? { itemId: item.id, userId: user.id, version: 2 }
            : undefined;
          const payload = (await decryptVaultPayload(
            {
              ciphertext: item.ciphertext,
              iv: item.iv,
              tag: item.tag,
              aadMeta: item.aadMeta,
            },
            vaultKey,
            expectedAadContext
          )) as Partial<DecryptedVaultItem>;

          decryptedList.push({
            id: item.id,
            category: payload.category || "password",
            title: payload.title || "Untitled",
            username: payload.username || "",
            password: payload.password || "",
            url: payload.url || "",
            notes: payload.notes || "",
            cardName: payload.cardName || "",
            cardNumber: payload.cardNumber || "",
            cardExp: payload.cardExp || "",
            cardCvc: payload.cardCvc || "",
            apiKey: payload.apiKey || "",
            tags: payload.tags || [],
            isFavorite: payload.isFavorite || false,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
          });
        } catch (decErr) {
          console.error(`Failed to decrypt item ${item.id}:`, decErr);
        }
      }

      if (!isLocked && lockVersionRef.current === currentLockVersion) {
        setItems(decryptedList);
      }
    } catch (err) {
      console.error("Fetch vault items failed:", err);
    }
  }, [vaultKey, user, isLocked, lockVault]);

  useEffect(() => {
    if (vaultKey && !isLocked) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchAndDecryptVault();
    }
  }, [vaultKey, isLocked, fetchAndDecryptVault]);

  // Auth Operations
  const login = async (email: string, masterPassword: string) => {
    const operationVersion = lockVersionRef.current;
    let masterKey: Uint8Array | null = null;
    try {
      setIsLoading(true);

      // 1. Explicit pre-authentication flow to fetch user salt and KDF params
      const preauthRes = await fetch("/api/auth/preauth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!preauthRes.ok) {
        const errData = await preauthRes.json().catch(() => ({}));
        return { success: false, error: errData.error || "Pre-authentication failed" };
      }

      const preauthData = await preauthRes.json();
      const masterSalt = preauthData.masterSalt;

      // 2. Client-side key derivation using salt obtained from preauth endpoint
      masterKey = await deriveMasterKey(masterPassword, masterSalt);
      const authKey = await deriveAuthKey(masterKey);

      // 3. Authenticate with server using authKey
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, authKey }),
      });

      let data: Record<string, unknown> = {};
      try {
        data = await loginRes.json();
      } catch {
        data = { error: `Server error (${loginRes.status})` };
      }

      if (!loginRes.ok) {
        return { success: false, error: (data.error as string) || "Invalid email or password" };
      }

      if (operationVersion !== lockVersionRef.current) {
        return { success: false, error: "Login was cancelled" };
      }

      const userData: UserSessionData = data.user as UserSessionData;
      setUser(userData);
      setIsAuthenticated(true);

      // 4. Derive Master Enc Key & Unwrap Vault Key
      const masterEncKey = await deriveMasterEncKey(masterKey);
      const unwrappedVaultKey = await decryptVaultKey(userData.encryptedVaultKey, masterEncKey);
      if (operationVersion !== lockVersionRef.current) {
        wipeBytes(unwrappedVaultKey);
        return { success: false, error: "Login was cancelled" };
      }

      setVaultKey(unwrappedVaultKey);
      setIsLocked(false);
      return { success: true };
    } catch (err: unknown) {
      console.error("Login error:", err);
      const message = err instanceof Error ? err.message : "An unexpected error occurred";
      return { success: false, error: message };
    } finally {
      if (masterKey) wipeBytes(masterKey);
      setIsLoading(false);
    }
  };


  const register = async (email: string, masterPassword: string) => {
    const operationVersion = lockVersionRef.current;
    let masterKey: Uint8Array | null = null;
    let newVaultKey: Uint8Array | null = null;
    try {
      setIsLoading(true);
      const masterSalt = generateSalt(16);
      masterKey = await deriveMasterKey(masterPassword, masterSalt);
      const authKey = await deriveAuthKey(masterKey);
      const masterEncKey = await deriveMasterEncKey(masterKey);

      newVaultKey = generateVaultKey();
      const encryptedVaultKey = await encryptVaultKey(newVaultKey, masterEncKey);

      const recoveryPhrase = generateRecoveryPhrase();
      const normalizedEmail = email.toLowerCase().trim();
      const recoveryEncryptedKeyV2 = await encryptVaultKeyWithRecovery(newVaultKey, recoveryPhrase, normalizedEmail);

      await opaque.ready;
      const normalizedRecoveryPhrase = recoveryPhrase.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
      const registration = opaque.client.startRegistration({ password: normalizedRecoveryPhrase });
      const registrationStart = await fetch("/api/auth/recovery/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, registrationRequest: registration.registrationRequest }),
      });
      if (!registrationStart.ok) return { success: false, error: "Recovery setup is unavailable" };
      const registrationData = await registrationStart.json();
      const recoveryRegistration = opaque.client.finishRegistration({
        clientRegistrationState: registration.clientRegistrationState,
        registrationResponse: registrationData.registrationResponse,
        password: normalizedRecoveryPhrase,
        identifiers: { client: normalizedEmail, server: "keynix:recovery:v2" },
        keyStretching: "memory-constrained",
      });

      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          authKey,
          masterSalt,
          kdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
          encryptedVaultKey,
          recoveryEncryptedKeyV2,
          recoveryOpaqueRecord: recoveryRegistration.registrationRecord,
        }),
      });

      let data: Record<string, unknown> = {};
      try {
        data = await regRes.json();
      } catch {
        data = { error: `Server error (${regRes.status})` };
      }

      if (!regRes.ok) {
        return { success: false, error: (data.error as string) || "Registration failed" };
      }

      if (operationVersion !== lockVersionRef.current) {
        wipeBytes(newVaultKey);
        return { success: false, error: "Registration was cancelled" };
      }

      setUser(data.user as UserSessionData);
      setIsAuthenticated(true);
      setVaultKey(newVaultKey);
      setIsLocked(false);

      return { success: true, recoveryPhrase };
    } catch {
      // Registration includes recovery material; avoid logging protocol errors
      // or exposing details from the recovery exchange to the UI.
      return { success: false, error: "Registration failed" };
    } finally {
      if (masterKey) wipeBytes(masterKey);
      setIsLoading(false);
    }
  };

  const unlockVault = async (masterPassword: string) => {
    if (!user) return { success: false, error: "No active user session" };
    const operationVersion = lockVersionRef.current;
    let masterKey: Uint8Array | null = null;
    try {
      setIsLoading(true);
      masterKey = await deriveMasterKey(masterPassword, user.masterSalt);
      const masterEncKey = await deriveMasterEncKey(masterKey);

      const unwrappedVaultKey = await decryptVaultKey(user.encryptedVaultKey, masterEncKey);
      if (operationVersion !== lockVersionRef.current) {
        wipeBytes(unwrappedVaultKey);
        return { success: false, error: "Unlock was cancelled" };
      }
      setVaultKey(unwrappedVaultKey);
      setIsLocked(false);
      return { success: true };
    } catch (err: unknown) {
      console.error("Unlock error:", err);
      return { success: false, error: "Incorrect Master Password" };
    } finally {
      if (masterKey) wipeBytes(masterKey);
      setIsLoading(false);
    }
  };

  const recoverAccount = async (
    email: string,
    recoveryPhrase: string,
    newMasterPassword: string
  ) => {
    const operationVersion = lockVersionRef.current;
    let newMasterKey: Uint8Array | null = null;
    let recoveredVaultKey: Uint8Array | null = null;
    try {
      setIsLoading(true);
      const normalizedEmail = email.toLowerCase().trim();
      const normalizedRecoveryPhrase = recoveryPhrase.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
      if (!bip39.validateMnemonic(normalizedRecoveryPhrase)) return { success: false, error: "Unable to complete recovery" };

      await opaque.ready;
      const loginAttempt = opaque.client.startLogin({ password: normalizedRecoveryPhrase });
      const startResponse = await fetch("/api/auth/recovery/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, startLoginRequest: loginAttempt.startLoginRequest }),
      });
      if (!startResponse.ok) return { success: false, error: "Unable to complete recovery" };
      const startData = await startResponse.json();
      const loginResult = opaque.client.finishLogin({
        clientLoginState: loginAttempt.clientLoginState,
        loginResponse: startData.loginResponse,
        password: normalizedRecoveryPhrase,
        identifiers: { client: normalizedEmail, server: "keynix:recovery:v2" },
        keyStretching: "memory-constrained",
      });
      if (!loginResult) return { success: false, error: "Unable to complete recovery" };

      recoveredVaultKey = await decryptVaultKeyWithRecovery(
        startData.recoveryEnvelope as RecoveryEncryptedKey,
        normalizedRecoveryPhrase,
        normalizedEmail
      );
      if (operationVersion !== lockVersionRef.current) {
        wipeBytes(recoveredVaultKey);
        return { success: false, error: "Recovery was cancelled" };
      }

      // Re-derive new Master Key & Auth Key
      const newMasterSalt = generateSalt(16);
      newMasterKey = await deriveMasterKey(newMasterPassword, newMasterSalt);
      const newAuthKey = await deriveAuthKey(newMasterKey);
      const newMasterEncKey = await deriveMasterEncKey(newMasterKey);

      // Re-wrap Vault Key with new Master Enc Key
      const newEncryptedVaultKey = await encryptVaultKey(recoveredVaultKey, newMasterEncKey);

      const verificationKey = await deriveMasterEncKey(newMasterKey);
      const verifyVaultKey = await decryptVaultKey(newEncryptedVaultKey, verificationKey);
      const wrapperMatches = verifyVaultKey.length === recoveredVaultKey.length &&
        verifyVaultKey.every((value, index) => value === recoveredVaultKey![index]);
      wipeBytes(verifyVaultKey);
      if (!wrapperMatches) return { success: false, error: "Unable to complete recovery" };

      const res = await fetch("/api/auth/recovery/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: startData.challenge,
          finishLoginRequest: loginResult.finishLoginRequest,
          newAuthKey,
          newMasterSalt,
          newKdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
          newEncryptedVaultKey,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        return { success: false, error: d.error || "Recovery failed" };
      }

      if (operationVersion !== lockVersionRef.current) {
        wipeBytes(recoveredVaultKey);
        return { success: false, error: "Recovery was cancelled" };
      }

      // Recovery revokes every session. Establish a fresh session through the
      // normal login path; if that fails, the user can still sign in manually.
      wipeBytes(recoveredVaultKey);
      recoveredVaultKey = null;
      setUser(null);
      setIsAuthenticated(false);
      const signedIn = await login(normalizedEmail, newMasterPassword);
      if (!signedIn.success) return { success: false, error: "Recovery completed. Sign in with your new password." };
      return { success: true };
    } catch {
      // Do not log recovery input, OPAQUE messages, or decrypted key errors.
      return { success: false, error: "Invalid recovery phrase or failed to unlock" };
    } finally {
      if (newMasterKey) wipeBytes(newMasterKey);
      if (recoveredVaultKey) wipeBytes(recoveredVaultKey);
      setIsLoading(false);
    }
  };

  const logout = async () => {
    sessionCheckVersionRef.current += 1;
    lockVault();
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setIsAuthenticated(false);
  };

  // Vault item actions
  const addItem = async (item: Omit<DecryptedVaultItem, "id" | "createdAt" | "updatedAt">) => {
    if (!vaultKey || !user || isLocked) return false;
    try {
      const tempId = crypto.randomUUID();
      const aadContext = { itemId: tempId, userId: user.id, version: 2 };
      const encData = await encryptVaultPayload(item, vaultKey, aadContext);

      const res = await fetch("/api/vault/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encData),
      });

      if (res.ok) {
        await fetchAndDecryptVault();
        copyToClipboard("", "Item saved securely!");
        return true;
      }
    } catch (e) {
      console.error("Add item error:", e);
    }
    return false;
  };

  const updateItem = async (id: string, updates: Partial<DecryptedVaultItem>) => {
    if (!vaultKey || !user || isLocked) return false;
    try {
      const existing = items.find((i) => i.id === id);
      if (!existing) return false;

      const updatedPayload = { ...existing, ...updates };
      const aadContext = { itemId: id, userId: user.id, version: 2 };
      const encData = await encryptVaultPayload(updatedPayload, vaultKey, aadContext);

      const res = await fetch(`/api/vault/items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(encData),
      });

      if (res.ok) {
        await fetchAndDecryptVault();
        copyToClipboard("", "Vault item updated!");
        return true;
      }
    } catch (e) {
      console.error("Update item error:", e);
    }
    return false;
  };

  const deleteItem = async (id: string) => {
    if (!user || isLocked) return false;
    try {
      const res = await fetch(`/api/vault/items/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== id));
        copyToClipboard("", "Item removed from vault");
        return true;
      }
    } catch (e) {
      console.error("Delete item error:", e);
    }
    return false;
  };

  const toggleFavorite = async (id: string) => {
    if (isLocked) return false;
    const existing = items.find((i) => i.id === id);
    if (!existing) return false;
    return updateItem(id, { isFavorite: !existing.isFavorite });
  };

  const changeMasterPassword = async (newPassword: string) => {
    if (!vaultKey || !user || isLocked) return { success: false, error: "Vault key not loaded or vault locked" };

    let newMasterKey: Uint8Array | null = null;
    try {
      const newMasterSalt = generateSalt(16);
      newMasterKey = await deriveMasterKey(newPassword, newMasterSalt);
      const newAuthKey = await deriveAuthKey(newMasterKey);
      const newMasterEncKey = await deriveMasterEncKey(newMasterKey);

      const newEncryptedVaultKey = await encryptVaultKey(vaultKey, newMasterEncKey);

      const res = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newAuthKey,
          newMasterSalt,
          newKdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
          newEncryptedVaultKey,
        }),
      });

      if (res.ok) {
        await checkSession();
        copyToClipboard("", "Master Password updated successfully!");
        return { success: true };
      } else {
        const d = await res.json();
        return { success: false, error: d.error || "Failed to update password" };
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Failed to update password";
      return { success: false, error: message };
    } finally {
      if (newMasterKey) wipeBytes(newMasterKey);
    }
  };

  const rotateRecoveryMaterial = async (currentPassword: string, recoveryPhrase: string) => {
    if (!vaultKey || !user || isLocked) return { success: false, error: "Unlock the vault before changing recovery material" };
    let currentMasterKey: Uint8Array | null = null;
    try {
      const normalizedPhrase = recoveryPhrase.normalize("NFKD").trim().toLowerCase().split(/\s+/).join(" ");
      if (!bip39.validateMnemonic(normalizedPhrase)) return { success: false, error: "Invalid recovery phrase" };
      currentMasterKey = await deriveMasterKey(currentPassword, user.masterSalt);
      const currentAuthKey = await deriveAuthKey(currentMasterKey);
      const currentMasterEncKey = await deriveMasterEncKey(currentMasterKey);
      const verifiedVaultKey = await decryptVaultKey(user.encryptedVaultKey, currentMasterEncKey);
      const matches = verifiedVaultKey.length === vaultKey.length && verifiedVaultKey.every((value, index) => value === vaultKey[index]);
      wipeBytes(verifiedVaultKey);
      if (!matches) return { success: false, error: "Current password was not accepted" };

      await opaque.ready;
      const registration = opaque.client.startRegistration({ password: normalizedPhrase });
      const registrationResponse = await fetch("/api/account/recovery/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationRequest: registration.registrationRequest, currentAuthKey }),
      });
      if (!registrationResponse.ok) return { success: false, error: "Unable to rotate recovery material" };
      const registrationData = await registrationResponse.json();
      const record = opaque.client.finishRegistration({
        clientRegistrationState: registration.clientRegistrationState,
        registrationResponse: registrationData.registrationResponse,
        password: normalizedPhrase,
        identifiers: { client: user.email, server: "keynix:recovery:v2" },
        keyStretching: "memory-constrained",
      });
      const recoveryEnvelope = await encryptVaultKeyWithRecovery(vaultKey, normalizedPhrase, user.email);
      const loginAttempt = opaque.client.startLogin({ password: normalizedPhrase });
      const verifyStart = await fetch("/api/account/recovery/enroll/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentAuthKey,
          recoveryOpaqueRecord: record.registrationRecord,
          recoveryEnvelope,
          startLoginRequest: loginAttempt.startLoginRequest,
        }),
      });
      if (!verifyStart.ok) return { success: false, error: "Unable to rotate recovery material" };
      const verifyData = await verifyStart.json();
      const loginResult = opaque.client.finishLogin({
        clientLoginState: loginAttempt.clientLoginState,
        loginResponse: verifyData.loginResponse,
        password: normalizedPhrase,
        identifiers: { client: user.email, server: "keynix:recovery:v2" },
        keyStretching: "memory-constrained",
      });
      if (!loginResult) return { success: false, error: "Unable to verify new recovery material" };

      const finish = await fetch("/api/account/recovery/enroll/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challenge: verifyData.challenge,
          finishLoginRequest: loginResult.finishLoginRequest,
          currentAuthKey,
        }),
      });
      if (!finish.ok) return { success: false, error: "Unable to rotate recovery material" };
      await checkSession();
      return { success: true };
    } catch {
      return { success: false, error: "Unable to rotate recovery material" };
    } finally {
      if (currentMasterKey) wipeBytes(currentMasterKey);
    }
  };

  const deleteAccount = async () => {
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (res.ok) {
        logout();
        return true;
      }
    } catch (e) {
      console.error("Delete account error:", e);
    }
    return false;
  };

  // Compute vault security statistics
  const securityStats = React.useMemo(() => {
    let weakCount = 0;
    let favoriteCount = 0;
    const pwdMap = new Map<string, number>();

    items.forEach((item) => {
      if (item.isFavorite) favoriteCount++;
      if (item.password) {
        if (item.password.length < 12 || !/[A-Z]/.test(item.password) || !/[0-9]/.test(item.password)) {
          weakCount++;
        }
        pwdMap.set(item.password, (pwdMap.get(item.password) || 0) + 1);
      }
    });

    let reusedCount = 0;
    pwdMap.forEach((count) => {
      if (count > 1) reusedCount += count;
    });

    return {
      total: items.length,
      weakCount,
      reusedCount,
      favoriteCount,
    };
  }, [items]);

  return (
    <VaultContext.Provider
      value={{
        user,
        isAuthenticated,
        isLocked,
        isLoading,
        vaultKey,
        items,
        selectedCategory,
        searchQuery,
        setSelectedCategory,
        setSearchQuery,
        login,
        register,
        recoverAccount,
        unlockVault,
        lockVault,
        logout,
        fetchAndDecryptVault,
        addItem,
        updateItem,
        deleteItem,
        toggleFavorite,
        changeMasterPassword,
        rotateRecoveryMaterial,
        deleteAccount,
        copyToClipboard,
        activeToast,
        securityStats,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error("useVault must be used within a VaultProvider");
  }
  return context;
};
