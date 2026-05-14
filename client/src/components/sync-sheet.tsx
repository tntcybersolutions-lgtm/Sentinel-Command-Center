import { useEffect, useState } from "react";
import { flush, list, remove, subscribe, type QueuedRequest } from "@/lib/offline-queue";

export function SyncSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<QueuedRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refresh = async () => {
    try { setItems(await list()); } catch { setItems([]); }
  };

  useEffect(() => {
    if (!open) return;
    void refresh();
    const unsub = subscribe(() => { void refresh(); });
    return () => { unsub(); };
  }, [open]);

  const onFlush = async () => {
    setBusy(true);
    try {
      const r = await flush();
      setLastResult(`Flushed ${r.flushed} · ${r.failed} failed`);
      await refresh();
    } finally { setBusy(false); }
  };

  const onDrop = async (id: string) => {
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
            data-testid="sync-sheet-flush"
            onClick={onFlush}
            disabled={busy || items.length === 0}
            style={{
              flex: 1, padding: "10px 14px", border: "none", borderRadius: 10,
              background: items.length === 0 ? "#2C2C2A" : "#1D9E75",
              color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: items.length === 0 ? "default" : "pointer",
            }}
          >{busy ? "Syncing…" : "Sync now"}</button>
        </div>
        {lastResult && (
          <div style={{ color: "#8B92A1", fontSize: 12, marginBottom: 10 }}>{lastResult}</div>
        )}
        {items.length === 0 ? (
          <div style={{ color: "#8B92A1", fontSize: 13, padding: "16px 0" }}>Queue is empty.</div>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((it) => (
              <li
                key={it.id}
                data-testid={`sync-row-${it.id}`}
                style={{
                  background: "#14171C", borderRadius: 12, padding: 12,
                  display: "flex", alignItems: "center", gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.method} {it.url}
                  </div>
                  <div style={{ fontSize: 11, color: "#8B92A1", marginTop: 2 }}>
                    queued {new Date(it.createdAt).toLocaleTimeString()} · {it.attempts} attempt{it.attempts === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  data-testid={`sync-row-drop-${it.id}`}
                  onClick={() => onDrop(it.id)}
                  style={{
                    background: "transparent", color: "#E24B4A", border: "1px solid #2C2C2A",
                    borderRadius: 8, padding: "6px 10px", fontSize: 12, cursor: "pointer",
                  }}
                >Drop</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default SyncSheet;
