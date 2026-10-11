"use client";

import React, { useEffect, useState } from "react";
import { useVault, DecryptedVaultItem } from "@/context/VaultContext";
import { Navbar } from "@/components/Navbar";
import { Sidebar } from "@/components/Sidebar";
import { ItemCard } from "@/components/ItemCard";
import { ItemModal } from "@/components/ItemModal";
import { PasswordGeneratorModal } from "@/components/PasswordGeneratorModal";
import { SecurityHealthView } from "@/components/SecurityHealthView";
import { LockScreen } from "@/components/LockScreen";
import { SettingsModal } from "@/components/SettingsModal";
import { Toast } from "@/components/Toast";
import { BottomNav } from "@/components/BottomNav";
import {
  Plus,
  KeyRound,
  FileText,
  CreditCard,
  Key,
  Star,
  ShieldCheck,
  Lock,
  Layers,
} from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const {
    isAuthenticated,
    isLocked,
    isLoading,
    items,
    selectedCategory,
    setSelectedCategory,
    searchQuery,
    activeToast,
    addItem,
  } = useVault();

  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DecryptedVaultItem | null>(null);
  const [modalDefaultCategory, setModalDefaultCategory] = useState("password");

  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const clearSensitiveUi = () => {
      setSelectedItem(null);
      setIsItemModalOpen(false);
      setIsGeneratorOpen(false);
      setIsSettingsOpen(false);
      setIsMobileMenuOpen(false);
    };
    window.addEventListener("keynix:lock", clearSensitiveUi);
    return () => window.removeEventListener("keynix:lock", clearSensitiveUi);
  }, []);

  const handleOpenNewItem = (category = "password") => {
    setSelectedItem(null);
    setModalDefaultCategory(category);
    setIsItemModalOpen(true);
  };

  const handleEditItem = (item: DecryptedVaultItem) => {
    setSelectedItem(item);
    setIsItemModalOpen(true);
  };

  // Filter items based on category and search query
  const filteredItems = items.filter((item) => {
    // Category match
    if (selectedCategory === "favorites" && !item.isFavorite) return false;
    if (
      selectedCategory !== "all" &&
      selectedCategory !== "favorites" &&
      selectedCategory !== "health" &&
      item.category !== selectedCategory
    ) {
      return false;
    }

    // Search query match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = item.title?.toLowerCase().includes(q);
      const matchUsername = item.username?.toLowerCase().includes(q);
      const matchUrl = item.url?.toLowerCase().includes(q);
      const matchNotes = item.notes?.toLowerCase().includes(q);
      const matchCard = item.cardName?.toLowerCase().includes(q);
      return matchTitle || matchUsername || matchUrl || matchNotes || matchCard;
    }

    return true;
  });

  // Categories list for mobile tab bar
  const mobileCategories = [
    { id: "all", label: "All", icon: Layers },
    { id: "password", label: "Passwords", icon: KeyRound },
    { id: "note", label: "Notes", icon: FileText },
    { id: "card", label: "Cards", icon: CreditCard },
    { id: "apikey", label: "API Keys", icon: Key },
    { id: "favorites", label: "Favorites", icon: Star },
    { id: "health", label: "Health", icon: ShieldCheck },
  ];

  // Sample quick setup if vault is empty
  const handleAddSampleData = async () => {
    await addItem({
      category: "password",
      title: "GitHub Account",
      username: "developer@keynix.io",
      password: "K3yn!x-Vault-Secure2026#$",
      url: "https://github.com",
      notes: "2FA Backup Code: 8931-4812-9012",
      isFavorite: true,
    });
    await addItem({
      category: "card",
      title: "Corporate Platinum Card",
      cardName: "Alex Vance",
      cardNumber: "4532891278349012",
      cardExp: "09/28",
      cardCvc: "912",
      notes: "Company expense limit $10,000",
    });
    await addItem({
      category: "apikey",
      title: "OpenAI API Production Key",
      apiKey: "sk-proj-91283918239128391283912",
      notes: "Production deployment token",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center animate-pulse">
            <KeyRound className="w-6 h-6" />
          </div>
          <p className="text-xs text-zinc-400 font-mono animate-pulse">
            Decrypting Zero-Knowledge Memory...
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-md bg-zinc-900 border border-zinc-800 p-8 rounded-3xl space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold">Authentication Required</h2>
          <p className="text-xs text-zinc-400">
            Please log in or register an account to access your encrypted vault.
          </p>
          <div className="flex gap-3">
            <Link
              href="/login"
              className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-semibold"
            >
              Log In
            </Link>
            <Link
              href="/register"
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow"
            >
              Register
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onOpenNewItem={() => handleOpenNewItem("password")}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />

      {/* Main Container */}
      <div className="flex flex-1 relative">
        {/* Left Sidebar / Mobile Drawer */}
        <Sidebar
          onOpenNewItem={(cat) => handleOpenNewItem(cat || "password")}
          onOpenGenerator={() => setIsGeneratorOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Content Area */}
        <main className="flex-1 p-3 sm:p-5 md:p-8 pb-24 md:pb-8 max-w-6xl mx-auto overflow-y-auto w-full">
          {/* Mobile Horizontal Category Bar */}
          <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-zinc-800/60 no-scrollbar">
            {mobileCategories.map((cat) => {
              const Icon = cat.icon;
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    active
                      ? "bg-indigo-600/20 text-indigo-300 border border-indigo-500/40"
                      : "bg-zinc-900 text-zinc-400 border border-zinc-800"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Top category title & quick mobile actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-zinc-800/80">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white capitalize flex items-center gap-2">
                <span>{selectedCategory === "all" ? "All Vault Items" : selectedCategory}</span>
                <span className="text-xs font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20 font-bold">
                  {filteredItems.length}
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-1">
                AES-256-GCM encrypted in-memory vault
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => handleOpenNewItem("password")}
                className="w-full sm:w-auto justify-center px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/20 transition flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>
          </div>

          {/* View rendering */}
          {selectedCategory === "health" ? (
            <SecurityHealthView onEditItem={handleEditItem} />
          ) : (
            <>
              {filteredItems.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredItems.map((item) => (
                    <ItemCard key={item.id} item={item} onEdit={() => handleEditItem(item)} />
                  ))}
                </div>
              ) : (
                <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-8 sm:p-12 text-center space-y-4 my-4 sm:my-8">
                  <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    <Layers className="w-7 h-7 sm:w-8 sm:h-8" />
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">No Vault Items Found</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                    {searchQuery
                      ? `No items matching "${searchQuery}" in your vault.`
                      : "Your zero-knowledge vault is currently empty."}
                  </p>

                  {!searchQuery && (
                    <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
                      <button
                        onClick={() => handleOpenNewItem("password")}
                        className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition"
                      >
                        Create Your First Item
                      </button>
                      <button
                        onClick={handleAddSampleData}
                        className="px-5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold transition"
                      >
                        Generate Demo Items
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <BottomNav
        onOpenNewItem={() => handleOpenNewItem("password")}
        onOpenGenerator={() => setIsGeneratorOpen(true)}
      />

      {/* Lock Screen Overlay when memory locked */}
      {isLocked && <LockScreen />}

      {/* Item Modal */}
      {!isLocked && <ItemModal
        isOpen={isItemModalOpen}
        item={selectedItem}
        defaultCategory={modalDefaultCategory}
        onClose={() => setIsItemModalOpen(false)}
      />}

      {/* Password Generator Modal */}
      {!isLocked && <PasswordGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
      />}

      {/* Settings Modal */}
      {!isLocked && <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />}

      {/* Toast Alert */}
      <Toast message={activeToast} />
    </div>
  );
}

