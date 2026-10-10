"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVault } from "@/context/VaultContext";
import { KeyRound, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const { login, recoverAccount } = useVault();

  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Account recovery state
  const [showRecoveryForm, setShowRecoveryForm] = useState(false);
  const [recoveryPhrase, setRecoveryPhrase] = useState("");
  const [newMasterPassword, setNewMasterPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const res = await login(email, masterPassword);
    setIsLoading(false);

    if (res.success) {
      router.push("/dashboard");
    } else {
      setError(res.error || "Failed to log in");
    }
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const res = await recoverAccount(email, recoveryPhrase, newMasterPassword);
    setIsLoading(false);

    if (res.success) {
      router.push("/dashboard");
    } else {
      setError(res.error || "Failed account recovery");
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col justify-center items-center px-4 py-12 relative">
      {/* Glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900/80 border border-zinc-800 rounded-3xl p-8 shadow-2xl relative z-10 backdrop-blur-xl">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <KeyRound className="w-6 h-6" />
            </div>
            <span className="text-2xl font-black tracking-tight text-white font-mono">KEYNIX</span>
          </Link>
          <h1 className="text-xl font-bold text-white">
            {showRecoveryForm ? "Account Recovery" : "Unlock Your Vault"}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            {showRecoveryForm
              ? "Enter your 24-word BIP-39 recovery seed phrase to reset master password"
              : "Client-side Argon2id key derivation & decryption"}
          </p>
        </div>

        {!showRecoveryForm ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full pl-10 pr-4 py-3 bg-zinc-950/60 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-white placeholder-zinc-600 text-sm outline-none transition"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Master Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowRecoveryForm(true)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  required
                  value={masterPassword}
                  onChange={(e) => setMasterPassword(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-zinc-950/60 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-white placeholder-zinc-600 text-sm outline-none transition"
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
              disabled={isLoading || !email || !masterPassword}
              className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/25 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Deriving Argon2id Key...</span>
                </>
              ) : (
                <>
                  <span>Decrypt & Log In</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRecoverySubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                24-Word Seed Phrase
              </label>
              <textarea
                rows={3}
                required
                value={recoveryPhrase}
                onChange={(e) => setRecoveryPhrase(e.target.value)}
                placeholder="falcon orbit prism quantum..."
                className="w-full p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-xs font-mono outline-none resize-none"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                New Master Password
              </label>
              <input
                type="password"
                required
                value={newMasterPassword}
                onChange={(e) => setNewMasterPassword(e.target.value)}
                placeholder="New strong master password"
                className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm outline-none"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-xs font-medium">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowRecoveryForm(false)}
                className="flex-1 py-3 px-4 bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold"
              >
                Back to Login
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                {isLoading ? "Recovering..." : "Recover Account"}
              </button>
            </div>
          </form>
        )}

        <div className="mt-8 pt-6 border-t border-zinc-800/80 text-center text-xs text-zinc-400">
          Don&apos;t have a vault yet?{" "}
          <Link href="/register" className="text-indigo-400 hover:underline font-semibold">
            Create Free Account
          </Link>
        </div>
      </div>
    </div>
  );
}
