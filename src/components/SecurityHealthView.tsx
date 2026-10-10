"use client";

import React from "react";
import { useVault, DecryptedVaultItem } from "@/context/VaultContext";
import { ShieldAlert, ShieldCheck, AlertTriangle, KeyRound, ArrowUpRight, CheckCircle2, Lock } from "lucide-react";
import { evaluatePasswordStrength } from "@/lib/crypto";

interface Props {
  onEditItem: (item: DecryptedVaultItem) => void;
}

export const SecurityHealthView: React.FC<Props> = ({ onEditItem }) => {
  const { items, securityStats } = useVault();

  // Analyze weak & reused items
  const weakItems = items.filter((item) => {
    if (!item.password) return false;
    const strength = evaluatePasswordStrength(item.password);
    return strength.score < 65;
  });

  const reusedItems: { item: DecryptedVaultItem; count: number }[] = [];
  const pwdCounts = new Map<string, number>();
  items.forEach((item) => {
    if (item.password) {
      pwdCounts.set(item.password, (pwdCounts.get(item.password) || 0) + 1);
    }
  });
  items.forEach((item) => {
    if (item.password && (pwdCounts.get(item.password) || 0) > 1) {
      reusedItems.push({ item, count: pwdCounts.get(item.password) || 2 });
    }
  });

  // Security score calculation
  const totalWithPwd = items.filter((i) => i.password).length;
  const score = totalWithPwd
    ? Math.max(0, Math.round(100 - (weakItems.length * 25 + reusedItems.length * 15)))
    : 100;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-zinc-900 via-indigo-950/40 to-zinc-900 border border-indigo-500/20 rounded-3xl p-6 relative overflow-hidden shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`p-4 rounded-2xl border ${
              score >= 80
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : score >= 50
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-rose-500/10 text-rose-400 border-rose-500/30"
            }`}>
              <ShieldCheck className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Vault Security Health</h2>
              <p className="text-xs text-zinc-400 mt-1">
                Real-time zero-knowledge analysis of your encrypted vault items
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 sm:border-l sm:border-zinc-800 sm:pl-6">
            <div className="text-right">
              <div className="text-xs text-zinc-400 font-medium">Security Rating</div>
              <div className="text-3xl font-extrabold text-indigo-400 font-mono">{score}/100</div>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Total Items Monitored</span>
            <KeyRound className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2 font-mono">{securityStats.total}</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Weak Passwords</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2 font-mono">{weakItems.length}</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400">Reused Passwords</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2 font-mono">{reusedItems.length}</div>
        </div>
      </div>

      {/* Weak Passwords Alert Section */}
      {weakItems.length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-amber-400">
            <ShieldAlert className="w-5 h-5" />
            <h3 className="text-base font-bold">Weak Passwords Needing Upgrade</h3>
          </div>
          <div className="divide-y divide-zinc-800/60">
            {weakItems.map((item) => (
              <div key={item.id} className="py-3.5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <div className="text-xs text-zinc-400">{item.username || "No username"}</div>
                </div>
                <button
                  onClick={() => onEditItem(item)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-semibold border border-amber-500/20 transition flex items-center gap-1"
                >
                  <span>Strengthen</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reused Passwords Alert Section */}
      {reusedItems.length > 0 && (
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-3xl p-6 space-y-4">
          <div className="flex items-center gap-2.5 text-rose-400">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="text-base font-bold">Reused Passwords Detected</h3>
          </div>
          <p className="text-xs text-zinc-400">
            Using identical passwords across multiple services puts all accounts at risk if one is breached.
          </p>
          <div className="divide-y divide-zinc-800/60">
            {reusedItems.map(({ item, count }) => (
              <div key={item.id} className="py-3.5 flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{item.title}</div>
                  <div className="text-xs text-rose-400/80">Reused across {count} accounts</div>
                </div>
                <button
                  onClick={() => onEditItem(item)}
                  className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold border border-rose-500/20 transition flex items-center gap-1"
                >
                  <span>Change Password</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {weakItems.length === 0 && reusedItems.length === 0 && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-12 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white">Your Vault is Secure</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            No weak or duplicated passwords were found in your encrypted vault items.
          </p>
        </div>
      )}
    </div>
  );
};
