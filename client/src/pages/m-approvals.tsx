/**
 * Sprint M6: Mobile approvals page.
 *
 * Lightweight queue of pending approvals. Approve/deny/dismiss with
 * confirmation. Filters by status (pending / urgent). Pulls from /api/approvals.
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
  agencyName?: string;
  dollarValue?: number | string;
  deadline?: string;
  requiredRole?: string;
  fitScore?: number;
  requestedBy?: string;
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

export default function MobileApprovalsPage() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<"pending" | "urgent" | "approved" | "denied">("pending");
  const [items, setItems] = useState<Approval[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setErr(null);
    try {
      const r = await apiFetch("/api/approvals?cb=" + Date.now());
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const all = await r.json();
      setItems(Array.isArray(all) ? all : []);
    } catch (e: any) {
      setErr(String(e.message || e));
      setItems([]);
    }
  }

  useEffect(() => { load(); }, []);

  async function act(id: string, action: "approve" | "deny" | "dismiss") {
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} this item?`)) return;
    setBusy(id + ":" + action);
    setErr(null);
    try {
      const r = await apiFetch(`/api/approvals/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "m-approvals" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await load();
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      setBusy(null);
    }
  }

  const filtered = (items ?? []).filter((it) => {
    if (tab === "urgent") return it.priority === "urgent" && it.status === "pending";
    return it.status === tab;
  });

  const counts = {
    pending:  (items ?? []).filter((i) => i.status === "pending").length,
    urgent:   (items ?? []).filter((i) => i.priority === "urgent" && i.status === "pending").length,
    approved: (items ?? []).filter((i) => i.status === "approved").length,
    denied:   (items ?? []).filter((i) => i.status === "denied").length,
  };

  return (
    <div
      data-testid="m-approvals-page"
      style={{
        background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE",
        padding: "16px 16px calc(96px + env(safe-area-inset-bottom)) 16px",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Approvals</h1>
        <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 4 }}>
          Review and act on HERBIE's recommendations
        </div>
      </header>

      <nav style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        {(["pending","urgent","approved","denied"] as const).map((t) => (
          <button
            key={t}
            data-testid={`m-approvals-tab-${t}`}
            onClick={() => setTab(t)}
            style={{
              background: tab === t ? "#1D9E75" : "#14171C",
              color: tab === t ? "#fff" : "#8B92A1",
              border: tab === t ? "none" : "0.5px solid #2C2C2A",
              borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 500,
              cursor: "pointer", whiteSpace: "nowrap",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)} ({counts[t]})
          </button>
        ))}
      </nav>

      {err && (
        <div data-testid="m-approvals-err" style={{ background: "#3a1818", border: "1px solid #6b2424", color: "#ffb0b0", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {err}
        </div>
      )}

      {items === null ? (
        <div style={{ color: "#8B92A1", fontSize: 14, padding: 20 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div data-testid="m-approvals-empty" style={{ background: "#14171C", padding: 24, borderRadius: 12, textAlign: "center", color: "#8B92A1", fontSize: 14 }}>
          No {tab} items
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((it) => (
            <li
              key={it.id}
              data-testid={`m-approval-${it.id}`}
              style={{
                background: "#14171C",
                borderLeft: `3px solid ${PRIORITY_COLOR[it.priority ?? "low"]}`,
                borderRadius: 10, padding: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
                    {it.title || it.entityName || it.actionType}
                  </div>
                  <div style={{ fontSize: 11, color: "#8B92A1", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {it.entityType} · {it.actionType.replace(/_/g, " ")}
                  </div>
                </div>
                {it.priority && (
                  <span style={{
                    background: PRIORITY_COLOR[it.priority],
                    color: it.priority === "urgent" || it.priority === "high" ? "#fff" : "#1A0E08",
                    fontSize: 10, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 999, textTransform: "uppercase",
                  }}>{it.priority}</span>
                )}
              </div>
              {it.description && (
                <div style={{ fontSize: 13, color: "#C8CCD3", marginTop: 8, lineHeight: 1.4 }}>
                  {it.description.slice(0, 200)}{it.description.length > 200 ? "…" : ""}
                </div>
              )}
              {it.dollarValue && (
                <div style={{ fontSize: 13, fontFeatureSettings: '"tnum"', marginTop: 6, color: "#F0997B" }}>
                  ${Number(it.dollarValue).toLocaleString()}
                </div>
              )}
              {it.deadline && (
                <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 4 }}>
                  Deadline: {new Date(it.deadline).toLocaleDateString()}
                </div>
              )}

              {it.status === "pending" && (
                <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                  <button data-testid={`m-approve-${it.id}`} disabled={busy?.startsWith(it.id)} onClick={() => act(it.id, "approve")} style={btnApprove}>
                    {busy === it.id + ":approve" ? "…" : "Approve"}
                  </button>
                  <button data-testid={`m-deny-${it.id}`} disabled={busy?.startsWith(it.id)} onClick={() => act(it.id, "deny")} style={btnDeny}>
                    {busy === it.id + ":deny" ? "…" : "Deny"}
                  </button>
                  <button data-testid={`m-dismiss-${it.id}`} disabled={busy?.startsWith(it.id)} onClick={() => act(it.id, "dismiss")} style={btnDismiss}>
                    Dismiss
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <MobileTabBar active="approve" />
    </div>
  );
}

const btnApprove: React.CSSProperties = {
  flex: 1, background: "#1D9E75", border: "none", color: "#fff",
  borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnDeny: React.CSSProperties = {
  flex: 1, background: "#3a1818", border: "1px solid #6b2424", color: "#ffb0b0",
  borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer",
};
const btnDismiss: React.CSSProperties = {
  flex: 0, background: "transparent", border: "0.5px solid #2C2C2A", color: "#8B92A1",
  borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer",
};
