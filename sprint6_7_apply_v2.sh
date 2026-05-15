#!/usr/bin/env bash
# Sprint 6 + 7 — written by Claude. Self-contained, idempotent.
# Pull from GitHub, then: bash sprint6_7_apply_v2.sh
set -euo pipefail
cd "${REPL_HOME:-$HOME/workspace}" 2>/dev/null || cd "$(pwd)"
echo "==> Sprint 6+7 apply from $(pwd)"
mkdir -p client/src/lib client/src/components client/src/pages server

# ==== 1. haptics.ts ============================================================
cat > client/src/lib/haptics.ts <<'HAPEOF'
function safeVibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch {}
}
export function tap(): void { safeVibrate(10); }
export function select(): void { safeVibrate(6); }
export function success(): void { safeVibrate([8, 40, 8]); }
export function warning(): void { safeVibrate([12, 60, 12, 60, 12]); }
export function error(): void { safeVibrate([20, 60, 20, 60, 20]); }
export function heavy(): void { safeVibrate(35); }
export function stop(): void { safeVibrate(0); }
HAPEOF
echo "  ok client/src/lib/haptics.ts"

# ==== 2. theme.ts =============================================================
cat > client/src/lib/theme.ts <<'THEMEOF'
export type Theme = "light" | "dark" | "auto";
const STORAGE_KEY = "sentinel-theme";

function systemPref(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function applyTheme(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolved);
}
export function resolveTheme(saved: Theme): "light" | "dark" {
  if (saved === "auto") return systemPref();
  return saved;
}
export function getSavedTheme(): Theme {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "auto") return v;
  return "auto";
}
export function setTheme(theme: Theme): void {
  if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, theme);
  applyTheme(resolveTheme(theme));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sentinel-theme-change", { detail: theme }));
  }
}
export function initTheme(): void {
  const saved = getSavedTheme();
  applyTheme(resolveTheme(saved));
  if (typeof window !== "undefined" && window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const listener = () => { if (getSavedTheme() === "auto") applyTheme(systemPref()); };
    if (mq.addEventListener) mq.addEventListener("change", listener);
    else mq.addListener(listener);
  }
}
THEMEOF
echo "  ok client/src/lib/theme.ts"

# ==== 3. swipe-row.tsx ========================================================
cat > client/src/components/swipe-row.tsx <<'SWIPEEOF'
import { useEffect, useRef, useState, type ReactNode } from "react";
import * as haptics from "@/lib/haptics";

const REVEAL_PX = 88;
const TRIGGER_PX = 60;
const DAMP = 0.45;

export type SwipeAction = { label: string; color: string; onAction: () => void };

export default function SwipeRow({
  leftAction, rightAction, children, disabled = false,
}: {
  leftAction?: SwipeAction; rightAction?: SwipeAction;
  children: ReactNode; disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const lastHaptic = useRef<"left" | "right" | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    lastHaptic.current = null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null || disabled) return;
    const raw = e.touches[0].clientX - startX.current;
    const damped = Math.abs(raw) > REVEAL_PX
      ? Math.sign(raw) * (REVEAL_PX + (Math.abs(raw) - REVEAL_PX) * DAMP)
      : raw;
    if (damped > 0 && !leftAction) return;
    if (damped < 0 && !rightAction) return;
    setDx(damped);
    if (damped > TRIGGER_PX && lastHaptic.current !== "right") {
      haptics.select(); lastHaptic.current = "right";
    } else if (damped < -TRIGGER_PX && lastHaptic.current !== "left") {
      haptics.select(); lastHaptic.current = "left";
    }
  }
  function onTouchEnd() {
    if (startX.current == null) { setDx(0); return; }
    if (dx > TRIGGER_PX && leftAction) { haptics.success(); leftAction.onAction(); }
    else if (dx < -TRIGGER_PX && rightAction) { haptics.success(); rightAction.onAction(); }
    startX.current = null;
    setDx(0);
  }
  useEffect(() => () => { startX.current = null; }, []);

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16 }}>
      {leftAction && (
        <div style={{
          position: "absolute", inset: 0, background: leftAction.color,
          display: "flex", alignItems: "center", paddingLeft: 16,
          color: "#fff", fontSize: 13, fontWeight: 500, pointerEvents: "none",
        }}>{leftAction.label}</div>
      )}
      {rightAction && (
        <div style={{
          position: "absolute", inset: 0, background: rightAction.color,
          display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 16,
          color: "#fff", fontSize: 13, fontWeight: 500, pointerEvents: "none",
        }}>{rightAction.label}</div>
      )}
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{
          transform: "translateX(" + dx + "px)",
          transition: startX.current == null ? "transform 200ms ease-out" : "none",
          position: "relative", zIndex: 1, touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
SWIPEEOF
echo "  ok client/src/components/swipe-row.tsx"

# ==== 4. project-switcher-sheet.tsx ===========================================
cat > client/src/components/project-switcher-sheet.tsx <<'PSEOF'
import { useEffect, useState } from "react";
import * as haptics from "@/lib/haptics";

export type ProjectSummary = {
  id: string; name: string;
  status: "active" | "at-risk" | "complete";
  lastActivityAt?: number; role?: string;
};

const ACTIVE_KEY = "sentinel-active-project";

function statusColor(s: ProjectSummary["status"]): string {
  return s === "active" ? "#1D9E75" : s === "at-risk" ? "#FAC775" : "#5F5E5A";
}
function ageLabel(ts?: number): string {
  if (!ts) return "—";
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3600_000) return Math.floor(d / 60_000) + "m ago";
  if (d < 86_400_000) return Math.floor(d / 3600_000) + "h ago";
  return Math.floor(d / 86_400_000) + "d ago";
}
export function getActiveProjectId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}
export function setActiveProjectId(id: string): void {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sentinel-active-project", { detail: id }));
  }
}

