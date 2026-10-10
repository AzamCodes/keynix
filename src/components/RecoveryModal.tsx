"use client";

import React, { useState } from "react";
import { Copy, Download, ShieldCheck, CheckCircle2, ArrowRight } from "lucide-react";
import { useVault } from "@/context/VaultContext";

interface Props {
  isOpen: boolean;
  recoveryPhrase: string;
  onClose: () => void;
}

export const RecoveryModal: React.FC<Props> = ({ isOpen, recoveryPhrase, onClose }) => {
  const { copyToClipboard } = useVault();
  const [copied, setCopied] = useState(false);

  if (!isOpen || !recoveryPhrase) return null;

  const words = recoveryPhrase.split(" ");

  const handleCopy = () => {
    copyToClipboard(recoveryPhrase, "Recovery phrase copied to clipboard!");
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownload = () => {
    const text = `KEYNIX ACCOUNT RECOVERY PHRASE\n\nSave this phrase in a secure physical location (e.g. paper vault, physical safe).\n\n${recoveryPhrase}\n\nGenerated: ${new Date().toISOString()}`;
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `keynix-recovery-phrase-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative my-auto max-h-[92vh] flex flex-col overflow-hidden">
        <div className="text-center mb-4 sm:mb-6 shrink-0">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-2 sm:mb-3">
            <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold text-white">Account Recovery Seed Phrase</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto mt-1 leading-relaxed">
            This 24-word BIP-39 cryptographic seed phrase can recover your vault key if you forget your Master Password.
          </p>
        </div>

        {/* 24 Words Grid */}
        <div className="flex-1 overflow-y-auto min-h-[160px] max-h-[45vh] bg-zinc-950/80 border border-zinc-800 p-3 sm:p-4 rounded-2xl mb-4 sm:mb-6">
          <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2">
            {words.map((word, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 rounded-xl bg-zinc-900/60 border border-zinc-800/80 text-xs font-mono"
              >
                <span className="text-zinc-600 select-none text-[10px] w-4 text-right shrink-0">
                  {idx + 1}.
                </span>
                <span className="text-indigo-300 font-semibold truncate">{word}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 pt-2 border-t border-zinc-800/80">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleCopy}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-2"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? "Copied" : "Copy Seed"}</span>
            </button>
            <button
              onClick={handleDownload}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Save TXT</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/25 transition flex items-center justify-center gap-2"
          >
            <span>I Saved My Recovery Phrase</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

