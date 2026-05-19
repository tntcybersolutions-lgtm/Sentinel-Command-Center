/**
 * Sprint M-EVERY: Mobile notifications page.
 *
 * Mobile-friendly notification feed. Pulls /api/notifications, lists by
 * recency, mark-read action. Built to match the desktop notifications.tsx
 * functionality but in the mobile shell.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import MobileTabBar from "@/components/mobile/m-tab-bar";
import { apiFetch } from "@/lib/offline-queue";

type Notification = {
  id: string;
  tenantId?: string;
  userId?: string | null;
  type: string;
  title: string;
  message?: string;
  link?: string | null;
  priority?: string;
  isRead?: boolean;
  metadata?: any;
  createdAt: string;
};

const TYPE_ICON: Record<string, string> = {
  approval_request: "▣",
  bid_opportunity:  "⌖",
  task_assigned:    "✓",
  message:          "✉",
  alert:            "▲",
  info:             "ⓘ",
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#E84B4B",
  high:   "#F0997B",
  medium: "#F4C04E",
  low:    "#8B92A1",
};

export default function MobileNotificationsPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"all" | "unread">("unread");
  const [items, setItems] = useState<Notification[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const r = await apiFetch("/api/notifications?cb=" + Date.now());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const all = await r.json();
      setItems(Array.isArray(all) ? all : []);
    } catch (e: any) {
      setErr(String(e.message || e));
      setItems([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function markRead(id: string) {
    setBusy(id);
    try {
      await apiFetch(`/api/notifications/${id}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await load();
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      setBusy(null);
    }
  }

  const filtered = (items ?? []).filter((n) =>
    tab === "unread" ? !n.isRead : true
  ).slice(0, 50);

  const unreadCount = (items ?? []).filter((n) => !n.isRead).length;

  return (
    <div
      data-testid="m-notifications-page"
      style={{
        background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE",
        padding: "16px 16px calc(96px + env(safe-area-inset-bottom)) 16px",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Notifications</h1>
        <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 4 }}>
          {unreadCount} unread
        </div>
      </header>

      <nav style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["unread","all"] as const).map((t) => (
          <button
            key={t}
            data-testid={`m-notif-tab-${t}`}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "#1D9E75" : "#14171C",
              color: tab === t ? "#fff" : "#8B92A1",
              border: tab === t ? "none" : "0.5px solid #2C2C2A",
              borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t === "unread" ? `Unread (${unreadCount})` : "All"}
          </button>
        ))}
      </nav>

      {err && (
        <div style={{ background: "#3a1818", border: "1px solid #6b2424", color: "#ffb0b0", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {err}
        </div>
      )}

      {items === null ? (
        <div style={{ color: "#8B92A1", fontSize: 14, padding: 20 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div data-testid="m-notif-empty" style={{ background: "#14171C", padding: 24, borderRadius: 12, textAlign: "center", color: "#8B92A1", fontSize: 14 }}>
          {tab === "unread" ? "All caught up — no unread notifications." : "No notifications."}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((n) => (
            <li
              key={n.id}
              data-testid={`m-notif-${n.id}`}
              style={{
                background: n.isRead ? "#101317" : "#14171C",
                borderLeft: `3px solid ${PRIORITY_COLOR[n.priority ?? "low"]}`,
                borderRadius: 10, padding: 12,
                opacity: n.isRead ? 0.65 : 1,
              }}
            >
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ fontSize: 18, lineHeight: 1.2, color: PRIORITY_COLOR[n.priority ?? "low"] }} aria-hidden="true">
                  {TYPE_ICON[n.type] || "•"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{n.title}</div>
                  {n.message && (
                    <div style={{ fontSize: 13, color: "#C8CCD3", lineHeight: 1.4 }}>
                      {n.message.slice(0, 180)}{n.message.length > 180 ? "…" : ""}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "#8B92A1" }}>
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                    {!n.isRead && (
                      <button
                        data-testid={`m-notif-mark-${n.id}`}
                        disabled={busy === n.id}
                        onClick={() => markRead(n.id)}
                        style={{
                          background: "transparent", border: "0.5px solid #2C2C2A", color: "#1D9E75",
                          fontSize: 11, padding: "2px 8px", borderRadius: 999, cursor: "pointer",
                        }}
                      >
                        {busy === n.id ? "…" : "Mark read"}
                      </button>
                    )}
                    {n.link && (
                      <button
                        onClick={() => setLocation(n.link!)}
                        style={{
                          background: "transparent", border: "none", color: "#1D9E75",
                          fontSize: 11, padding: "2px 0", cursor: "pointer",
                        }}
                      >
                        Open →
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <MobileTabBar />
    </div>
  );
}
