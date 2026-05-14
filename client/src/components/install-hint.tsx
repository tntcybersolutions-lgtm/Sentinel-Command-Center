import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "sentinel-install-dismissed";
const FIRST_VISIT_KEY = "sentinel-first-visit-seen";

export function InstallHint() {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosPrompt, setIosPrompt] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(DISMISS_KEY) === "1") { setHidden(true); return; }

    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      // @ts-ignore — iOS Safari property
      window.navigator.standalone === true;
    if (isStandalone) { setHidden(true); return; }

    const onBip = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS Safari has no beforeinstallprompt. Per spec, only show the manual
    // "Add to Home Screen" hint when:
    //   1. We're not running standalone (already checked above)
    //   2. There is no controlling service worker yet (the very first visit
    //      hasn't installed sentinel-sw.js yet)
    //   3. The first-visit flag isn't set in localStorage (so we don't nag
    //      returning users who chose not to install)
    const ua = navigator.userAgent || "";
    const isIos = /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    // @ts-ignore — iOS Safari property
    const iosStandalone = window.navigator.standalone === true;
    const hasSw = !!navigator.serviceWorker?.controller;
    const firstVisitSeen = localStorage.getItem(FIRST_VISIT_KEY) === "1";
    if (isIos && !iosStandalone && !hasSw && !firstVisitSeen) {
      setIosPrompt(true);
    }
    try { localStorage.setItem(FIRST_VISIT_KEY, "1"); } catch { /* ignore */ }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (hidden) return null;
  if (!evt && !iosPrompt) return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
    setHidden(true);
  };

  const install = async () => {
    if (!evt) return;
    try { await evt.prompt(); } catch { /* ignore */ }
    try { await evt.userChoice; } catch { /* ignore */ }
    dismiss();
  };

  return (
    <div
      data-testid="install-hint"
      style={{
        position: "fixed",
        left: 16,
        right: 16,
        bottom: 90,
        zIndex: 55,
        background: "#14171C",
        border: "0.5px solid #2C2C2A",
        borderRadius: 16,
        padding: 14,
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
        color: "#E8EAEE",
      }}
    >
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>
        {iosPrompt
          ? "Install: tap Share → Add to Home Screen."
          : "Install Sentinel for one-tap mobile access."}
      </div>
      {evt && (
        <button
          data-testid="button-install-app"
          onClick={install}
          style={{
            background: "#1D9E75", color: "#fff", border: "none",
            borderRadius: 10, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
          }}
        >Install</button>
      )}
      <button
        data-testid="button-install-dismiss"
        onClick={dismiss}
        style={{
          background: "transparent", color: "#8B92A1", border: "none",
          cursor: "pointer", fontSize: 13, padding: "8px 8px",
        }}
      >Dismiss</button>
    </div>
  );
}

export default InstallHint;
