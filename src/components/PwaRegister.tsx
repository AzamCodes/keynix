"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("[Keynix PWA] Service Worker registered successfully:", reg.scope);
          })
          .catch((err) => {
            console.warn("[Keynix PWA] Service Worker registration failed:", err);
          });
      });
    }
  }, []);

  return null;
}
