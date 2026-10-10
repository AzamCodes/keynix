"use client";

import React, { useState } from "react";
import { useVault } from "@/context/VaultContext";
import { Lock, Shield, KeyRound, ArrowRight, Loader2 } from "lucide-react";

export const LockScreen: React.FC = () => {
  const { unlockVault, user, logout } = useVault();
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!masterPassword) return;

    setIsSubmitting(true);
    setError(null);

    const res = await unlockVault(masterPassword);
    setIsSubmitting(false);

    if (!res.success) {
      setError(res.error || "Incorrect Master Password");
    } else {
      setMasterPassword("");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-zinc-900/80 border border-zinc-800/80 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden my-auto">
        {/* Glow decoration */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-violet-600/20 rounded-full blur-3xl pointer-events-none" />

        <div className="text-center mb-6 sm:mb-8 relative">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 text-indigo-400 mb-3 sm:mb-4 shadow-lg shadow-indigo-500/10">
            <Lock className="w-7 h-7 sm:w-8 sm:h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">Vault Locked</h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            {user?.email ? (
              <span>Locked for <strong className="text-zinc-200">{user.email}</strong></span>
            ) : (
              "Enter your Master Password to decrypt vault contents"
            )}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Master Password
            </label>
            <div className="relative">
              <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                required
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="••••••••••••••••"
                className="w-full pl-10 pr-4 py-3 bg-zinc-950/60 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-white placeholder-zinc-600 text-sm transition outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !masterPassword}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-medium rounded-xl shadow-lg shadow-indigo-600/25 transition disabled:opacity-50 text-sm"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Decrypting Memory...</span>
              </>
            ) : (
              <>
                <span>Unlock Vault</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 pt-6 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate">Zero-Knowledge AES-256</span>
          </div>
          <button
            type="button"
            onClick={logout}
            className="hover:text-zinc-300 underline underline-offset-4 transition shrink-0"
          >
            Log Out Account
          </button>
        </div>
      </div>
    </div>
  );
};

