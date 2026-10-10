"use client";

import React from "react";
import { CheckCircle2, ShieldCheck } from "lucide-react";

interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-zinc-900/90 text-zinc-100 border border-indigo-500/30 backdrop-blur-xl px-4 py-3 rounded-xl shadow-2xl shadow-indigo-500/10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
        <ShieldCheck className="w-4 h-4" />
      </div>
      <span className="text-sm font-medium pr-1">{message}</span>
    </div>
  );
};
