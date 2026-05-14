// PWA service worker registration. Imported by main.tsx in production builds only.
// Safe to no-op on browsers without SW support (older IE/Opera Mini etc).

export function registerPWA(): void {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env?.DEV) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        // Auto-update: check for new SW on each app load.
        reg.update?.().catch(() => null);
      })
      .catch((err) => {
        // Non-fatal; users still get the app, just no offline shell.
        console.warn("[pwa] service worker registration failed:", err?.message);
      });
  });
}

