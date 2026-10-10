"use client";

import React, { useState, useEffect } from "react";
import { generatePassword, evaluatePasswordStrength } from "@/lib/crypto";
import { Copy, RefreshCw, X, Shield, Sparkles, SlidersHorizontal } from "lucide-react";
import { useVault } from "@/context/VaultContext";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSelectPassword?: (pwd: string) => void;
}

export const PasswordGeneratorModal: React.FC<Props> = ({ isOpen, onClose, onSelectPassword }) => {
  const { copyToClipboard } = useVault();
  const [password, setPassword] = useState("");
  const [length, setLength] = useState(20);
  const [uppercase, setUppercase] = useState(true);
  const [lowercase, setLowercase] = useState(true);
  const [numbers, setNumbers] = useState(true);
  const [symbols, setSymbols] = useState(true);
  const [passphrase, setPassphrase] = useState(false);
  const [wordCount, setWordCount] = useState(4);

  const generate = () => {
    const pwd = generatePassword({
      length,
      uppercase,
      lowercase,
      numbers,
      symbols,
      passphrase,
      wordCount,
    });
    setPassword(pwd);
  };

  useEffect(() => {
    if (isOpen) generate();
  }, [isOpen, length, uppercase, lowercase, numbers, symbols, passphrase, wordCount]);

  if (!isOpen) return null;

  const strength = evaluatePasswordStrength(password);

  const getScoreColor = () => {
    if (strength.score >= 85) return "bg-emerald-500 text-emerald-400 border-emerald-500/30";
    if (strength.score >= 65) return "bg-indigo-500 text-indigo-400 border-indigo-500/30";
    if (strength.score >= 40) return "bg-amber-500 text-amber-400 border-amber-500/30";
    return "bg-rose-500 text-rose-400 border-rose-500/30";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl relative overflow-hidden my-auto max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white">Password Generator</h3>
              <p className="text-xs text-zinc-400">Generate high-entropy cryptographic keys</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Generated Password Box */}
          <div className="bg-zinc-950/80 border border-zinc-800 rounded-2xl p-4 relative">
            <div className="flex items-center justify-between gap-3">
              <div className="font-mono text-base sm:text-lg text-indigo-300 font-semibold break-all select-all">
                {password}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={generate}
                  title="Regenerate"
                  className="p-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 hover:text-white transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => copyToClipboard(password, "Generated password copied!")}
                  title="Copy Password"
                  className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Strength & Entropy Indicator */}
            <div className="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className={`px-2.5 py-0.5 rounded-full border text-[11px] font-semibold bg-opacity-10 ${getScoreColor()}`}>
                  {strength.label} ({strength.entropyBits} bits entropy)
                </span>
              </div>
              <span className="text-zinc-500 font-mono">Score: {strength.score}/100</span>
            </div>
            <div className="w-full bg-zinc-800 h-1.5 rounded-full mt-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${getScoreColor().split(" ")[0]}`}
                style={{ width: `${Math.max(10, strength.score)}%` }}
              />
            </div>
          </div>

          {/* Generator Controls */}
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-zinc-950/40 p-1 rounded-xl border border-zinc-800/80">
              <button
                onClick={() => setPassphrase(false)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                  !passphrase ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Random Password
              </button>
              <button
                onClick={() => setPassphrase(true)}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
                  passphrase ? "bg-zinc-800 text-white shadow" : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Memorable Passphrase
              </button>
            </div>

            {!passphrase ? (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-zinc-300">
                    <span className="font-medium">Character Length</span>
                    <span className="font-mono text-indigo-400 font-semibold">{length}</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={64}
                    value={length}
                    onChange={(e) => setLength(Number(e.target.value))}
                    className="w-full accent-indigo-500 cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3 pt-2">
                  {[
                    { label: "Uppercase (A-Z)", state: uppercase, setState: setUppercase },
                    { label: "Lowercase (a-z)", state: lowercase, setState: setLowercase },
                    { label: "Numbers (0-9)", state: numbers, setState: setNumbers },
                    { label: "Symbols (!@#$)", state: symbols, setState: setSymbols },
                  ].map((opt, i) => (
                    <label
                      key={i}
                      className="flex items-center gap-2.5 p-3 rounded-xl bg-zinc-950/40 border border-zinc-800/60 cursor-pointer hover:border-zinc-700 transition"
                    >
                      <input
                        type="checkbox"
                        checked={opt.state}
                        onChange={(e) => opt.setState(e.target.checked)}
                        className="rounded bg-zinc-800 border-zinc-700 text-indigo-500 focus:ring-0 w-4 h-4 cursor-pointer"
                      />
                      <span className="text-xs font-medium text-zinc-300">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-zinc-300">
                  <span className="font-medium">Word Count</span>
                  <span className="font-mono text-indigo-400 font-semibold">{wordCount} words</span>
                </div>
                <input
                  type="range"
                  min={3}
                  max={10}
                  value={wordCount}
                  onChange={(e) => setWordCount(Number(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>

        {onSelectPassword && (
          <div className="p-4 sm:p-6 border-t border-zinc-800 flex justify-end gap-3 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                onSelectPassword(password);
                onClose();
              }}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-lg shadow-indigo-600/20"
            >
              Use This Password
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

