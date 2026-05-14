import { useEffect, useState } from "react";
import { flush, list, remove, retry, subscribe, type QueuedRequest } from "@/lib/offline-queue";

function formatAge(ms: number): string {
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s ago`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h ago`;
  return `${Math.round(ms / 86_400_000)}d ago`;
}

export function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<QueuedRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refresh = async () => {
    try { setItems(await list()); } catch { setItems([]); }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    const unsub = subscribe(() => { void refresh(); });
    const t = window.setInterval(() => { void refresh(); }, 5000);
    return () => { unsub(); window.clearInterval(t); };
  }, [open]);

  const onRetryAll = async () => {
    setBusy(true);
    try {
      const r = await flush();
      setLastResult(`Retried ${r.flushed + r.failed} · ${r.flushed} ok · ${r.failed} failed`);
      await refresh();
    } finally { setBusy(false); }
  };

  const onRetryOne = async (id: string) => {
    setBusyRow(id);
    try {
      const r = await retry(id);
      setLastResult(r.ok ? "Synced 1 item." : `Retry failed: ${r.error || "unknown"}`);
      await refresh();
    } finally { setBusyRow(null); }
  };

  const onDrop = async (id: string) => {
    if (!window.confirm("Drop this queued item? It will not be sent.")) return;
    await remove(id);
    await refresh();
  };

  if (!open) return null;

  return (
    <div
      data-testid="sync-sheet"
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed", inset: 0, zIndex: 70,
        background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", background: "#0F1218", color: "#E8EAEE",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          padding: 20, maxHeight: "80vh", overflowY: "auto",
          borderTop: "0.5px solid #2C2C2A",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600 }}>Outbound queue</h2>
          <button
            data-testid="sync-sheet-close"
            onClick={onClose}
            style={{ background: "transparent", color: "#8B92A1", border: "none", fontSize: 20, cursor: "pointer" }}
          >×</button>
        </div>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          <button
            data-testid="sync-sheet-retry-all"
            onClick={onRetryAll}
            disabled={busy || items.length === 0}
            style={{
              flex: 1, padding: "10px 14px", border: "none", borderRadius: 10,
              background: items.length === 0 ? "#2C2C2A" : "#1D9E75",
              color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: items.length === 0 ? "default" : "pointer",
            }}
          >{busy ? "Retrying…" : "Retry all"}</button>
        </div>
        {lastResult && (
          <div data-testid="sync-sheet-result" style={{ color: "#8B92A1", fontSize: 12, marginBottom: 10 }}>{lastResult}</div>
        )}
        {items.length === 0 ? (
          <div data-testid="sync-sheet-empty" style={{ color: "#8B92A1", fontSize: 13, padding: "16px 0" }}>Queue is empty.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it) => {
              const age = formatAge(Date.now() - it.createdAt);
              return (
                <li
                  key={it.id}
                  data-testid={`sync-row-${it.id}`}
                  style={{
                    background: "#14171C", borderRadius: 12, padding: 12,
                    display: "flex", alignItems: "flex-start", gap: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        data-testid={`sync-row-kind-${it.id}`}
                        style={{
                          fontSize: 11, fontWeight: 700, color: "#FAC775",
                          background: "rgba(250,199,117,0.12)", borderRadius: 999, padding: "2px 8px",
                        }}
                      >{it.kind || it.method}</span>
                      <span
                        data-testid={`sync-row-target-${it.id}`}
                        style={{ fontSize: 12, color: "#E8EAEE", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      >{it.target || it.url}</span>
                    </div>
                    <div style={{ fontSize: 11, color: "#8B92A1", marginTop: 4 }}>
                      <span data-testid={`sync-row-age-${it.id}`}>{age}</span>
                      <span> · </span>
                      <span>{it.attempts} attempt{it.attempts === 1 ? "" : "s"}</span>
                    </div>
                    {it.lastError && (
                      <div
                        data-testid={`sync-row-error-${it.id}`}
                        style={{ fontSize: 11, color: "#E24B4A", marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}
                      >{it.lastError}</div>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button
                      data-testid={`sync-row-retry-${it.id}`}
                      onClick={() => onRetryOne(it.id)}
                      disabled={busyRow === it.id}
                      style={{
                        background: "#1D9E75", color: "#fff", border: "none",
                        borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                        opacity: busyRow === it.id ? 0.6 : 1,
                      }}
                    >{busyRow === it.id ? "…" : "Retry"}</button>
                    <button
                      data-testid={`sync-row-drop-${it.id}`}
                      onClick={() => onDrop(it.id)}
                      style={{
                        background: "transparent", color: "#E24B4A", border: "1px solid #2C2C2A",
                        borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                      }}
                    >Drop</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SyncSheet;
