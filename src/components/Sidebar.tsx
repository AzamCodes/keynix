"use client";

import React from "react";
import { useVault } from "@/context/VaultContext";
import {
  KeyRound,
  FileText,
  CreditCard,
  Key,
  Star,
  ShieldCheck,
  Sparkles,
  Settings,
  Plus,
  Layers,
  X,
} from "lucide-react";

interface Props {
  onOpenNewItem: (category?: string) => void;
  onOpenGenerator: () => void;
  onOpenSettings: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<Props> = ({
  onOpenNewItem,
  onOpenGenerator,
  onOpenSettings,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const { items, selectedCategory, setSelectedCategory, securityStats } = useVault();

  const getCount = (cat: string) => {
    if (cat === "all") return items.length;
    if (cat === "favorites") return items.filter((i) => i.isFavorite).length;
    if (cat === "health") return securityStats.weakCount + securityStats.reusedCount;
    return items.filter((i) => i.category === cat).length;
  };

  const categories = [
    { id: "all", label: "All Items", icon: Layers },
    { id: "password", label: "Passwords", icon: KeyRound },
    { id: "note", label: "Secure Notes", icon: FileText },
    { id: "card", label: "Payment Cards", icon: CreditCard },
    { id: "apikey", label: "API Keys", icon: Key },
    { id: "favorites", label: "Favorites", icon: Star },
    { id: "health", label: "Security Health", icon: ShieldCheck },
  ];

  const handleSelectCategory = (catId: string) => {
    setSelectedCategory(catId);
    if (onCloseMobile) onCloseMobile();
  };

  const renderContent = () => (
    <div className="flex flex-col justify-between h-full p-4">
      <div className="space-y-6">
        {/* Quick Add Button */}
        <button
          onClick={() => {
            onOpenNewItem();
            if (onCloseMobile) onCloseMobile();
          }}
          className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-semibold rounded-2xl shadow-lg shadow-indigo-600/20 text-xs transition flex items-center justify-center gap-2 group"
        >
          <Plus className="w-4 h-4 transition-transform group-hover:rotate-90" />
          <span>New Vault Item</span>
        </button>

        {/* Navigation Categories */}
        <div className="space-y-1">
          <div className="px-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
            Categories
          </div>
          {categories.map((cat) => {
            const Icon = cat.icon;
            const active = selectedCategory === cat.id;
            const count = getCount(cat.id);
            const isHealthAlert = cat.id === "health" && count > 0;

            return (
              <button
                key={cat.id}
                onClick={() => handleSelectCategory(cat.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition ${
                  active
                    ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/30 shadow-sm"
                    : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${active ? "text-indigo-400" : "text-zinc-500"}`} />
                  <span>{cat.label}</span>
                </div>
                {count > 0 && (
                  <span
                    className={`px-2 py-0.5 rounded-full font-mono text-[10px] ${
                      isHealthAlert
                        ? "bg-amber-500/20 text-amber-400 font-bold animate-pulse"
                        : active
                        ? "bg-indigo-500/20 text-indigo-300"
                        : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Tools */}
      <div className="space-y-1 pt-4 border-t border-zinc-800/80">
        <button
          onClick={() => {
            onOpenGenerator();
            if (onCloseMobile) onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:bg-zinc-900 hover:text-indigo-400 transition"
        >
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Password Generator</span>
        </button>
        <button
          onClick={() => {
            onOpenSettings();
            if (onCloseMobile) onCloseMobile();
          }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition"
        >
          <Settings className="w-4 h-4 text-zinc-500" />
          <span>Vault Settings</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="w-64 bg-zinc-950/80 border-r border-zinc-800/80 shrink-0 h-[calc(100vh-4rem)] sticky top-16 hidden md:flex flex-col">
        {renderContent()}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />

          {/* Drawer Panel */}
          <div className="relative w-72 max-w-[80vw] bg-zinc-950 border-r border-zinc-800 h-full flex flex-col z-10 shadow-2xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-mono font-bold text-xs">
                  K
                </div>
                <span className="font-mono font-bold text-sm text-white">KEYNIX Vault</span>
              </div>
              <button
                onClick={onCloseMobile}
                className="p-2 rounded-xl bg-zinc-900 text-zinc-400 hover:text-white"
                aria-label="Close Mobile Menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{renderContent()}</div>
          </div>
        </div>
      )}
    </>
  );
};

