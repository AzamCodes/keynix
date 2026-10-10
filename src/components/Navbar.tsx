"use client";

import React, { useState } from "react";
import { useVault } from "@/context/VaultContext";
import {
  Search,
  Lock,
  LogOut,
  Plus,
  KeyRound,
  User,
  Menu,
  X,
} from "lucide-react";
import Link from "next/link";
import { PwaInstallPrompt } from "./PwaInstallPrompt";

interface Props {
  onOpenNewItem: () => void;
  onOpenSettings: () => void;
  onToggleMobileMenu?: () => void;
}

export const Navbar: React.FC<Props> = ({ onOpenNewItem, onOpenSettings, onToggleMobileMenu }) => {
  const { isAuthenticated, isLocked, lockVault, logout, searchQuery, setSearchQuery } =
    useVault();
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  return (
    <header className="h-16 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/80 sticky top-0 z-30 px-3 sm:px-4 md:px-6 flex items-center justify-between gap-2">
      {/* Brand & Zero-Knowledge Badge */}
      <div className="flex items-center gap-3 shrink-0">
        {isAuthenticated && !isLocked && onToggleMobileMenu && (
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white transition focus:outline-none"
            aria-label="Open Mobile Menu"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}

        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/25 group-hover:scale-105 transition shrink-0">
            <KeyRound className="w-5 h-5" />
          </div>
          <div className="flex items-center">
            <span className="text-lg font-black tracking-tight text-white font-mono">KEYNIX</span>
            <span className="hidden sm:inline-block ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 whitespace-nowrap">
              Zero-Knowledge v1
            </span>
          </div>
        </Link>
      </div>

      {/* Desktop Search Bar */}
      {isAuthenticated && !isLocked && (
        <div className="flex-1 max-w-md mx-2 md:mx-4 hidden sm:block">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search encrypted vault items..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-900/80 border border-zinc-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-white placeholder-zinc-500 text-xs outline-none transition"
            />
          </div>
        </div>
      )}

      {/* Mobile Search Overlay Input (Toggled on <sm screens) */}
      {isAuthenticated && !isLocked && showMobileSearch && (
        <div className="absolute inset-x-0 top-0 h-16 bg-zinc-950 px-4 flex items-center gap-2 z-40 sm:hidden border-b border-zinc-800">
          <Search className="w-4 h-4 text-zinc-500 shrink-0" />
          <input
            type="text"
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search vault..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-white placeholder-zinc-500 text-xs outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => setShowMobileSearch(false)}
            className="p-2 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Controls & User Status */}
      <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
        <PwaInstallPrompt />
        {isAuthenticated ? (
          <>
            {!isLocked && (
              <>
                {/* Mobile Search Toggle Button */}
                <button
                  onClick={() => setShowMobileSearch(true)}
                  className="sm:hidden p-2 rounded-xl bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition"
                  title="Search Vault"
                  aria-label="Search Vault"
                >
                  <Search className="w-4 h-4" />
                </button>

                <button
                  onClick={onOpenNewItem}
                  className="sm:hidden p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow transition"
                  title="New Item"
                  aria-label="New Item"
                >
                  <Plus className="w-4 h-4" />
                </button>

                <button
                  onClick={lockVault}
                  className="px-2.5 sm:px-3 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
                  title="Lock Vault Memory"
                >
                  <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="hidden sm:inline">Lock Vault</span>
                </button>
              </>
            )}

            <button
              onClick={onOpenSettings}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition"
              title="Vault Settings"
              aria-label="Vault Settings"
            >
              <User className="w-4 h-4" />
            </button>

            <button
              onClick={logout}
              className="p-2 rounded-xl bg-zinc-900 hover:bg-red-500/10 border border-zinc-800 text-zinc-400 hover:text-red-400 transition"
              title="Log Out"
              aria-label="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="px-3 sm:px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white transition"
            >
              Log In
            </Link>
            <Link
              href="/register"
              className="px-3 sm:px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition whitespace-nowrap"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

