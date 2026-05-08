// GTM-quality Build Bid Jacket button + result panel.
// Wired to the Phase 2 v2 endpoint: POST /api/bid-projects/:bidProjectId/auto-fill-jacket
//
// Drop into client/src/components/smart-takeoff/jacket-button.tsx
//
// Usage in smart-takeoff.tsx (or anywhere with a bidProjectId in scope):
//
//   import { BuildBidJacketButton, VisionConfidenceWarnings }
//     from "@/components/smart-takeoff/jacket-button";
//
//   <BuildBidJacketButton bidProjectId={bidProject.id} />
//   <VisionConfidenceWarnings items={visionResults?.items ?? []} />

import React, { useState } from "react";

// ─── Endpoint result shapes (mirror server/services/jacket-auto-fill.service.v2) ─

export type DocKind =
  | "takeoff"
  | "blueprints"
  | "scope"
  | "subcontractors_w9"
  | "subcontractors_coi"
  | "subcontractors_lien_waivers";

export type SkippedReason =
  | "no_takeoff"
  | "no_scope"
  | "no_blueprints"
  | "no_subcontractor_docs"
  | "render_failed"
  | "copy_failed"
  | "no_folders";

export interface AutoFillFiledEntry {
  kind: DocKind;
  fileName: string;
  folderCode: string;
  folderName: string;
  documentId: string;
  replaced: boolean;
  autoFillKey: string;
}

export interface AutoFillSkippedEntry {
  kind: DocKind;
  reason: SkippedReason;
  detail?: string;
}

export interface AutoFillResult {
  tenantId: string;
  bidProjectId: string;
  filed: AutoFillFiledEntry[];
  skipped: AutoFillSkippedEntry[];
  warnings: string[];
  totalFiled: number;
  totalReplaced: number;
  success: boolean;
}

export interface AutoFillResponse {
  ok: boolean;
  result?: AutoFillResult;
  error?: string;
  detail?: string;
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface BuildBidJacketButtonProps {
  /** The bid project to auto-fill the jacket for. */
  bidProjectId: string;
  /** Override the tenant; defaults to server-side resolution from auth/jacket. */
  tenantId?: string;
  /** Called after each completion. Useful for refreshing the jacket file tree. */
  onCompleted?: (resp: AutoFillResponse) => void;
  /** Tailwind classes to merge into the wrapper. */
  className?: string;
  /** Make the button full-width inside its parent. */
  fullWidth?: boolean;
}

// ─── Pretty kind labels ────────────────────────────────────────────────────

const KIND_LABEL: Record<DocKind, string> = {
  takeoff: "Takeoff Summary",
  blueprints: "Blueprints",
  scope: "Scope Summary",
  subcontractors_w9: "Subcontractor W-9s",
  subcontractors_coi: "Subcontractor COIs",
  subcontractors_lien_waivers: "Subcontractor Lien Waivers",
};

const SKIP_LABEL: Record<SkippedReason, string> = {
  no_takeoff: "No takeoff finalized yet",
  no_scope: "No scope extraction available",
  no_blueprints: "No blueprints uploaded",
  no_subcontractor_docs: "No subcontractor docs on file",
  render_failed: "PDF render failed",
  copy_failed: "Storage copy failed",
  no_folders: "Jacket folders not seeded — run folder setup first",
};

// ─── BuildBidJacketButton ───────────────────────────────────────────────────

export function BuildBidJacketButton(props: BuildBidJacketButtonProps): JSX.Element {
  const { bidProjectId, tenantId, onCompleted, className, fullWidth } = props;
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [response, setResponse] = useState<AutoFillResponse | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number>(0);

  async function handleClick() {
    setState("running");
    setResponse(null);
    const t0 = Date.now();
    const tickInterval = window.setInterval(() => setElapsedMs(Date.now() - t0), 200);
    try {
      const resp = await fetch(
        `/api/bid-projects/${encodeURIComponent(bidProjectId)}/auto-fill-jacket`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tenantId ? { tenantId } : {}),
        },
      );
      const data = (await resp.json()) as AutoFillResponse;
      window.clearInterval(tickInterval);
      setElapsedMs(Date.now() - t0);
      setResponse(data);
      setState(data.ok ? "done" : "error");
      onCompleted?.(data);
    } catch (err: any) {
      window.clearInterval(tickInterval);
      setResponse({ ok: false, error: "network_error", detail: err?.message ?? String(err) });
      setState("error");
    }
  }

  function handleReset() {
    setState("idle");
    setResponse(null);
    setElapsedMs(0);
  }

  const wrapperCls = ["space-y-3", className ?? ""].join(" ");

  return (
    <div className={wrapperCls}>
      <div className={fullWidth ? "w-full" : ""}>
        <button
          type="button"
          className={[
            "px-5 py-2.5 rounded-md font-medium text-white transition-colors",
            "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2",
            fullWidth ? "w-full" : "",
          ].join(" ")}
          disabled={state === "running"}
          onClick={handleClick}
          title="Pull takeoff PDF, blueprints, scope summary, and subcontractor docs into the bid jacket folders. Idempotent: re-running replaces same-keyed docs."
          data-testid="build-bid-jacket-btn"
        >
          {state === "running" ? (
            <span className="inline-flex items-center gap-2">
              <Spinner /> Building Bid Jacket… {(elapsedMs / 1000).toFixed(1)}s
            </span>
          ) : state === "done" ? (
            "✓ Bid Jacket Built — Re-run"
          ) : state === "error" ? (
            "✗ Try Again"
          ) : (
            "Build Bid Jacket"
          )}
        </button>
        {(state === "done" || state === "error") && (
          <button
            type="button"
            onClick={handleReset}
            className="ml-3 text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Dismiss
          </button>
        )}
      </div>

      {response && state === "error" && (
        <ErrorPanel response={response} />
      )}
      {response && state === "done" && response.result && (
        <ResultPanel result={response.result} />
      )}
    </div>
  );
}

