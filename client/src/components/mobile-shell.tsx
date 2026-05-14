import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Home, Camera, Mic, Map, User } from "lucide-react";
import { subscribe } from "@/lib/offline-queue";
import { OfflineBanner } from "@/components/offline-banner";
import { InstallHint } from "@/components/install-hint";
import { SyncSheet } from "@/components/sync-sheet";
import { useProjectContext } from "@/nav/project-context";

interface NavItem {
  icon: typeof Home;
  label: string;
  path: string;
  primary?: boolean;
}

export function MobileShell({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [location, setLocation] = useLocation();
  const [queued, setQueued] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const { selectedProjectId } = useProjectContext();

  // Project-aware nav: route Photos/Drawings to the active project from
  // the project context (persisted in localStorage by the profile switcher).
  // Falls back to "default" so the nav remains usable in portfolio mode.
  const NAV: NavItem[] = useMemo(() => {
    const pid = selectedProjectId || "default";
    return [
      { icon: Home, label: "Home", path: "/m-home" },
      { icon: Camera, label: "Photos", path: `/projects/${pid}/m-photos` },
      { icon: Mic, label: "Voice", path: "/voice-daily-log", primary: true },
      { icon: Map, label: "Drawings", path: `/projects/${pid}/drawings` },
      { icon: User, label: "Profile", path: "/profile" },
    ];
  }, [selectedProjectId]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => subscribe(setQueued), []);

  if (!isMobile) return <>{children}</>;

  return (
    <>
      <OfflineBanner />
      <div style={{ paddingBottom: 96 }}>{children}</div>
      <InstallHint />
      {queued > 0 && (
        <button
          data-testid="nav-mobile-queued"
          onClick={() => setSheetOpen(true)}
          style={{
            position: "fixed",
            right: 16,
            bottom: 78,
            zIndex: 51,
            background: "#F0997B",
            color: "#1A0E08",
            border: "none",
            borderRadius: 999,
            padding: "6px 12px",
            fontSize: 12,
            fontWeight: 700,
            boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
            cursor: "pointer",
          }}
        >{queued} queued</button>
      )}
      <SyncSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
      <nav
        data-testid="nav-mobile-shell"
        style={{
          position: "fixed",
          left: 16,
          right: 16,
          bottom: 18,
          zIndex: 50,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "#14171C",
          border: "0.5px solid #2C2C2A",
          borderRadius: 999,
          padding: 6,
          boxShadow: "0 6px 24px rgba(0,0,0,0.45)",
        }}
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = location === item.path;
          if (item.primary) {
            return (
              <button
                key={item.label}
                data-testid={`nav-mobile-${item.label.toLowerCase()}`}
                onClick={() => setLocation(item.path)}
                style={{
                  width: 56,
                  height: 44,
                  background: "#1D9E75",
                  border: "none",
                  borderRadius: 999,
                  padding: "10px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                aria-label={item.label}
              >
                <Icon size={20} color="#FFFFFF" strokeWidth={2.25} />
              </button>
            );
          }
          return (
            <button
              key={item.label}
              data-testid={`nav-mobile-${item.label.toLowerCase()}`}
              onClick={() => setLocation(item.path)}
              style={{
                width: 44,
                height: 44,
                background: "transparent",
                border: "none",
                color: active ? "#E8EAEE" : "#8B92A1",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
              aria-label={item.label}
            >
              <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
            </button>
          );
        })}
      </nav>
    </>
  );
}

export default MobileShell;
