"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVault } from "@/context/VaultContext";
import { KeyRound, Mail, Lock, ArrowRight, Loader2 } from "lucide-react";
import { evaluatePasswordStrength } from "@/lib/crypto";
import { RecoveryModal } from "@/components/RecoveryModal";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useVault();

  const [email, setEmail] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [generatedRecoveryPhrase, setGeneratedRecoveryPhrase] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (masterPassword !== confirmPassword) {
      setError("Master passwords do not match");
      return;
    }

    if (masterPassword.length < 12) {
      setError("Master password must be at least 12 characters");
      return;
    }

    setIsLoading(true);
    const res = await register(email, masterPassword);
    setIsLoading(false);

    if (res.success && res.recoveryPhrase) {
      setGeneratedRecoveryPhrase(res.recoveryPhrase);
    } else if (!res.success) {
      setError(res.error || "Failed to create account");
    }
  };

  const strength = masterPassword ? evaluatePasswordStrength(masterPassword) : null;

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
          <h1 className="text-xl font-bold text-white">Create Your Encrypted Vault</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Zero-knowledge client-side Argon2id & AES-256-GCM architecture
          </p>
        </div>

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
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Master Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                required
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="Minimum 12 characters"
                className="w-full pl-10 pr-4 py-3 bg-zinc-950/60 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-white placeholder-zinc-600 text-sm outline-none transition"
              />
            </div>

            {strength && masterPassword && (
              <div className="flex items-center justify-between text-xs pt-1 px-1">
                <span className="text-zinc-500">
                  Strength: <strong className="text-zinc-300">{strength.label}</strong>
                </span>
                <span className="text-zinc-500">{strength.entropyBits} bits entropy</span>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Confirm Master Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat master password"
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
            disabled={isLoading || !email || !masterPassword || !confirmPassword}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/25 transition disabled:opacity-50 text-sm flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Computing Argon2id (64MB)...</span>
              </>
            ) : (
              <>
                <span>Create Encrypted Vault</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-zinc-800/80 text-center text-xs text-zinc-400">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-400 hover:underline font-semibold">
            Log In
          </Link>
        </div>
      </div>

      <RecoveryModal
        isOpen={!!generatedRecoveryPhrase}
        recoveryPhrase={generatedRecoveryPhrase || ""}
        onClose={() => {
          setGeneratedRecoveryPhrase(null);
          router.push("/dashboard");
        }}
      />
    </div>
  );
}
