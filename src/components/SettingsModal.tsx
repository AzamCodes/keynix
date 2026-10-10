"use client";

import React, { useState } from "react";
import { useVault, DecryptedVaultItem } from "@/context/VaultContext";
import {
  X,
  KeyRound,
  ShieldAlert,
  Download,
  Upload,
  Trash2,
  Lock,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import {
  evaluatePasswordStrength,
  encryptVaultBackup,
  decryptVaultBackup,
} from "@/lib/crypto";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { user, changeMasterPassword, deleteAccount, items, addItem, copyToClipboard } = useVault();

  const [activeTab, setActiveTab] = useState<"security" | "backup" | "account">("security");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Backup Export State
  const [exportPassword, setExportPassword] = useState("");
  const [confirmExportPassword, setConfirmExportPassword] = useState("");
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Backup Import State
  const [importPassword, setImportPassword] = useState("");
  const [selectedImportFile, setSelectedImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importIsError, setImportIsError] = useState(false);

  if (!isOpen) return null;

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (newPassword.length < 12) {
      setPasswordError("Master password must be at least 12 characters");
      return;
    }

    setIsUpdating(true);
    const res = await changeMasterPassword(newPassword);
    setIsUpdating(false);

    if (!res.success) {
      setPasswordError(res.error || "Failed to update master password");
    } else {
      setNewPassword("");
      setConfirmPassword("");
      onClose();
    }
  };

  const handleExportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setExportError(null);

    if (exportPassword.length < 12) {
      setExportError("Backup encryption password must be at least 12 characters");
      return;
    }

    if (exportPassword !== confirmExportPassword) {
      setExportError("Backup passwords do not match");
      return;
    }

    try {
      setIsExporting(true);
      const encryptedJson = await encryptVaultBackup(items as unknown as Record<string, unknown>[], exportPassword);
      const blob = new Blob([encryptedJson], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `keynix-encrypted-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      setExportPassword("");
      setConfirmExportPassword("");
      copyToClipboard("", "Encrypted Vault Backup exported successfully!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to encrypt backup";
      setExportError(message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setImportStatus(null);
    setImportIsError(false);

    if (!selectedImportFile) {
      setImportStatus("Please select an encrypted backup .json file");
      setImportIsError(true);
      return;
    }

    if (!importPassword) {
      setImportStatus("Please enter the backup encryption password");
      setImportIsError(true);
      return;
    }

    try {
      setIsImporting(true);
      const text = await selectedImportFile.text();
      const decryptedItems = await decryptVaultBackup(text, importPassword);

      let count = 0;
      for (const item of decryptedItems as Partial<DecryptedVaultItem>[]) {
        await addItem({
          category: item.category || "password",
          title: item.title || "Imported Item",
          username: item.username || "",
          password: item.password || "",
          url: item.url || "",
          notes: item.notes || "",
          cardName: item.cardName || "",
          cardNumber: item.cardNumber || "",
          cardExp: item.cardExp || "",
          cardCvc: item.cardCvc || "",
          apiKey: item.apiKey || "",
          tags: item.tags || [],
          isFavorite: item.isFavorite || false,
        });
        count++;
      }

      setImportStatus(`Successfully restored ${count} items into your vault!`);
      setImportIsError(false);
      setImportPassword("");
      setSelectedImportFile(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to decrypt backup";
      setImportStatus(message);
      setImportIsError(true);
    } finally {
      setIsImporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (
      confirm(
        "PERMANENT DELETE WARNING: Deleting your account will immediately wipe your encrypted vault and all associated records forever. Are you sure?"
      )
    ) {
      await deleteAccount();
      onClose();
    }
  };

  const strength = newPassword ? evaluatePasswordStrength(newPassword) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl relative my-auto max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800 shrink-0">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-white">Vault Settings & Security</h3>
            <p className="text-xs text-zinc-400">{user?.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 sm:p-2.5 rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Navigation Tabs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 bg-zinc-950/40 p-1.5 rounded-2xl border border-zinc-800/80">
            {[
              { id: "security", label: "Master Password", icon: KeyRound },
              { id: "backup", label: "Encrypted Backup", icon: ShieldCheck },
              { id: "account", label: "Danger Zone", icon: ShieldAlert },
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as "security" | "backup" | "account")}
                  className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    active
                      ? "bg-zinc-800 text-white shadow"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab 1: Master Password */}
          {activeTab === "security" && (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <p className="text-xs text-zinc-400 leading-relaxed">
                Changing your Master Password re-wraps your Vault Key (<code className="font-mono text-indigo-400">K_vault</code>) under a new Master Encryption Key (<code className="font-mono text-indigo-400">K_master_enc</code>). Vault items remain untouched.
              </p>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  New Master Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 12 characters"
                  className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm focus:border-indigo-500 outline-none transition"
                />
                {strength && newPassword && (
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-zinc-500">Strength: <strong className="text-zinc-300">{strength.label}</strong></span>
                    <span className="text-zinc-500">{strength.entropyBits} bits entropy</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Confirm New Master Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new master password"
                  className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm focus:border-indigo-500 outline-none transition"
                />
              </div>

              {passwordError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
                  {passwordError}
                </div>
              )}

              <button
                type="submit"
                disabled={isUpdating || !newPassword || !confirmPassword}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/20 text-xs transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Re-wrapping Vault Key...</span>
                  </>
                ) : (
                  <span>Update Master Password</span>
                )}
              </button>
            </form>
          )}

          {/* Tab 2: Encrypted Export & Import */}
          {activeTab === "backup" && (
            <div className="space-y-6">
              {/* Export */}
              <form onSubmit={handleExportBackup} className="bg-zinc-950/50 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Export Encrypted Vault Backup</span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    Encrypts vault items client-side using AES-256-GCM and Argon2id derived key. Plaintext export is disabled.
                  </p>
                </div>

                <div className="space-y-2 pt-1">
                  <input
                    type="password"
                    required
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.target.value)}
                    placeholder="Set Backup Encryption Password (min 12 chars)"
                    className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500 transition"
                  />
                  <input
                    type="password"
                    required
                    value={confirmExportPassword}
                    onChange={(e) => setConfirmExportPassword(e.target.value)}
                    placeholder="Confirm Backup Encryption Password"
                    className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500 transition"
                  />
                </div>

                {exportError && (
                  <div className="p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
                    {exportError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isExporting || items.length === 0}
                  className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  <span>{isExporting ? "Encrypting Backup..." : "Export AES-256-GCM Encrypted Backup"}</span>
                </button>
              </form>

              {/* Import */}
              <form onSubmit={handleImportBackup} className="bg-zinc-950/50 border border-zinc-800/80 rounded-2xl p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <Upload className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>Restore Encrypted Backup</span>
                  </h4>
                  <p className="text-xs text-zinc-400 mt-0.5">Decrypt and import items from a Keynix encrypted backup file</p>
                </div>

                <div className="space-y-2">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setSelectedImportFile(e.target.files?.[0] || null)}
                    className="w-full text-xs text-zinc-400 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                  />

                  <input
                    type="password"
                    value={importPassword}
                    onChange={(e) => setImportPassword(e.target.value)}
                    placeholder="Enter Backup Encryption Password"
                    className="w-full px-3.5 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white text-xs outline-none focus:border-indigo-500 transition"
                  />
                </div>

                {importStatus && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                      importIsError
                        ? "bg-red-500/10 border border-red-500/20 text-red-400"
                        : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {importIsError ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
                    <span>{importStatus}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isImporting || !selectedImportFile || !importPassword}
                  className="w-full py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold shadow transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4 text-emerald-400" />}
                  <span>{isImporting ? "Decrypting Backup..." : "Decrypt & Restore Vault Items"}</span>
                </button>
              </form>
            </div>
          )}

          {/* Tab 3: Danger Zone */}
          {activeTab === "account" && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-3 text-red-400">
                <ShieldAlert className="w-6 h-6 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold">Delete Account & Vault Data</h4>
                  <p className="text-xs text-zinc-400">Irreversible SQL cascade hard deletion</p>
                </div>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Deleting your Keynix account immediately deletes your user row, encrypted vault items, active sessions, and cryptographic key parameters. There is no un-delete option.
              </p>
              <button
                onClick={handleDeleteAccount}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg shadow-red-600/20 transition flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Permanently Delete Account</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

