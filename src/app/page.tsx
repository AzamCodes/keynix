"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Lock,
  KeyRound,
  Cpu,
  Layers,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Database,
} from "lucide-react";
import { generatePassword, evaluatePasswordStrength } from "@/lib/crypto";

export default function LandingPage() {
  const [demoPassword, setDemoPassword] = useState("K3yn!x-Vault-2026$#");
  const strength = evaluatePasswordStrength(demoPassword);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Background Gradients */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-violet-600/15 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
      </div>

      {/* Header Navigation */}
      <header className="h-20 border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl sticky top-0 z-40 px-6 lg:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <KeyRound className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight text-white font-mono">KEYNIX</span>
            <span className="ml-2.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Zero-Knowledge Architecture
            </span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-8 text-xs font-semibold text-zinc-400">
          <a href="#features" className="hover:text-white transition">Features</a>
          <a href="#architecture" className="hover:text-white transition">Cryptography</a>
          <a href="#demo" className="hover:text-white transition">Live Demo</a>
          <a href="#faq" className="hover:text-white transition">FAQ</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white transition"
          >
            Sign In
          </Link>
          <Link
            href="/register"
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition"
          >
            Open Vault
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 lg:px-12 py-24 md:py-32 max-w-6xl mx-auto text-center space-y-8 z-10">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 text-xs font-semibold text-indigo-400 mb-2">
          <Sparkles className="w-4 h-4" />
          <span>Argon2id KDF + AES-256-GCM Zero-Trust Vault</span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight text-white leading-tight">
          Your Master Key Never Leaves Your Browser.
        </h1>

        <p className="text-base md:text-xl text-zinc-400 max-w-3xl mx-auto leading-relaxed">
          Keynix is a zero-knowledge, end-to-end encrypted credential platform. We utilize browser-side Argon2id key derivation, HKDF key splitting, and AES-256-GCM authenticated encryption so even if our servers are compromised, your data remains impossible to decrypt.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/register"
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition flex items-center justify-center gap-2"
          >
            <span>Create Free Vault</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 font-bold text-sm transition flex items-center justify-center gap-2"
          >
            <Lock className="w-4 h-4 text-indigo-400" />
            <span>Launch Web Vault</span>
          </Link>
        </div>

        {/* Security Seals */}
        <div className="pt-12 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto text-left">
          {[
            { label: "Zero-Knowledge", desc: "Server stores 0 plaintext keys" },
            { label: "Argon2id KDF", desc: "64MB memory-hard hashing" },
            { label: "AES-256-GCM", desc: "NIST authenticated cipher" },
            { label: "BIP-39 Recovery", desc: "24-word seed phrase protection" },
          ].map((seal, idx) => (
            <div key={idx} className="p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80">
              <CheckCircle2 className="w-5 h-5 text-indigo-400 mb-2" />
              <div className="text-xs font-bold text-white">{seal.label}</div>
              <div className="text-[11px] text-zinc-400 mt-0.5">{seal.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Interactive Password Strength Demo */}
      <section id="demo" className="px-6 lg:px-12 py-16 bg-zinc-900/40 border-y border-zinc-800/80 relative z-10">
        <div className="max-w-4xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold text-white">Live Cryptographic Entropy Tester</h2>
            <p className="text-xs text-zinc-400">
              Test password strength calculated in real-time using Shannon entropy metrics
            </p>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <input
                  type="text"
                  value={demoPassword}
                  onChange={(e) => setDemoPassword(e.target.value)}
                  placeholder="Type a test password..."
                  className="w-full pl-4 pr-12 py-3 bg-zinc-950 border border-zinc-800 rounded-xl text-white font-mono text-sm focus:border-indigo-500 outline-none"
                />
              </div>
              <button
                onClick={() => setDemoPassword(generatePassword({ length: 24 }))}
                className="w-full sm:w-auto px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shrink-0 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate Random</span>
              </button>
            </div>

            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs text-zinc-400">
                <span>Rating: <strong className="text-white">{strength.label}</strong></span>
                <span className="font-mono text-indigo-400 font-semibold">{strength.entropyBits} Bits Entropy</span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    strength.score >= 85
                      ? "bg-emerald-500"
                      : strength.score >= 65
                      ? "bg-indigo-500"
                      : strength.score >= 40
                      ? "bg-amber-500"
                      : "bg-rose-500"
                  }`}
                  style={{ width: `${Math.max(10, strength.score)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Architecture Section */}
      <section id="architecture" className="px-6 lg:px-12 py-24 max-w-6xl mx-auto space-y-12 z-10">
        <div className="text-center space-y-3">
          <h2 className="text-3xl font-extrabold text-white">Cryptographic Envelope Hierarchy</h2>
          <p className="text-xs text-zinc-400 max-w-2xl mx-auto">
            Keynix separates identity authentication from payload encryption using a two-tier key hierarchy.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 w-fit">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">1. Master Key Derivation</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Your Master Password (<code className="text-indigo-300">P</code>) is processed via Argon2id with 64MB memory hardness ($t=3, m=65536, p=4$) to produce 256-bit Master Key (<code className="text-indigo-300">MK</code>).
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div className="p-3 rounded-2xl bg-violet-500/10 text-violet-400 border border-violet-500/20 w-fit">
              <Layers className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">2. HKDF Key Splitting</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              HKDF-Expand derives <code className="text-violet-300">K_auth</code> (sent over TLS for server login verification) and <code className="text-violet-300">K_master_enc</code> (kept exclusively in browser memory).
            </p>
          </div>

          <div className="p-6 rounded-3xl bg-zinc-900/60 border border-zinc-800 space-y-4">
            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 w-fit">
              <Database className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-white">3. AES-256-GCM Vault Key</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Vault Key (<code className="text-emerald-300">K_vault</code>) encrypts all credentials with 12-byte CSPRNG IVs and AAD context. Master password changes do not re-encrypt items!
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 py-12 px-6 lg:px-12 text-center text-xs text-zinc-500 mt-auto">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-white">KEYNIX VAULT</span>
            <span>© 2026 Zero-Knowledge Encrypted Security</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="hover:text-white">Login</Link>
            <Link href="/register" className="hover:text-white">Register</Link>
            <Link href="/dashboard" className="hover:text-white">Vault</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
