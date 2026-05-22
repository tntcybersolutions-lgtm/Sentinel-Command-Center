import { createRoot } from "react-dom/client";
import { registerPWA } from "./pwa-register";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";

console.log("[CLIENT_DEPLOY_MARKER] LIENWAIVERS_v2 " + new Date().toISOString());

// =====================================================================
// Stale-chunk auto-recovery. Vite emits hashed chunk filenames; after a
// redeploy the old hashes 404. Without this handler the user sees a
// blank screen and a console error like "Failed to fetch dynamically
// imported module". We catch that case and force a fresh page load so
// the new index.html (with new chunk hashes) is fetched.
// We guard against reload-loops with a one-shot sessionStorage flag.
// =====================================================================
function isChunkLoadError(err: any): boolean {
  if (!err) return false;
  const msg = String(err?.message || err?.reason?.message || err || "");
  return /Failed to fetch dynamically imported module|Loading chunk \d+ failed|ChunkLoadError|Importing a module script failed/i.test(msg);
}
function recoverFromChunkError(label: string) {
  const flag = "__sentinel_chunk_reload__";
  if (sessionStorage.getItem(flag)) {
    console.warn("[chunk-recover] already reloaded once; not looping. Source:", label);
    sessionStorage.removeItem(flag);
    return;
  }
  sessionStorage.setItem(flag, String(Date.now()));
  console.warn("[chunk-recover] stale bundle detected (" + label + "), reloading…");
  // Bust caches by adding a one-time query param
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()).slice(-6));
  window.location.replace(url.toString());
}
window.addEventListener("error", (ev) => {
  if (isChunkLoadError(ev.error || ev.message)) recoverFromChunkError("window.error");
});
window.addEventListener("unhandledrejection", (ev) => {
  if (isChunkLoadError(ev.reason)) recoverFromChunkError("unhandledrejection");
});
// Clear the one-shot flag once boot succeeds — so subsequent stale chunks
// during the same session can still trigger one more recovery.
setTimeout(() => { try { sessionStorage.removeItem("__sentinel_chunk_reload__"); } catch {} }, 5000);


// Boot diagnostics
declare global {
  interface Window {
    __BOOT_START: number;
    __BOOT_LOGS: string[];
    __BOOT_OK: boolean;
    bootLog: (msg: string) => void;
    bootError: (err: unknown) => void;
  }
}

const bootLog = window.bootLog || ((msg: string) => console.log('[BOOT]', msg));
const bootError = window.bootError || ((err: unknown) => console.error('[BOOT ERROR]', err));

bootLog('JS bundle loaded, initializing React...');

try {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error('Root element not found');
  }
  
  bootLog('Found root element, creating React root...');
  
  const root = createRoot(rootElement);
  
  bootLog('React root created, rendering App...');
  
  root.render(<App />);
  
  bootLog('React render called, waiting for mount...');
  
  // Mark boot as complete after a short delay
  setTimeout(() => {
    window.__BOOT_OK = true;
    bootLog('Boot complete - React mounted successfully');
    
    // Remove the boot loader after React is confirmed mounted
    const bootLoader = document.getElementById('boot-loader');
    if (bootLoader) {
      bootLoader.style.transition = 'opacity 0.3s ease-out';
      bootLoader.style.opacity = '0';
      setTimeout(() => bootLoader.remove(), 300);
    }
  }, 100);
  
} catch (err) {
  bootError(err);
  // Keep boot loader visible with error
  const bootStatus = document.getElementById('boot-status');
  if (bootStatus) {
    bootStatus.textContent = 'BOOT FAILED - See errors below';
    bootStatus.style.color = '#ef4444';
  }
}

registerPWA();
