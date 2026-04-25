import { useState, useEffect } from "react";

type Mode = "dev" | "static" | "unknown";

export function ModeBadge() {
  const [mode, setMode] = useState<Mode>("unknown");

  useEffect(() => {
    fetch("/__mode")
      .then((r) => r.json())
      .then((d) => setMode(d?.mode === "static" ? "static" : "dev"))
      .catch(() => setMode(import.meta.env.DEV ? "dev" : "static"));
  }, []);

  const text =
    mode === "dev"
      ? "DEV MODE (HMR OFF on Replit) \u2014 refresh to see changes"
      : mode === "static"
      ? "STATIC BUILD MODE \u2014 rebuild required"
      : "MODE UNKNOWN";

  return null; // Hidden for production
  return (
    <div
      className="text-xs px-2 py-1 rounded border bg-background"
      data-testid="build-mode-badge"
    >
      {text}
    </div>
  );
}
