import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import {
  CalendarCheck2,
  Map as MapIcon,
  ClipboardCheck,
  FileText,
  MoreHorizontal,
  Plus,
  Camera,
  Mic,
  MessageSquareText,
  X,
  type LucideIcon,
} from "lucide-react";
import { subscribe } from "@/lib/offline-queue";
import { OfflineBanner } from "@/components/offline-banner";
import { InstallHint } from "@/components/install-hint";
import { SyncSheet } from "@/components/sync-sheet";
import { SyncStatus } from "@/components/sync-status";
import { useProjectContext } from "@/nav/project-context";

interface NavItem {
  icon: LucideIcon;
  label: string;
  path: string;
  matches: (loc: string) => boolean;
  primary?: boolean;
}

interface QuickAction {
  icon: LucideIcon;
  label: string;
  hint: string;
  /** Optional click handler — used for "open camera" which needs a hidden file input. Falls back to navigation. */
  onClick?: () => void;
  path?: string;
  accent?: string;
}

export function MobileShell({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [location, setLocation] = useLocation();
  const [queued, setQueued] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const { selectedProjectId } = useProjectContext();

  // Sprint M1: field-team tab layout — Today / Drawings / Punch (primary) / Daily Log / More.
  // Sprint M3: floating Quick-Add FAB above the bar opens a sheet with Camera / Punch / RFI / Daily Log / Voice.
  const NAV: NavItem[] = useMemo(() => {
    const pid = selectedProjectId || "default";
    return [
      {
        icon: CalendarCheck2,
        label: "Today",
        path: "/m-home",
        matches: (loc) => loc === "/m-home" || loc === "/today" || loc === "/",
      },
      {
        icon: MapIcon,
        label: "Drawings",
        path: `/projects/${pid}/drawings`,
        matches: (loc) => /^\/projects\/[^/]+\/drawings/.test(loc) || loc === "/drawings",
      },
      {
        icon: ClipboardCheck,
        label: "Punch",
        path: "/punch-list",
        matches: (loc) => loc === "/punch-list" || loc === "/punch",
        primary: true,
      },
      {
        icon: FileText,
        label: "Daily Log",
        path: "/voice-daily-log",
        matches: (loc) => loc === "/daily-log" || loc.startsWith("/daily-log/") || loc === "/voice-daily-log",
      },
      {
        icon: MoreHorizontal,
        label: "More",
        path: "/profile",
        matches: (loc) => loc === "/profile" || loc === "/more",
      },
    ];
  }, [selectedProjectId]);

  // Quick-Add sheet (M3) — five actions a field super reaches for in seconds.
  const handleCameraPick = () => {
    // Click a hidden <input capture> so the browser opens the native camera.
    const input = document.getElementById("__sentinel-camera-input") as HTMLInputElement | null;
    if (input) input.click();
  };

  const QUICK_ACTIONS: QuickAction[] = useMemo(() => [
    { icon: Camera, label: "Photo", hint: "Capture and attach to today", onClick: handleCameraPick, accent: "#1D9E75" },
    { icon: ClipboardCheck, label: "Punch", hint: "New punch item", path: "/punch-list?new=1", accent: "#E11D48" },
    { icon: MessageSquareText, label: "RFI", hint: "New RFI draft", path: "/execution/rfis?new=1", accent: "#F59E0B" },
    { icon: FileText, label: "Daily Log", hint: "Open today's daily log", path: "/daily-log", accent: "#3B82F6" },
    { icon: Mic, label: "Voice", hint: "Hold-to-speak Herbie", path: "/voice-daily-log", accent: "#A855F7" },
  ], []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => subscribe(setQueued), []);

  // Close the quick sheet when route changes
  useEffect(() => {
    setQuickOpen(false);
  }, [location]);

  // Close on Escape
  useEffect(() => {
    if (!quickOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setQuickOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [quickOpen]);

  if (!isMobile) return <>{children}</>;

  return (
    <>
      <OfflineBanner />
      {/* Page content. Bottom padding clears the floating nav + safe-area inset. */}
      <div
        style={{
          paddingBottom: "calc(108px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {children}
      </div>
      <InstallHint />

      {/* Hidden camera input for Quick-Add → Photo */}
      <input
        id="__sentinel-camera-input"
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length === 0) return;
          // Stash for daily-log to pick up via window event; pages listen.
          const urls = files.map((f) => URL.createObjectURL(f));
          window.dispatchEvent(new CustomEvent("sentinel:quickPhotos", { detail: { urls, files } }));
          // Reset so the same file can be picked again
          e.currentTarget.value = "";
          setQuickOpen(false);
        }}
      />

      {/* Sprint TK3 — combined sync pill (outbound writes + pending photos + just-synced pulse). */}
      <SyncStatus onOpen={() => setSheetOpen(true)} />

      <SyncSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />

      {/* Quick-Add backdrop + sheet (Sprint M3) */}
      {quickOpen && (
        <div
          role="dialog"
          aria-label="Quick add"
          onClick={() => setQuickOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.55)",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
            animation: "sentinel-fade-in 140ms ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              left: 12,
              right: 12,
              bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
              background: "rgba(20, 23, 28, 0.96)",
              border: "0.5px solid rgba(255,255,255,0.08)",
              borderRadius: 18,
              padding: 14,
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
              animation: "sentinel-slide-up 180ms cubic-bezier(.22,1,.36,1)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EAEE", letterSpacing: 0.2 }}>Quick add</div>
              <button
                onClick={() => setQuickOpen(false)}
                aria-label="Close quick add"
                style={{ background: "transparent", border: "none", color: "#7E869A", cursor: "pointer", padding: 4 }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    data-testid={`quick-add-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
                    onClick={() => {
                      if (a.onClick) a.onClick();
                      else if (a.path) {
                        setLocation(a.path);
                        setQuickOpen(false);
                      }
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 12px",
                      background: "rgba(255,255,255,0.04)",
                      border: "0.5px solid rgba(255,255,255,0.07)",
                      borderRadius: 12,
                      cursor: "pointer",
                      textAlign: "left",
                      transition: "background 120ms ease, transform 120ms ease",
                    }}
                    onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.97)"; }}
                    onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                    onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        background: `${a.accent}22`,
                        border: `1px solid ${a.accent}55`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon size={18} color={a.accent} strokeWidth={2.4} />
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#E8EAEE", lineHeight: 1.1 }}>{a.label}</span>
                      <span style={{ fontSize: 11, color: "#7E869A", lineHeight: 1.1 }}>{a.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <style>{`
            @keyframes sentinel-fade-in { from { opacity: 0 } to { opacity: 1 } }
            @keyframes sentinel-slide-up { from { transform: translateY(24px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
          `}</style>
        </div>
      )}

      {/* Floating Quick-Add FAB (Sprint M3) — above the nav bar, right side */}
      <button
        data-testid="nav-mobile-quick-add"
        aria-label={quickOpen ? "Close quick add" : "Open quick add"}
        aria-expanded={quickOpen}
        onClick={() => setQuickOpen((v) => !v)}
        style={{
          position: "fixed",
          right: 18,
          bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
          zIndex: 52,
          width: 52,
          height: 52,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.12)",
          background: quickOpen
            ? "linear-gradient(180deg, #475569 0%, #334155 100%)"
            : "linear-gradient(180deg, #F59E0B 0%, #D97706 100%)",
          color: "#1A0E08",
          display: queued > 0 ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          boxShadow: quickOpen
            ? "0 10px 28px rgba(0,0,0,0.55)"
            : "0 10px 28px rgba(245,158,11,0.45), inset 0 1px 0 rgba(255,255,255,0.2)",
          transform: quickOpen ? "rotate(45deg)" : "rotate(0deg)",
          transition: "transform 160ms cubic-bezier(.4,1.6,.4,1), background 140ms ease",
        }}
      >
        <Plus size={26} strokeWidth={2.6} color={quickOpen ? "#E8EAEE" : "#1A0E08"} />
      </button>

      <nav
        data-testid="nav-mobile-shell"
        aria-label="Mobile primary navigation"
        style={{
          position: "fixed",
          left: 12,
          right: 12,
          bottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
          zIndex: 50,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          background: "rgba(20, 23, 28, 0.92)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          border: "0.5px solid rgba(255,255,255,0.06)",
          borderRadius: 999,
          padding: "8px 10px",
          boxShadow: "0 10px 32px rgba(0,0,0,0.55)",
        }}
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.matches(location);

          if (item.primary) {
            return (
              <button
                key={item.label}
                data-testid={`nav-mobile-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
                onClick={() => setLocation(item.path)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                style={{
                  width: 60,
                  height: 60,
                  marginTop: -22,
                  background: active
                    ? "linear-gradient(180deg, #25B385 0%, #1B8F69 100%)"
                    : "linear-gradient(180deg, #1D9E75 0%, #16805C 100%)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 999,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 1,
                  cursor: "pointer",
                  boxShadow: "0 8px 22px rgba(29,158,117,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
                  transition: "transform 120ms ease",
                }}
                onPointerDown={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(0.94)"; }}
                onPointerUp={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
                onPointerLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}
              >
                <Icon size={22} color="#FFFFFF" strokeWidth={2.4} />
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: 0.3,
                    color: "#FFFFFF",
                    textTransform: "uppercase",
                    lineHeight: 1,
                  }}
                >
                  {item.label}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.label}
              data-testid={`nav-mobile-${item.label.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => setLocation(item.path)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              style={{
                position: "relative",
                flex: 1,
                minWidth: 56,
                height: 50,
                background: "transparent",
                border: "none",
                color: active ? "#E8EAEE" : "#7E869A",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 3,
                cursor: "pointer",
                transition: "color 140ms ease",
              }}
            >
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 4,
                  width: 4,
                  height: 4,
                  borderRadius: 999,
                  background: active ? "#1D9E75" : "transparent",
                  boxShadow: active ? "0 0 8px rgba(29,158,117,0.7)" : "none",
                  transition: "background 140ms ease",
                }}
              />
              <Icon size={20} strokeWidth={active ? 2.4 : 1.8} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: 0.2,
                  lineHeight: 1,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

export default MobileShell;
