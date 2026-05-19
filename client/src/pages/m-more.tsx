/**
 * Sprint M-NAV: Mobile "More" page — links to all m-* pages that don't fit
 * in the bottom tab bar. Replaces the missing nav drawer.
 */
import { useLocation } from "wouter";
import MobileTabBar from "@/components/mobile/m-tab-bar";

type Link = { label: string; href: string; subtitle?: string };

const LINKS: Link[] = [
  { label: "RFIs",       href: "/m-rfi-list",  subtitle: "Open requests for information" },
  { label: "Drawings",   href: "/m-drawings",  subtitle: "Plan sheets & markups" },
  { label: "Photos",     href: "/projects/default/m-photos", subtitle: "Site photos with captions" },
  { label: "Receipts",   href: "/m-receipt",   subtitle: "Capture & extract receipts" },
  { label: "Profile",    href: "/profile",     subtitle: "Account & sign out" },
];

export default function MobileMorePage() {
  const [, setLocation] = useLocation();

  return (
    <div
      data-testid="m-more-page"
      style={{
        background: "#0B0D11",
        minHeight: "100vh",
        color: "#E8EAEE",
        padding: "16px 16px calc(80px + env(safe-area-inset-bottom)) 16px",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>More</h1>
        <p style={{ fontSize: 13, color: "#8B92A1", marginTop: 4 }}>
          Field tools and account settings
        </p>
      </header>

      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {LINKS.map((link) => (
          <li key={link.href}>
            <button
              data-testid={`m-more-link-${link.href.replace(/[/?:]/g, "_")}`}
              onClick={() => setLocation(link.href)}
              style={{
                width: "100%",
                background: "#14171C",
                border: "0.5px solid #2C2C2A",
                color: "#E8EAEE",
                borderRadius: 12,
                padding: 14,
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 500 }}>{link.label}</span>
              {link.subtitle && (
                <span style={{ fontSize: 12, color: "#8B92A1" }}>{link.subtitle}</span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <MobileTabBar active="more" />
    </div>
  );
}
