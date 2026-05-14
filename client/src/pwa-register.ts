// PWA service worker registration. Imported by main.tsx in production builds only.
import { flush } from "./lib/offline-queue";

export function registerPWA(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env?.DEV) return;

  try {
    window.addEventListener("online", () => {
      flush().catch(() => null);
    });
    navigator.serviceWorker.addEventListener("message", (e) => {
      const data = e.data as { type?: string } | null;
      if (data?.type === "flush-outbound") {
        flush().catch(() => null);
      }
    });
  } catch (err) {
    console.warn("[pwa] event listener setup failed:", (err as Error)?.message);
  }

  window.addEventListener("load", () => {
    try {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          reg.update?.().catch(() => null);
          if (navigator.onLine) {
            flush().catch(() => null);
          }
        })
        .catch((err) => {
          console.warn("[pwa] service worker registration failed:", err?.message);
        });
    } catch (err) {
      console.warn("[pwa] registration threw:", (err as Error)?.message);
    }
  });
}

export function requestFlush(): void {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const ctrl = navigator.serviceWorker.controller;
    if (!ctrl) return;
    ctrl.postMessage({ type: "request-flush" });
  } catch { /* ignore */ }
}
