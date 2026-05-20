import { createRoot } from "react-dom/client";
import { registerPWA } from "./pwa-register";
import App from "./App";
import "./index.css";
import { initTheme } from "./lib/theme";

console.log("[CLIENT_DEPLOY_MARKER] LIENWAIVERS_v2 " + new Date().toISOString());

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
