// client/src/lib/theme.ts
// Sprint 6: light/dark theme runtime — auto-detects system preference, allows manual override.
// Writes the active theme as `data-theme="light"` or `data-theme="dark"` on <html>.
// CSS vars resolve in client/index.html or a global stylesheet:
//   :root[data-theme="dark"]  { --bg-1: #0B0D11; --bg-2: #14171C; --text-1: #E8EAEE; ... }
//   :root[data-theme="light"] { --bg-1: #F7F8FA; --bg-2: #FFFFFF; --text-1: #14171C; ... }

export type Theme = "light" | "dark" | "auto";

const STORAGE_KEY = "sentinel-theme";

function systemPref(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function applyTheme(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}

export function resolveTheme(saved: Theme): "light" | "dark" {
  if (saved === "auto") return systemPref();
  return saved;
}

export function getSavedTheme(): Theme {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "auto") return v;
  return "auto";
}

export function setTheme(theme: Theme): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(resolveTheme(theme));
  // Broadcast so any open windows re-read
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sentinel-theme-change", { detail: theme }));
  }
}

/** Call once at app boot (in main.tsx before render). */
export function initTheme(): void {
  const saved = getSavedTheme();
  applyTheme(resolveTheme(saved));
  // React to OS-level preference change when in auto mode
  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => {
      if (getSavedTheme() === "auto") applyTheme(systemPref());
    };
    if (mq.addEventListener) mq.addEventListener("change", listener);
    else mq.addListener(listener);
  }
}
