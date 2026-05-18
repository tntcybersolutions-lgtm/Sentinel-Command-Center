/**
 * Sprint TK3 — Sync Status indicator
 *
 * Floating pill that surfaces what the offline-queue is doing right now.
 * Combines:
 *   - JSON outbound queue count        (subscribe from offline-queue)
 *   - Pending photo upload count       (subscribePhotos from offline-queue)
 *   - A 3-second "Synced" pulse when the queue drains back to zero
 *
 * Renders in four states:
 *   - idle + clean       → null  (don't take up space)
 *   - pending writes     → orange pill "N queued"
 *   - pending photos     → orange pill with photo icon "N photo(s)"
 *   - both               → orange pill "N queued · M photos"
 *   - just-synced pulse  → green pill "✓ Synced" for 3s
 *
 * The user can tap to open the SyncSheet for detailed retry/drop controls.
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, CloudUpload, Image as ImageIcon } from "lucide-react";
import { subscribe, subscribePhotos } from "@/lib/offline-queue";

export interface SyncStatusProps {
  onOpen?: () => void;
}

export function SyncStatus({ onOpen }: SyncStatusProps) {
  const [queued, setQueued] = useState(0);
  const [pendingPhotos, setPendingPhotos] = useState(0);
  const [showSynced, setShowSynced] = useState(false);

  // Track the previous total so we can detect a drain-to-zero (= "just synced")
  const prevTotalRef = useRef(0);
  const syncedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const u1 = subscribe((c) => setQueued(c));
    const u2 = subscribePhotos((s) => setPendingPhotos(s.pending));
    return () => {
      u1();
      u2();
      if (syncedTimerRef.current) window.clearTimeout(syncedTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const total = queued + pendingPhotos;
    // drain-to-zero transition → show synced pulse for 3s
    if (prevTotalRef.current > 0 && total === 0) {
      setShowSynced(true);
      if (syncedTimerRef.current) window.clearTimeout(syncedTimerRef.current);
      syncedTimerRef.current = window.setTimeout(() => setShowSynced(false), 3000);
    }
    // any new work cancels a stale "synced" pulse
    if (total > 0 && showSynced) setShowSynced(false);
    prevTotalRef.current = total;
  }, [queued, pendingPhotos, showSynced]);

  const total = queued + pendingPhotos;
  if (total === 0 && !showSynced) return null;

  // ----- Just-synced pulse (green) -----
  if (showSynced) {
    return (
      <button
        type="button"
        data-testid="sync-status-synced"
        onClick={onOpen}
        style={pillStyle("#A6E3A1", "#0F1218")}
        aria-label="All changes synced"
      >
        <CheckCircle2 size={14} />
        <span>Synced</span>
      </button>
    );
  }

  // ----- Pending state (orange) -----
  const parts: string[] = [];
  if (queued > 0) parts.push(`${queued} queued`);
  if (pendingPhotos > 0) parts.push(`${pendingPhotos} photo${pendingPhotos === 1 ? "" : "s"}`);
  const label = parts.join(" · ");

  return (
    <button
      type="button"
      data-testid="sync-status-pending"
      onClick={onOpen}
      style={pillStyle("#F0997B", "#1A0E08")}
      aria-label={`${total} items pending sync. Tap to view.`}
    >
      {pendingPhotos > 0 && queued === 0 ? <ImageIcon size={14} /> : <CloudUpload size={14} />}
      <span>{label}</span>
    </button>
  );
}

function pillStyle(bg: string, fg: string): React.CSSProperties {
  return {
    position: "fixed",
    right: 16,
    bottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
    zIndex: 51,
    background: bg,
    color: fg,
    border: "none",
    borderRadius: 999,
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    lineHeight: 1,
  };
}

export default SyncStatus;