// ─── ErrorPanel ────────────────────────────────────────────────────────────

function ErrorPanel({ response }: { response: AutoFillResponse }) {
  return (
    <div
      role="alert"
      className="border border-red-300 bg-red-50 text-red-900 rounded-md p-4 text-sm"
    >
      <div className="font-semibold mb-1">Auto-fill failed</div>
      <div>
        <span className="font-medium">Error:</span> {response.error ?? "unknown"}
      </div>
      {response.detail && (
        <div className="text-xs mt-1 text-red-800/80 break-all">{response.detail}</div>
      )}
    </div>
  );
}

// ─── ResultPanel ───────────────────────────────────────────────────────────

function ResultPanel({ result }: { result: AutoFillResult }) {
  const newCount = result.totalFiled - result.totalReplaced;
  const groupedFiled = groupBy(result.filed, (f) => f.kind);
  const groupedSkipped = groupBy(result.skipped, (s) => s.kind);

  return (
    <div className="border border-emerald-300 bg-emerald-50 rounded-md p-4 text-sm space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="font-semibold text-emerald-900">
          {result.success ? "✓ Jacket auto-fill complete" : "Jacket auto-fill: partial success"}
        </div>
        <div className="text-xs text-emerald-800/70">
          {result.totalFiled} filed
          {result.totalReplaced > 0 && ` (${newCount} new, ${result.totalReplaced} replaced)`}
          {result.skipped.length > 0 && ` · ${result.skipped.length} skipped`}
        </div>
      </div>

      {/* Filed docs grouped by kind */}
      {result.filed.length > 0 && (
        <div className="space-y-2">
          {(Object.keys(groupedFiled) as DocKind[]).map((kind) => (
            <FiledGroup key={kind} kind={kind} entries={groupedFiled[kind]!} />
          ))}
        </div>
      )}

      {/* Skipped sections */}
      {result.skipped.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-emerald-800/80 hover:text-emerald-900">
            {result.skipped.length} section{result.skipped.length === 1 ? "" : "s"} skipped — see why
          </summary>
          <ul className="mt-2 list-disc list-inside space-y-0.5 text-emerald-900/80">
            {(Object.keys(groupedSkipped) as DocKind[]).map((kind) => {
              const entries = groupedSkipped[kind]!;
              const reasons = Array.from(new Set(entries.map((e) => SKIP_LABEL[e.reason] ?? e.reason)));
              return (
                <li key={kind}>
                  <span className="font-medium">{KIND_LABEL[kind]}:</span> {reasons.join("; ")}
                </li>
              );
            })}
          </ul>
        </details>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="border-t border-emerald-300/60 pt-2">
          <div className="text-xs font-semibold text-amber-900 mb-1">
            {result.warnings.length} warning{result.warnings.length === 1 ? "" : "s"}
          </div>
          <ul className="text-xs space-y-0.5 text-amber-900/90">
            {result.warnings.map((w, i) => (
              <li key={i}>• {w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FiledGroup({ kind, entries }: { kind: DocKind; entries: AutoFillFiledEntry[] }) {
  return (
    <div>
      <div className="text-xs font-semibold text-emerald-900 mb-0.5">
        {KIND_LABEL[kind]}{" "}
        <span className="font-normal text-emerald-800/70">
          → {entries[0].folderName} (folder code {entries[0].folderCode})
        </span>
      </div>
      <ul className="text-xs space-y-0.5 ml-1">
        {entries.map((e) => (
          <li key={e.documentId} className="flex items-baseline gap-2">
            <span className="text-emerald-900">📄</span>
            <span className="text-emerald-900 font-mono break-all">{e.fileName}</span>
            {e.replaced && (
              <span className="text-emerald-800/70 italic text-[10px]">replaced prior copy</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── VisionConfidenceWarnings ──────────────────────────────────────────────

export interface VisionItemSummary {
  type: string;
  count: number;
  confidence: number;
  needsReview: boolean;
  source: "llm" | "fallback" | "mixed";
}

export interface VisionConfidenceWarningsProps {
  items: VisionItemSummary[];
  /** Threshold for the warning. Default 0.7. */
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
      className={[
        "border border-amber-300 bg-amber-50 text-amber-900 rounded-md p-3 text-sm",
        props.className ?? "",
      ].join(" ")}
    >
      <div className="font-semibold mb-1 flex items-center gap-2">
        <span>⚠</span>
        {flagged.length} count{flagged.length === 1 ? "" : "s"} need
        {flagged.length === 1 ? "s" : ""} a quick human check
      </div>
      <ul className="list-disc list-inside space-y-0.5 text-xs">
        {flagged.map((it) => (
          <li key={it.type}>
            <span className="font-medium">{prettyType(it.type)}:</span>{" "}
            count <span className="font-mono">{it.count}</span>, confidence{" "}
            <span className="font-mono">{(it.confidence * 100).toFixed(0)}%</span>
            {it.source === "fallback" && (
              <span className="ml-2 text-amber-800/80 italic">
                — vision unavailable, manual count needed
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function prettyType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function groupBy<T, K extends string>(arr: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const item of arr) {
    const k = keyFn(item);
    if (!out[k]) out[k] = [];
    out[k].push(item);
  }
  return out;
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}
