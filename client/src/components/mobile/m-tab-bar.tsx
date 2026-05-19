/**
 * Sprint M-NAV: Bottom tab bar for all m-* mobile pages.
 *
 * Lightweight, fixed-bottom, 5-slot. Highlights the active route.
 * Uses wouter's useLocation so navigation is client-side.
 */
import { useLocation } from "wouter";

type Tab = { key: string; label: string; href: string; icon: string };

const TABS: Tab[] = [
  { key: "home",     label: "Home",     href: "/m-home",      icon: "⌂" },
  { key: "punch",    label: "Punch",    href: "/punch-list",  icon: "✓" },
  { key: "daily",    label: "Daily",    href: "/m-daily-log", icon: "📋" },
  { key: "approve",  label: "Approve",  href: "/m-approvals", icon: "▣" },
  { key: "more",     label: "More",     href: "/m-more",      icon: "≡" },
];

export default function MobileTabBar({ active }: { active?: string } = {}) {
  const [location, setLocation] = useLocation();

  const isActive = (tab: Tab) => {
    if (active) return tab.key === active;
    if (tab.href === "/m-home") return location === "/m-home" || location === "/";
    return location.startsWith(tab.href);
  };

  return (
    <nav
      data-testid="m-tab-bar"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "#14171C",
        borderTop: "0.5px solid #2C2C2A",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        padding: "8px 0 calc(8px + env(safe-area-inset-bottom))",
        zIndex: 100,
      }}
    >
      {TABS.map((tab) => {
        const on = isActive(tab);
        return (
          <button
            key={tab.key}
            data-testid={`m-tab-${tab.key}`}
            onClick={() => setLocation(tab.href)}
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              color: on ? "#1D9E75" : "#8B92A1",
              fontSize: 11,
              padding: "4px 0",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 2,
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }} aria-hidden="true">{tab.icon}</span>
            <span style={{ fontWeight: on ? 600 : 400 }}>{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
