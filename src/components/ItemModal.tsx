"use client";

import React, { useState } from "react";
import { useVault, DecryptedVaultItem } from "@/context/VaultContext";
import {
  X,
  Eye,
  EyeOff,
  Copy,
  Sparkles,
  KeyRound,
  FileText,
  CreditCard,
  Key,
  Globe,
  User,
  ShieldCheck,
  Star,
  Trash2,
  Loader2,
} from "lucide-react";
import { evaluatePasswordStrength } from "@/lib/crypto";
import { PasswordGeneratorModal } from "./PasswordGeneratorModal";

interface Props {
  isOpen: boolean;
  item: DecryptedVaultItem | null;
  onClose: () => void;
  defaultCategory?: string;
}

export const ItemModal: React.FC<Props> = ({ isOpen, item, onClose, defaultCategory = "password" }) => {
  const { addItem, updateItem, deleteItem, copyToClipboard } = useVault();

  const [category, setCategory] = useState<"password" | "note" | "card" | "apikey" | "passkey">("password");
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExp, setCardExp] = useState("");
  const [cardCvc, setCardCvc] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isFavorite, setIsFavorite] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [showApi, setShowApi] = useState(false);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [prevItem, setPrevItem] = useState<DecryptedVaultItem | null>(null);
  const [prevIsOpen, setPrevIsOpen] = useState(false);

  if (item !== prevItem || isOpen !== prevIsOpen) {
    setPrevItem(item);
    setPrevIsOpen(isOpen);
    if (item) {
      setCategory(item.category || "password");
      setTitle(item.title || "");
      setUsername(item.username || "");
      setPassword(item.password || "");
      setUrl(item.url || "");
      setNotes(item.notes || "");
      setCardName(item.cardName || "");
      setCardNumber(item.cardNumber || "");
      setCardExp(item.cardExp || "");
      setCardCvc(item.cardCvc || "");
      setApiKey(item.apiKey || "");
      setIsFavorite(item.isFavorite || false);
    } else {
      setCategory((defaultCategory as "password" | "note" | "card" | "apikey" | "passkey") || "password");
      setTitle("");
      setUsername("");
      setPassword("");
      setUrl("");
      setNotes("");
      setCardName("");
      setCardNumber("");
      setCardExp("");
      setCardCvc("");
      setApiKey("");
      setIsFavorite(false);
    }
  }

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setIsSaving(true);
    const payload = {
      category,
      title: title.trim(),
      username: username.trim(),
      password,
      url: url.trim(),
      notes,
      cardName,
      cardNumber,
      cardExp,
      cardCvc,
      apiKey,
      isFavorite,
    };

    if (item) {
      await updateItem(item.id, payload);
    } else {
      await addItem(payload);
    }

    setIsSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    if (!item) return;
    if (confirm(`Are you sure you want to delete "${item.title}"?`)) {
      await deleteItem(item.id);
      onClose();
    }
  };

  const strength = password ? evaluatePasswordStrength(password) : null;

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 overflow-y-auto">
        <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl relative my-auto max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 sm:p-6 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsFavorite(!isFavorite)}
                className={`p-2 rounded-xl border transition ${
                  isFavorite
                    ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    : "bg-zinc-800/50 text-zinc-500 border-zinc-800 hover:text-amber-400"
                }`}
              >
                <Star className={`w-5 h-5 ${isFavorite ? "fill-amber-400" : ""}`} />
              </button>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-white">
                  {item ? "Edit Vault Item" : "Create New Item"}
                </h3>
                <p className="text-xs text-zinc-400">Zero-knowledge end-to-end encrypted</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {item && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="p-2 sm:p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition"
                  title="Delete item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-2 sm:p-2.5 rounded-xl bg-zinc-800/60 text-zinc-400 hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {/* Category Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: "password", label: "Password", icon: KeyRound },
                  { id: "note", label: "Secure Note", icon: FileText },
                  { id: "card", label: "Payment Card", icon: CreditCard },
                  { id: "apikey", label: "API Key", icon: Key },
                ].map((cat) => {
                  const Icon = cat.icon;
                  const active = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id as "password" | "note" | "card" | "apikey" | "passkey")}
                      className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border text-xs font-semibold gap-1.5 transition ${
                        active
                          ? "bg-indigo-600/15 text-indigo-400 border-indigo-500/40 shadow-lg shadow-indigo-500/10"
                          : "bg-zinc-950/40 text-zinc-400 border-zinc-800/80 hover:bg-zinc-800/50 hover:text-zinc-200"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Title */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Title *
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. GitHub Production / Master Card"
                  className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                />
              </div>

              {/* Category Fields: Passwords */}
              {category === "password" && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Username / Email
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full pl-9 pr-10 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                      />
                      {username && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(username, "Username copied!")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-white"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsGeneratorOpen(true)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 font-medium"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate</span>
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••••••"
                        className="w-full pl-4 pr-20 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm font-mono focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                      />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="p-1.5 text-zinc-400 hover:text-white"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        {password && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(password, "Password copied!")}
                            className="p-1.5 text-zinc-400 hover:text-white"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {strength && password && (
                      <div className="flex items-center justify-between text-xs pt-1 px-1">
                        <span className="text-zinc-500">Strength: <strong className="text-zinc-300">{strength.label}</strong></span>
                        <span className="text-zinc-500">{strength.entropyBits} bits entropy</span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Website URL
                    </label>
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="url"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="https://github.com"
                        className="w-full pl-9 pr-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Category Fields: Payment Cards */}
              {category === "card" && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Cardholder Name
                    </label>
                    <input
                      type="text"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value)}
                      placeholder="Satoshi Nakamoto"
                      className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm focus:border-indigo-500 outline-none transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      Card Number
                    </label>
                    <div className="relative">
                      <input
                        type={showCard ? "text" : "password"}
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        placeholder="4532 •••• •••• 8912"
                        className="w-full pl-4 pr-20 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm font-mono focus:border-indigo-500 outline-none transition"
                      />
                      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowCard(!showCard)}
                          className="p-1.5 text-zinc-400 hover:text-white"
                        >
                          {showCard ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        {cardNumber && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(cardNumber, "Card number copied!")}
                            className="p-1.5 text-zinc-400 hover:text-white"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        Expiration (MM/YY)
                      </label>
                      <input
                        type="text"
                        value={cardExp}
                        onChange={(e) => setCardExp(e.target.value)}
                        placeholder="12/28"
                        className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm font-mono focus:border-indigo-500 outline-none transition"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                        CVC / CVV
                      </label>
                      <input
                        type="password"
                        maxLength={4}
                        value={cardCvc}
                        onChange={(e) => setCardCvc(e.target.value)}
                        placeholder="888"
                        className="w-full px-4 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm font-mono focus:border-indigo-500 outline-none transition"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Category Fields: API Keys */}
              {category === "apikey" && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    API Key / Secret Token
                  </label>
                  <div className="relative">
                    <input
                      type={showApi ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-live-••••••••••••••••••••"
                      className="w-full pl-4 pr-20 py-2.5 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm font-mono focus:border-indigo-500 outline-none transition"
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setShowApi(!showApi)}
                        className="p-1.5 text-zinc-400 hover:text-white"
                      >
                        {showApi ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {apiKey && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(apiKey, "API Key copied!")}
                          className="p-1.5 text-zinc-400 hover:text-white"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Encrypted Notes & Details
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add recovery codes, instructions, or private memo..."
                  className="w-full p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl text-white text-sm focus:border-indigo-500 outline-none transition resize-none"
                />
              </div>
            </div>

            {/* Submit buttons */}
            <div className="p-4 sm:p-6 border-t border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 self-start sm:self-auto">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Encrypted client-side</span>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !title.trim()}
                  className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-lg shadow-indigo-600/20 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Encrypting...</span>
                    </>
                  ) : (
                    <span>Save to Vault</span>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <PasswordGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        onSelectPassword={(newPwd) => setPassword(newPwd)}
      />
    </>
  );
};

