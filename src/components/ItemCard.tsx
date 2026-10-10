"use client";

import React, { useState } from "react";
import { DecryptedVaultItem, useVault } from "@/context/VaultContext";
import {
  KeyRound,
  FileText,
  CreditCard,
  Key,
  Star,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  MoreVertical,
  ShieldCheck,
  Globe,
  User,
} from "lucide-react";
import { evaluatePasswordStrength } from "@/lib/crypto";

interface Props {
  item: DecryptedVaultItem;
  onEdit: () => void;
}

export const ItemCard: React.FC<Props> = ({ item, onEdit }) => {
  const { toggleFavorite, copyToClipboard } = useVault();
  const [showPassword, setShowPassword] = useState(false);

  const getCategoryIcon = () => {
    switch (item.category) {
      case "note":
        return <FileText className="w-5 h-5 text-emerald-400" />;
      case "card":
        return <CreditCard className="w-5 h-5 text-amber-400" />;
      case "apikey":
        return <Key className="w-5 h-5 text-violet-400" />;
      default:
        return <KeyRound className="w-5 h-5 text-indigo-400" />;
    }
  };

  const strength = item.password ? evaluatePasswordStrength(item.password) : null;

  return (
    <div className="group bg-zinc-900/60 hover:bg-zinc-900 border border-zinc-800/80 hover:border-zinc-700/80 rounded-2xl p-4 transition-all duration-200 shadow-lg relative flex flex-col justify-between">
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0">
              {getCategoryIcon()}
            </div>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-white truncate cursor-pointer" onClick={onEdit}>
                {item.title}
              </h4>
              <p className="text-xs text-zinc-400 truncate">
                {item.username || item.cardName || item.url || item.category}
              </p>
            </div>
          </div>

          <button
            onClick={() => toggleFavorite(item.id)}
            className={`p-1.5 rounded-lg border transition ${
              item.isFavorite
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-zinc-950/40 text-zinc-600 border-zinc-800/80 hover:text-amber-400"
            }`}
          >
            <Star className={`w-4 h-4 ${item.isFavorite ? "fill-amber-400" : ""}`} />
          </button>
        </div>

        {/* Content details depending on category */}
        {item.category === "password" && item.password && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs font-mono">
              <span className="text-zinc-400 truncate">
                {showPassword ? item.password : "••••••••••••••••"}
              </span>
              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  onClick={() => setShowPassword(!showPassword)}
                  className="p-1 text-zinc-500 hover:text-zinc-300"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => copyToClipboard(item.password!, "Password copied!")}
                  className="p-1 text-zinc-500 hover:text-indigo-400"
                  title="Copy password"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {item.category === "card" && item.cardNumber && (
          <div className="mt-2 flex items-center justify-between bg-zinc-950/60 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs font-mono">
            <span className="text-zinc-400">•••• •••• •••• {item.cardNumber.slice(-4)}</span>
            <button
              onClick={() => copyToClipboard(item.cardNumber!, "Card number copied!")}
              className="p-1 text-zinc-500 hover:text-amber-400"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {item.category === "apikey" && item.apiKey && (
          <div className="mt-2 flex items-center justify-between bg-zinc-950/60 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs font-mono">
            <span className="text-zinc-400 truncate">sk-live-••••••••</span>
            <button
              onClick={() => copyToClipboard(item.apiKey!, "API key copied!")}
              className="p-1 text-zinc-500 hover:text-violet-400"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {item.category === "note" && item.notes && (
          <p className="mt-2 text-xs text-zinc-400 line-clamp-2 bg-zinc-950/40 p-2 rounded-xl border border-zinc-800/40">
            {item.notes}
          </p>
        )}
      </div>

      {/* Card Footer */}
      <div className="mt-4 pt-3 border-t border-zinc-800/60 flex items-center justify-between text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          {strength && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                strength.score >= 65
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-amber-500/10 text-amber-400 border-amber-500/20"
              }`}
            >
              {strength.label}
            </span>
          )}
          {item.url && (
            <a
              href={item.url.startsWith("http") ? item.url : `https://${item.url}`}
              target="_blank"
              rel="noreferrer"
              className="hover:text-indigo-400 transition"
            >
              <Globe className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        <button
          onClick={onEdit}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
        >
          View / Edit
        </button>
      </div>
    </div>
  );
};
