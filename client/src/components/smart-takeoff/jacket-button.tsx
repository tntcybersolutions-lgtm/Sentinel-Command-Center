// React snippet to add to client/src/pages/smart-takeoff.tsx
//
// Adds:
//   - "Build Bid Jacket" button that fires POST /api/bid-jackets/:id/auto-fill
//   - Confidence-warning banner that shows any items the vision-counter v2
//     flagged as needsReview
//
// HOW TO APPLY:
//
// 1) Drop this file into client/src/components/smart-takeoff/ (or paste the
//    two components inline into smart-takeoff.tsx).
//
// 2) In smart-takeoff.tsx, render <BuildBidJacketButton jacketId={...} />
//    near the bottom of the takeoff toolbar, and render
//    <VisionConfidenceWarnings items={visionResults?.items ?? []} />
//    above the items list.
//
// Notes:
//   - Uses fetch with credentials: "include" so the existing session cookie
//     is sent. Adjust if your codebase wraps fetch in a custom client.
//   - The toast/notification calls are just stubs — wire them up to your
//     existing toast system (looks like the project uses a sonner-style API
//     based on `client/` patterns in the diff).

import React, { useState } from "react";

// ─── BuildBidJacketButton ───────────────────────────────────────────────────

export interface BuildBidJacketButtonProps {
  jacketId: string;
  bidProjectId?: string;
  /** Called after a successful run; the parent can refresh the jacket UI. */
  onCompleted?: (result: AutoFillResultLike) => void;
  className?: string;
}

export interface AutoFillResultLike {
  ok: boolean;
  result?: {
    totalFiled: number;
    totalReplaced: number;
    skipped: Array<{ kind: string; reason: string; detail?: string }>;
    warnings: string[];
    success: boolean;
  };
  error?: string;
}

export function BuildBidJacketButton(props: BuildBidJacketButtonProps): JSX.Element {
  const { jacketId, bidProjectId, onCompleted, className } = props;
  const [isRunning, setIsRunning] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setLastSummary(null);
    try {
      const resp = await fetch(`/api/bid-jackets/${encodeURIComponent(jacketId)}/auto-fill`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bidProjectId ? { bidProjectId } : {}),
      });
      const data = (await resp.json()) as AutoFillResultLike;
      if (!data.ok) {
        setLastSummary(`Auto-fill failed: ${data.error ?? "unknown"}`);
      } else if (data.result) {
        const { totalFiled, totalReplaced, skipped } = data.result;
        const newCount = totalFiled - totalReplaced;
        setLastSummary(
          `Filed ${totalFiled} doc${totalFiled === 1 ? "" : "s"} ` +
            `(${newCount} new, ${totalReplaced} replaced)` +
            (skipped.length > 0 ? `, ${skipped.length} skipped` : ""),
        );
      }
      onCompleted?.(data);
    } catch (err: any) {
      setLastSummary(`Auto-fill error: ${err?.message ?? String(err)}`);
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        className="px-4 py-2 rounded bg-indigo-600 text-white font-medium hover:bg-indigo-700 disabled:opacity-50"
        disabled={isRunning}
        onClick={handleClick}
        title="Pull takeoff PDF, blueprints, scope, and subcontractor docs into the jacket"
      >
        {isRunning ? "Building jacket…" : "Build Bid Jacket"}
      </button>
      {lastSummary && (
        <div className="mt-2 text-sm text-gray-700">{lastSummary}</div>
      )}
    </div>
  );
}

// ─── VisionConfidenceWarnings ───────────────────────────────────────────────

export interface VisionItemSummary {
  type: string;
  count: number;
  confidence: number;
  needsReview: boolean;
  source: "llm" | "fallback" | "mixed";
}

export interface VisionConfidenceWarningsProps {
  items: VisionItemSummary[];
  /** Threshold for the warning. Default 0.7 — matches LOW_CONFIDENCE_THRESHOLD. */
  threshold?: number;
  className?: string;
}

export function VisionConfidenceWarnings(
  props: VisionConfidenceWarningsProps,
): JSX.Element | null {
  const threshold = props.threshold ?? 0.7;
  const flagged = props.items.filter(
    (it) => it.needsReview || it.confidence < threshold || it.source === "fallback",
  );
  if (flagged.length === 0) return null;
  return (
    <div
      role="alert"
      className={
        "border border-amber-300 bg-amber-50 text-amber-900 rounded p-3 text-sm " +
        (props.className ?? "")
      }
    >
      <div className="font-semibold mb-1">
        {flagged.length} count{flagged.length === 1 ? "" : "s"} need
        {flagged.length === 1 ? "s" : ""} a quick review
      </div>
      <ul className="list-disc list-inside space-y-0.5">
        {flagged.map((it) => (
          <li key={it.type}>
            <span className="font-medium">{prettyType(it.type)}:</span> count {it.count}
            {", confidence "}
            {(it.confidence * 100).toFixed(0)}%
            {it.source === "fallback" && " — vision unavailable, manual count needed"}
          </li>
        ))}
      </ul>
    </div>
  );
}

function prettyType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
