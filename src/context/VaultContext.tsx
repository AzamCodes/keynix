"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
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
  wipeBytes,
} from "@/lib/crypto";


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

  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lockVersionRef = useRef<number>(0);

  const lockVault = useCallback(() => {
    lockVersionRef.current += 1;
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
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

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (isAuthenticated && !isLocked && vaultKey) {
      idleTimerRef.current = setTimeout(() => {
        lockVault();
      }, AUTO_LOCK_TIMEOUT_MS);
    }
  }, [isAuthenticated, isLocked, vaultKey, lockVault]);

  useEffect(() => {
    const handleActivity = () => resetIdleTimer();
    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);
    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  // Toast notification helper
  const copyToClipboard = useCallback((text: string, label = "Copied to clipboard!") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setActiveToast(label);
    setTimeout(() => setActiveToast(null), 3000);

    // Auto-clear clipboard after 20 seconds for sensitive values
    setTimeout(() => {
      navigator.clipboard.readText().then((clipText) => {
        if (clipText === text) {
          navigator.clipboard.writeText("");
        }
      }).catch(() => {});
    }, 20000);
  }, []);

  // Check current session on mount
  const checkSession = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          setIsAuthenticated(true);
          setIsLocked(true); // Locked until user enters master password to unwrap key
        }
      }
    } catch (e) {
      console.error("Session check failed:", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const fetchAndDecryptVault = useCallback(async () => {
    if (!vaultKey || !user || isLocked) return;
    const currentLockVersion = lockVersionRef.current;

    try {
      const res = await fetch("/api/vault/items");
      if (!res.ok) return;
      const data = await res.json();
      const rawItems = data.items || [];

      const decryptedList: DecryptedVaultItem[] = [];
      for (const item of rawItems) {
        if (isLocked || lockVersionRef.current !== currentLockVersion) return;
        try {
          const payload = await decryptVaultPayload(
            {
              ciphertext: item.ciphertext,
              iv: item.iv,
              tag: item.tag,
              aadMeta: item.aadMeta,
            },
            vaultKey
          );

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
  }, [vaultKey, user, isLocked]);

  useEffect(() => {
    if (vaultKey && !isLocked) {
      fetchAndDecryptVault();
    }
  }, [vaultKey, isLocked, fetchAndDecryptVault]);

  // Auth Operations
  const login = async (email: string, masterPassword: string) => {
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
      const masterKey = await deriveMasterKey(masterPassword, masterSalt);
      const authKey = await deriveAuthKey(masterKey);

      // 3. Authenticate with server using authKey
      const loginRes = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, authKey }),
      });

      let data: any = {};
      try {
        data = await loginRes.json();
      } catch {
        data = { error: `Server error (${loginRes.status})` };
      }

      if (!loginRes.ok) {
        wipeBytes(masterKey);
        return { success: false, error: data.error || "Invalid email or password" };
      }

      const userData: UserSessionData = data.user;
      setUser(userData);
      setIsAuthenticated(true);

      // 4. Derive Master Enc Key & Unwrap Vault Key
      const masterEncKey = await deriveMasterEncKey(masterKey);
      const unwrappedVaultKey = await decryptVaultKey(userData.encryptedVaultKey, masterEncKey);
      wipeBytes(masterKey);

      setVaultKey(unwrappedVaultKey);
      setIsLocked(false);
      return { success: true };
    } catch (err: any) {
      console.error("Login error:", err);
      return { success: false, error: err.message || "An unexpected error occurred" };
    } finally {
      setIsLoading(false);
    }
  };


  const register = async (email: string, masterPassword: string) => {
    try {
      setIsLoading(true);
      const masterSalt = generateSalt(16);
      const masterKey = await deriveMasterKey(masterPassword, masterSalt);
      const authKey = await deriveAuthKey(masterKey);
      const masterEncKey = await deriveMasterEncKey(masterKey);

      const newVaultKey = generateVaultKey();
      const encryptedVaultKey = await encryptVaultKey(newVaultKey, masterEncKey);

      const recoveryPhrase = generateRecoveryPhrase();
      const recoveryEncryptedKey = await encryptVaultKeyWithRecovery(newVaultKey, recoveryPhrase);

      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          authKey,
          masterSalt,
          kdfParams: { algorithm: "argon2id", m: 65536, t: 3, p: 4 },
          encryptedVaultKey,
          recoveryEncryptedKey,
        }),
      });

      let data: any = {};
      try {
        data = await regRes.json();
      } catch {
        data = { error: `Server error (${regRes.status})` };
      }

      if (!regRes.ok) {
        return { success: false, error: data.error || "Registration failed" };
      }

      setUser(data.user);
      setIsAuthenticated(true);
      setVaultKey(newVaultKey);
      setIsLocked(false);

      return { success: true, recoveryPhrase };
    } catch (err: any) {
      console.error("Register error:", err);
      return { success: false, error: err.message || "Registration failed" };
    } finally {
      setIsLoading(false);
    }
  };

  const unlockVault = async (masterPassword: string) => {
    if (!user) return { success: false, error: "No active user session" };
    try {
      setIsLoading(true);
      const masterKey = await deriveMasterKey(masterPassword, user.masterSalt);
      const masterEncKey = await deriveMasterEncKey(masterKey);

      const unwrappedVaultKey = await decryptVaultKey(user.encryptedVaultKey, masterEncKey);
      setVaultKey(unwrappedVaultKey);
      setIsLocked(false);
      return { success: true };
    } catch (err: any) {
      console.error("Unlock error:", err);
      return { success: false, error: "Incorrect Master Password" };
    } finally {
      setIsLoading(false);
    }
  };

  const recoverAccount = async (
    email: string,
    recoveryPhrase: string,
    newMasterPassword: string
  ) => {
    try {
      setIsLoading(true);
      // Pre-login or fetch user session data
      if (!user || user.email !== email) {
        return { success: false, error: "Please log in first or verify user account" };
      }
      if (!user.recoveryEncryptedKey) {
        return { success: false, error: "No recovery key found for this account" };
      }

      // Decrypt Vault Key using recovery phrase
      const recoveredVaultKey = await decryptVaultKeyWithRecovery(
        user.recoveryEncryptedKey,
        recoveryPhrase
      );

      // Re-derive new Master Key & Auth Key
      const newMasterSalt = generateSalt(16);
      const newMasterKey = await deriveMasterKey(newMasterPassword, newMasterSalt);
      const newAuthKey = await deriveAuthKey(newMasterKey);
      const newMasterEncKey = await deriveMasterEncKey(newMasterKey);

      // Re-wrap Vault Key with new Master Enc Key
      const newEncryptedVaultKey = await encryptVaultKey(recoveredVaultKey, newMasterEncKey);

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

      if (!res.ok) {
        const d = await res.json();
        return { success: false, error: d.error || "Recovery failed" };
      }

      setVaultKey(recoveredVaultKey);
      setIsLocked(false);
      await checkSession();
      return { success: true };
    } catch (err: any) {
      console.error("Account recovery error:", err);
      return { success: false, error: "Invalid recovery phrase or failed to unlock" };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
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
      const aadContext = { itemId: tempId, userId: user.id, version: 1 };
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
      const aadContext = { itemId: id, userId: user.id, version: 1 };
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

    try {
      const newMasterSalt = generateSalt(16);
      const newMasterKey = await deriveMasterKey(newPassword, newMasterSalt);
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
    } catch (e: any) {
      return { success: false, error: e.message || "Failed to update password" };
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
