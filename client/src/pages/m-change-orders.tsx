/**
 * Sprint M-EVERY: Mobile change orders page.
 *
 * Lightweight queue of change orders filtered from /api/approvals. Approve/deny
 * actions persisted via the existing approval endpoints. Field supers can
 * triage COs from the truck cab.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import MobileTabBar from "@/components/mobile/m-tab-bar";
import { apiFetch } from "@/lib/offline-queue";

type Approval = {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  title?: string;
  description?: string;
  entityName?: string;
  dollarValue?: number | string;
  deadline?: string;
  priority?: string;
  status: string;
  createdAt?: string;
};

const PRIORITY_COLOR: Record<string, string> = {
  urgent: "#E84B4B",
  high:   "#F0997B",
  medium: "#F4C04E",
  low:    "#8B92A1",
};

export default function MobileChangeOrdersPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"pending" | "approved" | "denied">("pending");
  const [items, setItems] = useState<Approval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const r = await apiFetch("/api/approvals?cb=" + Date.now());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const all = await r.json();
      const cos = (Array.isArray(all) ? all : []).filter((a: Approval) =>
        a.entityType === "change_order" || a.actionType?.includes("change_order")
      );
      setItems(cos);
    } catch (e: any) {
      setErr(String(e.message || e));
      setItems([]);
    }
  }
  useEffect(() => { load(); }, []);

  async function act(id: string, action: "approve" | "deny" | "dismiss") {
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this change order?`)) return;
    setBusy(id + ":" + action);
    setErr(null);
    try {
      const r = await apiFetch(`/api/approvals/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "m-change-orders" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      setBusy(null);
    }
  }

  const filtered = (items ?? []).filter((it) => it.status === tab);
  const counts = {
    pending:  (items ?? []).filter((i) => i.status === "pending").length,
    approved: (items ?? []).filter((i) => i.status === "approved").length,
    denied:   (items ?? []).filter((i) => i.status === "denied").length,
  };
  const totalValue = filtered.reduce((sum, i) => sum + (Number(i.dollarValue) || 0), 0);

  return (
    <div
      data-testid="m-change-orders-page"
      style={{
        background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE",
        padding: "16px 16px calc(96px + env(safe-area-inset-bottom)) 16px",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Change Orders</h1>
        <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 4 }}>
          {filtered.length} {tab} · ${totalValue.toLocaleString()} total
        </div>
      </header>

      <nav style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {(["pending","approved","denied"] as const).map((t) => (
          <button
            key={t}
            data-testid={`m-co-tab-${t}`}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "#1D9E75" : "#14171C",
              color: tab === t ? "#fff" : "#8B92A1",
              border: tab === t ? "none" : "0.5px solid #2C2C2A",
              borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
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
        <div data-testid="m-co-empty" style={{ background: "#14171C", padding: 24, borderRadius: 12, textAlign: "center", color: "#8B92A1", fontSize: 14 }}>
          No {tab} change orders
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((it) => (
            <li
              key={it.id}
              data-testid={`m-co-${it.id}`}
              style={{
                background: "#14171C",
                borderLeft: `3px solid ${PRIORITY_COLOR[it.priority ?? "low"]}`,
                borderRadius: 10, padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                    {it.title || it.entityName || "Change Order"}
                  </div>
                  {it.entityName && it.entityName !== it.title && (
                    <div style={{ fontSize: 12, color: "#8B92A1" }}>{it.entityName}</div>
                  )}
                </div>
                {it.dollarValue && (
                  <div style={{ fontSize: 14, fontFeatureSettings: '"tnum"', color: "#F0997B", fontWeight: 600, whiteSpace: "nowrap" }}>
                    ${Number(it.dollarValue).toLocaleString()}
                  </div>
                )}
              </div>
              {it.description && (
                <div style={{ fontSize: 13, color: "#C8CCD3", marginTop: 8, lineHeight: 1.4 }}>
                  {it.description.slice(0, 240)}{it.description.length > 240 ? "…" : ""}
                </div>
              )}
              {it.deadline && (
                <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 4 }}>
                  Deadline: {new Date(it.deadline).toLocaleDateString()}
                </div>
              )}

              {it.status === "pending" && (
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  <button
                    data-testid={`m-co-approve-${it.id}`}
                    disabled={busy?.startsWith(it.id)}
                    onClick={() => act(it.id, "approve")}
                    style={{
                      flex: 1, background: "#1D9E75", border: "none", color: "#fff",
                      borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {busy === it.id + ":approve" ? "…" : "Approve"}
                  </button>
                  <button
                    data-testid={`m-co-deny-${it.id}`}
                    disabled={busy?.startsWith(it.id)}
                    onClick={() => act(it.id, "deny")}
                    style={{
                      flex: 1, background: "#3a1818", border: "1px solid #6b2424", color: "#ffb0b0",
                      borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {busy === it.id + ":deny" ? "…" : "Deny"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <MobileTabBar />
    </div>
  );
}