export default function ProjectSwitcherSheet({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const activeId = getActiveProjectId();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/projects")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
        else if (data?.projects) setProjects(data.projects);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  function pick(id: string) {
    haptics.select(); setActiveProjectId(id); onClose();
  }

  return (
    <>
      <div onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 90 }} />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        background: "var(--bg-2, #14171C)", color: "var(--text-1, #E8EAEE)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        padding: "14px 0 28px", zIndex: 100, maxHeight: "80vh", overflowY: "auto",
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--border-1, #2C2C2A)", margin: "0 auto 14px" }} />
        <div style={{ padding: "0 22px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Switch project</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-2, #8B92A1)", fontSize: 12, cursor: "pointer" }}>Close</button>
        </div>
        {loading && <div style={{ padding: "30px 22px", textAlign: "center", color: "var(--text-2, #8B92A1)", fontSize: 13 }}>Loading projects…</div>}
        {!loading && projects.length === 0 && (
          <div style={{ padding: "30px 22px", textAlign: "center", color: "var(--text-2, #8B92A1)", fontSize: 13 }}>
            No projects yet. Create one from desktop.
          </div>
        )}
        <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {projects.map((p) => {
            const isActive = p.id === activeId;
            return (
              <button key={p.id} onClick={() => pick(p.id)}
                style={{
                  background: isActive ? "var(--bg-3, #1C2128)" : "transparent",
                  border: isActive ? "0.5px solid var(--accent-1, #1D9E75)" : "0.5px solid transparent",
                  borderRadius: 14, padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 12,
                  textAlign: "left", cursor: "pointer",
                  color: "inherit", font: "inherit",
                }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(p.status), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2, #8B92A1)", marginTop: 2 }}>
                    {p.role ?? "Member"} · {ageLabel(p.lastActivityAt)}
                  </div>
                </div>
                {isActive && <span style={{ fontSize: 11, color: "var(--accent-1, #1D9E75)", fontWeight: 500 }}>Active</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
PSEOF
echo "  ok client/src/components/project-switcher-sheet.tsx"

# ==== 5. m-receipt.tsx ========================================================
cat > client/src/pages/m-receipt.tsx <<'MRECEIPTEOF'
import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { apiFetch, subscribe } from "@/lib/offline-queue";
import * as haptics from "@/lib/haptics";

type Extraction = {
  vendor: string; total: number | null; currency: string;
  purchaseDate: string | null; category: string;
  lineItems: { description: string; amount: number }[];
};
const EMPTY: Extraction = {
  vendor: "", total: null, currency: "USD",
  purchaseDate: null, category: "Materials", lineItems: [],
};
const MAX_DIM = 1600; const JPEG_Q = 0.82;

export default function MobileReceiptPage() {
  const params = useParams<{ id?: string }>();
  const projectId = params.id || "default";
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction>(EMPTY);
  const [phase, setPhase] = useState<"idle"|"extracting"|"review"|"saving"|"saved"|"error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  useEffect(() => subscribe(setQueued), []);

  function openCamera() { haptics.tap(); fileRef.current?.click(); }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setErr(null);
    const resized = await resize(file);
    setImageUrl(resized); setPhase("extracting"); haptics.tap();
    try {
      const res = await fetch("/api/receipts/ocr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: resized }),
      });
      if (!res.ok) throw new Error("OCR " + res.status);
      const data = await res.json();
      setExtraction({
        vendor: data.vendor ?? "", total: typeof data.total === "number" ? data.total : null,
        currency: data.currency ?? "USD", purchaseDate: data.purchaseDate ?? null,
        category: data.category ?? "Materials",
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
      });
      setPhase("review"); haptics.success();
    } catch (e) {
      setErr((e as Error).message); setExtraction(EMPTY); setPhase("review"); haptics.warning();
    }
  }
  async function save() {
    setPhase("saving");
    try {
      const res = await apiFetch("/api/projects/" + projectId + "/receipts", {
        method: "POST", kind: "generic",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extraction, imageUrl, projectId }),
      });
      if (res.ok || res.status === 202) { setPhase("saved"); haptics.success(); }
      else { setPhase("error"); setErr("Server " + res.status); haptics.error(); }
    } catch (e) { setPhase("error"); setErr((e as Error).message); haptics.error(); }
  }
  function reset() { setImageUrl(null); setExtraction(EMPTY); setPhase("idle"); setErr(null); }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-1, #0B0D11)", color: "var(--text-1, #E8EAEE)", paddingBottom: 110 }}>
      <header style={{ padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-2, #8B92A1)", letterSpacing: 0.6, textTransform: "uppercase" }}>Receipt</div>
          <div style={{ fontSize: 18, fontWeight: 500, marginTop: 2 }}>Snap + categorize</div>
        </div>
        {queued > 0 && (
          <span style={{ background: "var(--bg-3, #1C2128)", color: "#FAC775", padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>{queued} queued</span>
        )}
      </header>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
      <section style={{ padding: "0 22px" }}>
        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <button onClick={openCamera} style={primaryBtn}>Snap receipt</button>
            <div style={{ fontSize: 12, color: "var(--text-2, #8B92A1)", marginTop: 12 }}>Herbie extracts vendor, amount, date, and category.</div>
          </div>
        )}
        {imageUrl && phase !== "idle" && (
          <div style={{ borderRadius: 14, overflow: "hidden", background: "#000", marginBottom: 14 }}>
            <img src={imageUrl} alt="receipt" style={{ width: "100%", display: "block", maxHeight: 240, objectFit: "contain" }} />
          </div>
        )}
        {phase === "extracting" && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-2, #8B92A1)", fontSize: 13 }}>Reading the receipt…</div>
        )}
        {(phase === "review" || phase === "saving" || phase === "error") && (
          <div style={{ background: "var(--bg-2, #14171C)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Vendor" value={extraction.vendor} onChange={(v) => setExtraction({ ...extraction, vendor: v })} />
            <Row>
              <Field label="Total" type="number" value={extraction.total ?? ""} onChange={(v) => setExtraction({ ...extraction, total: v === "" ? null : Number(v) })} />
              <Field label="Currency" value={extraction.currency} onChange={(v) => setExtraction({ ...extraction, currency: v.toUpperCase() })} />
            </Row>
            <Row>
              <Field label="Date" type="date" value={extraction.purchaseDate ?? ""} onChange={(v) => setExtraction({ ...extraction, purchaseDate: v || null })} />
              <Field label="Category" value={extraction.category} onChange={(v) => setExtraction({ ...extraction, category: v })} />
            </Row>
            {extraction.lineItems.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--text-2, #8B92A1)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Line items</div>
                {extraction.lineItems.map((li, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "0.5px solid var(--border-1, #2C2C2A)" }}>
                    <span>{li.description}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{li.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {err && (
              <div style={{ background: "#4A1B0C", color: "#F5C4B3", padding: 10, borderRadius: 10, fontSize: 12 }}>{err}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={save} disabled={phase === "saving" || !extraction.vendor || extraction.total == null}
                style={{ ...primaryBtn, opacity: extraction.vendor && extraction.total != null ? 1 : 0.4 }}>
                {phase === "saving" ? "Saving…" : "Save receipt"}
              </button>
              <button onClick={reset} style={secondaryBtn}>Retake</button>
            </div>
          </div>
        )}
        {phase === "saved" && (
          <div style={{ background: "#085041", borderRadius: 14, padding: 18, textAlign: "center", marginTop: 10 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Saved</div>
            <div style={{ fontSize: 12, color: "#9FE1CB", marginTop: 4 }}>{queued > 0 ? "Queued — will sync when online" : "Posted to budget"}</div>
            <button onClick={reset} style={{ ...secondaryBtn, marginTop: 12 }}>Add another</button>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{children}</div>;
}
function Field({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--text-2, #8B92A1)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--bg-3, #1C2128)", border: "0.5px solid var(--border-1, #2C2C2A)", color: "var(--text-1, #E8EAEE)", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
    </label>
  );
}

async function resize(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", JPEG_Q);
  } finally { URL.revokeObjectURL(url); }
}

const primaryBtn: React.CSSProperties = {
  background: "var(--accent-1, #1D9E75)", color: "#E1F5EE", border: "none",
  padding: "14px 20px", borderRadius: 14, fontSize: 15, fontWeight: 500, cursor: "pointer", flex: 1,
};
const secondaryBtn: React.CSSProperties = {
  background: "transparent", color: "var(--text-2, #C7CBD1)",
  border: "0.5px solid var(--border-1, #2C2C2A)",
  padding: "14px 20px", borderRadius: 14, fontSize: 14, cursor: "pointer",
};
MRECEIPTEOF
echo "  ok client/src/pages/m-receipt.tsx"

# ==== 6. server/sprint6-routes.ts (full inline) ===============================
cat > server/sprint6-routes.ts <<'SRVEOF'
import type { Express, Request, Response } from "express";
import crypto from "crypto";
import { db } from "./db";
import { receipts, projectPhotos } from "@shared/schema";
// LLM caller — adjust the import path if the LLM service lives elsewhere in this codebase.
let askHerbie: (args: { systemPrompt: string; userImageDataUrl: string; maxTokens: number }) => Promise<string>;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  askHerbie = require("./services/herbie.service").askHerbie;
} catch {
  askHerbie = async () => { throw new Error("Herbie LLM service not wired — receipts/ocr disabled."); };
}

type ObjectStorageClient = {
  upload(opts: { bucket: string; key: string; data: Buffer; contentType?: string }): Promise<{ url: string }>;
};
let objectStorage: ObjectStorageClient | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  objectStorage = require("@replit/object-storage").default ?? null;
} catch {
  objectStorage = null;
}
const PHOTO_BUCKET = "sentinel-photos";

const idempotencySeen = new Map<string, { at: number }>();
function dedupe(key?: string): boolean {
  if (!key) return false;
  const now = Date.now();
  for (const [k, v] of idempotencySeen) if (now - v.at > 600_000) idempotencySeen.delete(k);
  if (idempotencySeen.has(key)) return true;
  idempotencySeen.set(key, { at: now });
  return false;
}

function getProjectId(req: Request): string {
  return req.params.id || req.body?.projectId || "default";
}

function clampString(s: unknown, max = 240): string {
  if (typeof s !== "string") return "";
  return s.slice(0, max);
}

const OCR_PROMPT = `You are reading a photo of a paper receipt for a US construction subcontractor.
Extract the structured fields below. Output STRICT JSON, no prose, no markdown fences.

Schema:
{
  "vendor": string,
  "total": number,
  "currency": "USD" | "CAD" | string,
  "purchaseDate": "YYYY-MM-DD" | null,
  "category": "Materials" | "Tools" | "Fuel" | "Equipment" | "Permits" | "Subcontractor" | "Meals" | "Other",
  "lineItems": [{ "description": string, "amount": number }]
}

If a field is unreadable, use null (or 0 for amounts). Pick the most likely category from the list above.`;

async function ocrReceipt(req: Request, res: Response) {
  const image = clampString(req.body?.image, 5_000_000);
  if (!image || !image.startsWith("data:image/")) {
    res.status(400).json({ error: "image (data URL) required" }); return;
  }
  try {
    const raw = await askHerbie({ systemPrompt: OCR_PROMPT, userImageDataUrl: image, maxTokens: 600 });
    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    res.json(parsed);
  } catch (e) {
    res.status(502).json({ error: "ocr failed", detail: clampString((e as Error).message, 200) });
  }
}

async function saveReceipt(req: Request, res: Response) {
  const idempKey = clampString(req.header("Idempotency-Key"), 64);
  if (dedupe(idempKey)) { res.status(409).json({ duplicate: true }); return; }
  const projectId = getProjectId(req);
  const body = req.body ?? {};
  const row = {
    id: crypto.randomUUID(),
    projectId,
    vendor: clampString(body.vendor, 200),
    total: Number(body.total) || 0,
    currency: clampString(body.currency, 8) || "USD",
    purchaseDate: typeof body.purchaseDate === "string" ? body.purchaseDate : null,
    category: clampString(body.category, 60) || "Other",
    lineItemsJson: JSON.stringify(Array.isArray(body.lineItems) ? body.lineItems : []),
    imageUrl: clampString(body.imageUrl, 5_000_000),
    createdAt: new Date(),
  };
  try {
    await (db as unknown as { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> } })
      .insert(receipts).values(row as never);
    res.json({ ok: true, id: row.id });
  } catch (e) {
    res.status(500).json({ error: "insert failed", detail: clampString((e as Error).message, 200) });
  }
}

function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string } | null {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

async function uploadPhoto(req: Request, res: Response) {
  const idempKey = clampString(req.header("Idempotency-Key"), 64);
  if (dedupe(idempKey)) { res.status(409).json({ duplicate: true }); return; }
  const projectId = getProjectId(req);
  const dataUrl = clampString(req.body?.storageUrl, 8_000_000);
  const decoded = dataUrlToBuffer(dataUrl);
  if (!decoded) { res.status(400).json({ error: "valid data URL required" }); return; }
  if (decoded.buffer.length > 6 * 1024 * 1024) {
    res.status(413).json({ error: "max 6MB" }); return;
  }
  let storedUrl = dataUrl;
  if (objectStorage) {
    const ext = decoded.mime === "image/png" ? "png" : "jpg";
    const key = projectId + "/" + Date.now() + "-" + crypto.randomBytes(6).toString("hex") + "." + ext;
    try {
      const result = await objectStorage.upload({
        bucket: PHOTO_BUCKET, key, data: decoded.buffer, contentType: decoded.mime,
      });
      storedUrl = result.url;
    } catch (e) {
      console.error("[photos/upload] object storage failed:", (e as Error).message);
    }
  }
  const row = {
    id: crypto.randomUUID(),
    projectId,
    storageUrl: storedUrl,
    caption: clampString(req.body?.caption, 240),
    pinsJson: JSON.stringify(Array.isArray(req.body?.pins) ? req.body.pins : []),
    capturedAt: new Date(Number(req.body?.capturedAt) || Date.now()),
    mimeType: clampString(req.body?.mimeType, 40) || decoded.mime,
    createdAt: new Date(),
  };
  try {
    await (db as unknown as { insert: (t: unknown) => { values: (v: unknown) => Promise<unknown> } })
      .insert(projectPhotos).values(row as never);
    res.json({ ok: true, id: row.id, url: storedUrl });
  } catch (e) {
    res.status(500).json({ error: "insert failed", detail: clampString((e as Error).message, 200) });
  }
}

export function registerSprint6Routes(app: Express): void {
  app.post("/api/receipts/ocr", ocrReceipt);
  app.post("/api/projects/:id/receipts", saveReceipt);
  app.post("/api/projects/:id/photos/upload", uploadPhoto);
}
SRVEOF
echo "  ok server/sprint6-routes.ts"

# ==== 7. Append receipts table to shared/schema.ts (idempotent) ==============
if ! grep -q "export const receipts" shared/schema.ts 2>/dev/null; then
  cat >> shared/schema.ts <<'SCHEOF'

// Sprint 6: receipts table (OCR + manual review + budget posting)
export const receipts = pgTable("receipts", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull(),
  vendor: text("vendor").notNull(),
  total: doublePrecision("total").notNull(),
  currency: text("currency").notNull().default("USD"),
  purchaseDate: text("purchase_date"),
  category: text("category").notNull().default("Other"),
  lineItemsJson: text("line_items_json").notNull().default("[]"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
SCHEOF
  echo "  appended receipts to shared/schema.ts"
fi

# Ensure doublePrecision is imported from drizzle
if ! grep -q "doublePrecision" shared/schema.ts; then
  python3 - <<'PYEOF'
import re
p = "shared/schema.ts"
s = open(p).read()
s = re.sub(r"\{([^}]+)\} from \"drizzle-orm/pg-core\"",
           lambda m: "{ " + m.group(1).strip().rstrip(",") + ", doublePrecision } from \"drizzle-orm/pg-core\"",
           s, count=1)
open(p, "w").write(s)
print("added doublePrecision import")
PYEOF
fi

# Create receipts table directly via SQL (skip Drizzle interactive)
if [ -n "${DATABASE_URL:-}" ]; then
  echo "==> Creating receipts table (idempotent SQL)"
  cat > /tmp/sprint6.sql <<'SQLEOF'
CREATE TABLE IF NOT EXISTS receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  vendor text NOT NULL,
  total double precision NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  purchase_date text,
  category text NOT NULL DEFAULT 'Other',
  line_items_json text NOT NULL DEFAULT '[]',
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
SQLEOF
  if command -v psql >/dev/null 2>&1; then
    psql "$DATABASE_URL" -f /tmp/sprint6.sql || echo "  (psql failed — table may already exist or DB not reachable)"
  else
    node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL});require('fs').readFileSync('/tmp/sprint6.sql','utf8').split(';').filter(s=>s.trim()).forEach(s=>p.query(s).catch(e=>console.error(e.message)));setTimeout(()=>p.end(),3000);" || echo "  (node pg fallback skipped)"
  fi
fi

# ==== 8. Patch server/index.ts to register sprint6 routes ====================
if ! grep -q "registerSprint6Routes" server/index.ts; then
  python3 - <<'PYEOF'
import re
p = "server/index.ts"
s = open(p).read()
lines = s.split("\n")
last_import = max(i for i,l in enumerate(lines) if l.startswith("import "))
lines.insert(last_import + 1, 'import { registerSprint6Routes } from "./sprint6-routes";')
s = "\n".join(lines)
patched = False
for anchor in ["registerSprint4Routes(app)", "registerSprint3Routes(app)"]:
    if anchor in s and "registerSprint6Routes(app)" not in s:
        s = s.replace(anchor, anchor + ";\nregisterSprint6Routes(app)", 1)
        patched = True
        break
if not patched and "registerSprint6Routes(app)" not in s:
    # last resort: insert before final app.listen
    s = re.sub(r"(app\.listen)", "registerSprint6Routes(app);\n\\1", s, count=1)
open(p, "w").write(s)
print("server/index.ts patched")
PYEOF
fi

# ==== 9. Patch client/src/main.tsx to call initTheme() =======================
if ! grep -q "initTheme" client/src/main.tsx; then
  python3 - <<'PYEOF'
import re
p = "client/src/main.tsx"
s = open(p).read()
lines = s.split("\n")
last_import = max(i for i,l in enumerate(lines) if l.startswith("import "))
lines.insert(last_import + 1, 'import { initTheme } from "./lib/theme";')
s = "\n".join(lines)
if "initTheme();" not in s:
    s = re.sub(r"(createRoot\([^)]+\)\.render)", "initTheme();\n\\1", s, count=1)
open(p, "w").write(s)
print("main.tsx patched")
PYEOF
fi

# ==== 10. Patch client/src/App.tsx — add /projects/:id/receipt route ========
if ! grep -q "MobileReceiptPage" client/src/App.tsx; then
  python3 - <<'PYEOF'
import re
p = "client/src/App.tsx"
s = open(p).read()
# Add lazy import after another mobile lazy import
if "MobileReceiptPage" not in s:
    if "MobilePhotosPage" in s:
        s = s.replace(
            'const MobilePhotosPage = lazy(() => import("./pages/m-photos"));',
            'const MobilePhotosPage = lazy(() => import("./pages/m-photos"));\nconst MobileReceiptPage = lazy(() => import("./pages/m-receipt"));',
            1
        )
    elif "MobileHomePage" in s:
        s = s.replace(
            'const MobileHomePage = lazy(() => import("./pages/m-home"));',
            'const MobileHomePage = lazy(() => import("./pages/m-home"));\nconst MobileReceiptPage = lazy(() => import("./pages/m-receipt"));',
            1
        )
# Add route
if '/projects/:id/receipt' not in s and 'MobileReceiptPage' in s:
    if 'm-photos' in s:
        s = re.sub(r'(<Route path="/projects/:id/m-photos"[^/]*?/>)',
                   r'\1\n          <Route path="/projects/:id/receipt" component={MobileReceiptPage} />',
                   s, count=1)
open(p, "w").write(s)
print("App.tsx patched")
PYEOF
fi

# ==== 11. Best-effort install Object Storage (no fail) =======================
echo "==> npm i @replit/object-storage (best-effort)"
npm i @replit/object-storage --save 2>&1 | tail -3 || echo "  (skipped, server will fall back to data URLs)"

# ==== 12. Build ===============================================================
echo "==> npm run build"
npm run build 2>&1 | tail -25
echo "==> Sprint 6+7 apply COMPLETE. Click Republish in the Production panel."
