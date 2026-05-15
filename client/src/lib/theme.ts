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
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sentinel-theme-change", { detail: theme }));
  }
}
export function initTheme(): void {
  const saved = getSavedTheme();
  applyTheme(resolveTheme(saved));
  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => { if (getSavedTheme() === "auto") applyTheme(systemPref()); };
    if (mq.addEventListener) mq.addEventListener("change", listener);
    else mq.addListener(listener);
  }
}
