"use client";

import React from "react";
import { useVault } from "@/context/VaultContext";
import { Layers, Star, Plus, Sparkles, ShieldCheck } from "lucide-react";

interface Props {
  onOpenNewItem: () => void;
  onOpenGenerator: () => void;
}

export const BottomNav: React.FC<Props> = ({ onOpenNewItem, onOpenGenerator }) => {
  const { selectedCategory, setSelectedCategory, securityStats } = useVault();

  const healthAlertCount = securityStats.weakCount + securityStats.reusedCount;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-zinc-950/90 backdrop-blur-xl border-t border-zinc-800/80 px-4 py-2 md:hidden">
      <div className="flex items-center justify-around max-w-md mx-auto">
        {/* All Items */}
        <button
          onClick={() => setSelectedCategory("all")}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition ${
            selectedCategory === "all"
              ? "text-indigo-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          aria-label="All Vault Items"
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Vault</span>
        </button>

        {/* Favorites */}
        <button
          onClick={() => setSelectedCategory("favorites")}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl transition ${
            selectedCategory === "favorites"
              ? "text-amber-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          aria-label="Favorite Items"
        >
          <Star className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Favorites</span>
        </button>

        {/* Floating Quick Add Button */}
        <button
          onClick={onOpenNewItem}
          className="-mt-5 w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 active:scale-95 transition"
          aria-label="Add New Vault Item"
        >
          <Plus className="w-6 h-6" />
        </button>

        {/* Generator */}
        <button
          onClick={onOpenGenerator}
          className="flex flex-col items-center gap-1 p-2 rounded-xl text-zinc-500 hover:text-indigo-400 transition"
          aria-label="Password Generator"
        >
          <Sparkles className="w-5 h-5 text-indigo-400" />
          <span className="text-[10px] font-semibold">Generator</span>
        </button>

        {/* Health */}
        <button
          onClick={() => setSelectedCategory("health")}
          className={`flex flex-col items-center gap-1 p-2 rounded-xl relative transition ${
            selectedCategory === "health"
              ? "text-indigo-400"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
          aria-label="Security Health"
        >
          <ShieldCheck className="w-5 h-5" />
          {healthAlertCount > 0 && (
            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          )}
          <span className="text-[10px] font-semibold">Health</span>
        </button>
      </div>
    </nav>
  );
};
