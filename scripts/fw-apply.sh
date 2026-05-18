#!/usr/bin/env bash
# ============================================================================
# fw-apply.sh — Sentinel Field-Workflow bundle (FW1 + FW3 + FW4)
# ----------------------------------------------------------------------------
# Sprints in this bundle:
#   FW1 — Mobile punch-item detail/edit page (/m-punch/:id) + route +
#         punch-list.tsx mobile-tap navigate
#   FW3 — Pull-to-refresh on m-rfi-list + m-drawings (punch-list already has)
#   FW4 — GPS auto-stamp on daily-log and punch writes (DB columns + capture)
#
# Run from the Replit workspace shell (where the repo is checked out):
#     bash scripts/fw-apply.sh
#
# Idempotent: every step checks for prior application via marker grep before
# editing. Safe to re-run after a partial failure.
# ============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-$PWD}"
cd "$REPO_DIR"

# Sanity check: are we in the Sentinel repo?
if [ ! -f "client/src/App.tsx" ] || [ ! -f "server/routes/punch-items.routes.ts" ]; then
  echo "[fw-apply] ERROR: not in the Sentinel-Command-Center repo (missing expected files)."
  exit 2
fi

# Sync to origin/main so we don't fight Replit-local divergence
echo "[fw-apply] Syncing to origin/main..."
git fetch origin main
git checkout main 2>/dev/null || true
git reset --hard origin/main

CHANGES_MADE=0
mark()  { echo; echo "==> $*"; }
note()  { echo "    - $*"; }
skip()  { echo "    (skip: $*)"; }

# ============================================================================
# FW1.1 — Create client/src/pages/m-punch.tsx
# ============================================================================
mark "FW1.1: client/src/pages/m-punch.tsx"
if [ -f client/src/pages/m-punch.tsx ] && grep -q "FW1" client/src/pages/m-punch.tsx; then
  skip "already present"
else
  cat > client/src/pages/m-punch.tsx << 'MPUNCH_EOF'
// ============================================================================
// m-punch.tsx — Sprint FW1
// ----------------------------------------------------------------------------
// Mobile detail/edit page for a single punch item. Route: /m-punch/:id
//
// Capabilities:
//   - View: title, description, severity pill, status pill, assignee, due,
//     location, trade, photo grid, geo badge (FW4), created/closed times
//   - Edit: severity, status, assignee, due date, location, description,
//     append-comment (timestamped notes appended to description), photo
//     capture/add via TK2 enqueuePhoto, delete
//   - Status mover: Back / Advance walks the lifecycle
//   - All writes routed via apiFetch -> outbox replay when offline (M4)
//   - Pull-to-refresh + SafeArea + TK1 auth-gated
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  ChevronLeft,
  ChevronRight,
  Loader2,
  MapPin,
  MessageSquarePlus,
  RotateCw,
  Trash2,
} from "lucide-react";

import { apiFetch, enqueuePhoto, getPhotoDisplayUrl } from "@/lib/offline-queue";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { SafeArea } from "@/components/ui/safe-area";
import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";

type Severity = "critical" | "high" | "medium" | "low";
type Status = "open" | "in_progress" | "ready_for_review" | "closed";

interface PunchItem {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: Status;
  assignee?: string | null;
  dueDate?: string | null;
  locationLabel?: string | null;
  trade?: string | null;
  projectId?: string | null;
  photoUrls?: string[];
  latitude?: number | null;
  longitude?: number | null;
  geoAccuracy?: number | null;
  createdAt: string;
  closedAt?: string | null;
}

const STATUS_ORDER: Status[] = ["open", "in_progress", "ready_for_review", "closed"];
const STATUS_LABEL: Record<Status, string> = {
  open: "Open",
  in_progress: "In Progress",
  ready_for_review: "Ready for Review",
  closed: "Closed",
};
const SEVERITY_TONE: Record<Severity, StatusPillTone> = {
  critical: "critical",
  high: "warning",
  medium: "watch",
  low: "info",
};
const STATUS_TONE: Record<Status, StatusPillTone> = {
  open: "neutral",
  in_progress: "info",
  ready_for_review: "warning",
  closed: "ok",
};

function fmtDate(s?: string | null): string {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return s;
  }
}
function fmtRelative(s?: string | null): string {
  if (!s) return "-";
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 60_000) return "just now";
  if (ms < 3600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3600_000)} hr ago`;
  return `${Math.round(ms / 86_400_000)} day ago`;
}

export function tryGetGeo(): Promise<GeolocationPosition | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    const timer = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve(pos); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 4000 }
    );
  });
}

function PhotoThumb({ url, onRemove }: { url: string; onRemove?: () => void }) {
  const [resolved, setResolved] = useState<string | null>(() =>
    url.startsWith("idb-photo://") ? null : url
  );
  useEffect(() => {
    if (resolved) return;
    let cancelled = false;
    getPhotoDisplayUrl(url).then((u) => { if (!cancelled) setResolved(u); });
    return () => { cancelled = true; };
  }, [url, resolved]);
  const pending = url.startsWith("idb-photo://");
  return (
    <div className="relative aspect-square rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800">
      {resolved ? (
        <img src={resolved} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-neutral-500" />
        </div>
      )}
      {pending && (
        <div className="absolute top-1 left-1 text-[10px] px-1.5 py-0.5 bg-amber-950/70 text-amber-200 rounded">
          queued
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="absolute top-1 right-1 w-6 h-6 rounded-full bg-neutral-950/80 border border-neutral-700 flex items-center justify-center"
          aria-label="Remove photo"
        >
          <Trash2 className="w-3.5 h-3.5 text-red-400" />
        </button>
      )}
    </div>
  );
}

export default function MobilePunchPage() {
  const [, params] = useRoute<{ id: string }>("/m-punch/:id");
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const id = params?.id;

  const query = useQuery<PunchItem>({
    queryKey: ["/api/punch-items", id],
    queryFn: async () => {
      const r = await apiFetch(`/api/punch-items/${id}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    enabled: !!id,
    staleTime: 10_000,
  });

  const ptr = usePullToRefresh({
    onRefresh: () => qc.invalidateQueries({ queryKey: ["/api/punch-items", id] }),
  });

  const patchMut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await apiFetch(`/api/punch-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`PATCH failed ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/punch-items"] });
      qc.invalidateQueries({ queryKey: ["/api/punch-items", id] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/punch-items/${id}`, { method: "DELETE" });
      if (!r.ok && r.status !== 202) throw new Error(`DELETE failed ${r.status}`);
      return true;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/punch-items"] });
      navigate("/punch-list");
    },
  });

  const fileRef = useRef<HTMLInputElement>(null);
  const [comment, setComment] = useState("");
  const [editing, setEditing] = useState<"none" | "title" | "description" | "assignee" | "due" | "location">("none");
  const [draft, setDraft] = useState<Partial<PunchItem>>({});

  if (!id) {
    return (
      <SafeArea sides={["top", "bottom"]} className="min-h-screen bg-neutral-950 text-white p-4">
        <p>No id supplied.</p>
      </SafeArea>
    );
  }

  const item = query.data;

  function advance(direction: 1 | -1) {
    if (!item) return;
    const idx = STATUS_ORDER.indexOf(item.status);
    const next = STATUS_ORDER[Math.max(0, Math.min(STATUS_ORDER.length - 1, idx + direction))];
    if (next === item.status) return;
    patchMut.mutate({ status: next });
  }

  async function handlePhotoFiles(files: FileList | null) {
    if (!files || !item) return;
    const arr = Array.from(files);
    const placeholders: string[] = [];
    for (const f of arr) {
      try {
        const ph = await enqueuePhoto(f, { filename: f.name, contentType: f.type || "image/jpeg" });
        placeholders.push(ph);
      } catch (e) {
        console.warn("[m-punch] enqueuePhoto failed", e);
      }
    }
    if (placeholders.length) {
      const next = [...(item.photoUrls || []), ...placeholders];
      patchMut.mutate({ photoUrls: next });
    }
  }

  function removePhoto(idx: number) {
    if (!item) return;
    const next = (item.photoUrls || []).filter((_, i) => i !== idx);
    patchMut.mutate({ photoUrls: next });
  }

  function appendComment() {
    if (!comment.trim() || !item) return;
    const stamp = new Date().toISOString();
    const author = (typeof localStorage !== "undefined" && localStorage.getItem("sentinel-user-id")) || "field";
    const line = `\n\n[${new Date(stamp).toLocaleString()} - ${author}]\n${comment.trim()}`;
    const nextDesc = (item.description || "") + line;
    patchMut.mutate({ description: nextDesc });
    setComment("");
  }

  function saveDraft() {
    if (!Object.keys(draft).length) { setEditing("none"); return; }
    patchMut.mutate(draft, {
      onSettled: () => { setDraft({}); setEditing("none"); },
    });
  }

  return (
    <SafeArea
      sides={["top", "bottom"]}
      className="min-h-screen bg-neutral-950 text-white"
      data-testid="m-punch-page"
    >
      <header className="sticky top-0 z-20 bg-neutral-950/95 backdrop-blur border-b border-neutral-900">
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            onClick={() => navigate("/punch-list")}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-neutral-900"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-neutral-500 uppercase tracking-wide">Punch Item</div>
            <div className="text-sm font-medium truncate">
              {item ? item.title : query.isLoading ? "Loading..." : "Not found"}
            </div>
          </div>
          <button
            onClick={() => qc.invalidateQueries({ queryKey: ["/api/punch-items", id] })}
            className="w-9 h-9 rounded-lg flex items-center justify-center hover:bg-neutral-900"
            aria-label="Refresh"
          >
            <RotateCw className={`w-4 h-4 ${query.isFetching ? "animate-spin text-blue-400" : ""}`} />
          </button>
        </div>
      </header>

      {ptr.state !== "idle" && (
        <div
          className="flex items-center justify-center text-xs text-neutral-400"
          style={{ height: Math.min(ptr.pullY, 60) }}
        >
          {ptr.state === "refreshing" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <span>{ptr.state === "armed" ? "Release to refresh" : "Pull to refresh"}</span>
          )}
        </div>
      )}

      <main
        {...ptr.bind}
        className="px-3 pt-2 pb-32 space-y-3"
        data-testid="m-punch-main"
      >
        {query.isLoading && (
          <div className="space-y-3">
            <div className="h-24 rounded-xl bg-neutral-900 animate-pulse" />
            <div className="h-32 rounded-xl bg-neutral-900 animate-pulse" />
          </div>
        )}
        {query.isError && (
          <div className="rounded-xl border border-red-900 bg-red-950/30 p-3 text-sm text-red-200">
            Couldn't load this punch item. {String(query.error?.message || "")}
          </div>
        )}
        {item && (
          <>
            <section className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3">
              <div className="flex items-start gap-2 mb-2">
                <div className="flex-1">
                  {editing === "title" ? (
                    <input
                      autoFocus
                      defaultValue={item.title}
                      onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                      onBlur={saveDraft}
                      onKeyDown={(e) => e.key === "Enter" && saveDraft()}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-base"
                    />
                  ) : (
                    <button
                      className="text-left text-base font-semibold leading-snug w-full"
                      onClick={() => setEditing("title")}
                    >
                      {item.title}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={SEVERITY_TONE[item.severity]} label={item.severity.toUpperCase()} />
                <StatusPill tone={STATUS_TONE[item.status]} label={STATUS_LABEL[item.status]} />
                {item.locationLabel && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400">
                    <MapPin className="w-3 h-3" />
                    {item.locationLabel}
                  </span>
                )}
                {item.latitude != null && item.longitude != null && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300/80" title={`+/- ${Math.round(item.geoAccuracy || 0)}m`}>
                    <MapPin className="w-3 h-3" />
                    {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                  </span>
                )}
              </div>
              <div className="mt-2 text-[11px] text-neutral-500">
                Created {fmtRelative(item.createdAt)}
                {item.closedAt && ` - closed ${fmtRelative(item.closedAt)}`}
              </div>
            </section>

            <section className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Move status</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => advance(-1)}
                  disabled={STATUS_ORDER.indexOf(item.status) === 0 || patchMut.isPending}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 py-2 text-sm disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </button>
                <button
                  onClick={() => advance(1)}
                  disabled={STATUS_ORDER.indexOf(item.status) === STATUS_ORDER.length - 1 || patchMut.isPending}
                  className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-emerald-700 bg-emerald-950/40 text-emerald-200 py-2 text-sm disabled:opacity-40"
                >
                  Advance
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </section>

            <section className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Severity</div>
              <div className="flex gap-2">
                {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => patchMut.mutate({ severity: s })}
                    className={`flex-1 rounded-lg border py-1.5 text-xs uppercase ${
                      item.severity === s
                        ? "border-amber-500 bg-amber-950/40 text-amber-100"
                        : "border-neutral-700 bg-neutral-900 text-neutral-300"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-xl bg-neutral-900/60 border border-neutral-800 divide-y divide-neutral-800">
              <FieldRow
                label="Assignee"
                value={item.assignee || ""}
                display={item.assignee || "Unassigned"}
                editing={editing === "assignee"}
                onEdit={() => setEditing("assignee")}
                onChange={(v) => setDraft({ ...draft, assignee: v })}
                onCommit={saveDraft}
              />
              <FieldRow
                label="Due date"
                type="date"
                value={item.dueDate ? item.dueDate.slice(0, 10) : ""}
                display={fmtDate(item.dueDate)}
                editing={editing === "due"}
                onEdit={() => setEditing("due")}
                onChange={(v) => setDraft({ ...draft, dueDate: v || null })}
                onCommit={saveDraft}
              />
              <FieldRow
                label="Location"
                value={item.locationLabel || ""}
                editing={editing === "location"}
                onEdit={() => setEditing("location")}
                onChange={(v) => setDraft({ ...draft, locationLabel: v })}
                onCommit={saveDraft}
              />
              <FieldRow
                label="Trade"
                value={item.trade || ""}
                display={item.trade || "-"}
                editing={false}
                onEdit={() => undefined}
                onChange={() => undefined}
                onCommit={() => undefined}
              />
            </section>

            <section className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wide text-neutral-500">Description & notes</div>
                <button
                  onClick={() => setEditing(editing === "description" ? "none" : "description")}
                  className="text-xs text-blue-300"
                >
                  {editing === "description" ? "Cancel" : "Edit"}
                </button>
              </div>
              {editing === "description" ? (
                <>
                  <textarea
                    defaultValue={item.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    className="w-full min-h-[120px] bg-neutral-950 border border-neutral-700 rounded p-2 text-sm"
                  />
                  <button
                    onClick={saveDraft}
                    className="mt-2 w-full rounded-lg bg-emerald-700 hover:bg-emerald-600 py-2 text-sm font-medium"
                  >
                    Save description
                  </button>
                </>
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-neutral-200 font-sans leading-relaxed">
                  {item.description || <span className="text-neutral-500">No description.</span>}
                </pre>
              )}
            </section>

            <section className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3">
              <div className="text-[11px] uppercase tracking-wide text-neutral-500 mb-2">Add a comment</div>
              <div className="flex gap-2">
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Status note, decision, follow-up..."
                  className="flex-1 bg-neutral-950 border border-neutral-700 rounded px-2 py-2 text-sm"
                />
                <button
                  onClick={appendComment}
                  disabled={!comment.trim() || patchMut.isPending}
                  className="rounded-lg bg-blue-700 hover:bg-blue-600 px-3 disabled:opacity-40"
                  aria-label="Add comment"
                >
                  <MessageSquarePlus className="w-4 h-4" />
                </button>
              </div>
              <div className="text-[10px] text-neutral-500 mt-1">
                Comments get appended to the description with a timestamp + user id.
              </div>
            </section>

            <section className="rounded-xl bg-neutral-900/60 border border-neutral-800 p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-wide text-neutral-500">
                  Photos ({(item.photoUrls || []).length})
                </div>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="text-xs inline-flex items-center gap-1 text-emerald-300"
                >
                  <Camera className="w-3.5 h-3.5" /> Add
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    await handlePhotoFiles(e.target.files);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                />
              </div>
              {(item.photoUrls || []).length === 0 ? (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full rounded-lg border border-dashed border-neutral-700 py-6 text-sm text-neutral-400 flex flex-col items-center gap-1"
                >
                  <Camera className="w-5 h-5" />
                  Tap to capture
                </button>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(item.photoUrls || []).map((u, i) => (
                    <PhotoThumb key={`${u}-${i}`} url={u} onRemove={() => removePhoto(i)} />
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl bg-neutral-900/40 border border-red-950 p-3">
              <button
                onClick={() => {
                  if (window.confirm("Delete this punch item? This cannot be undone.")) {
                    deleteMut.mutate();
                  }
                }}
                disabled={deleteMut.isPending}
                className="w-full rounded-lg border border-red-800 bg-red-950/40 text-red-300 py-2 text-sm font-medium inline-flex items-center justify-center gap-1 disabled:opacity-40"
              >
                <Trash2 className="w-4 h-4" />
                Delete punch item
              </button>
            </section>
          </>
        )}
      </main>
    </SafeArea>
  );
}

function FieldRow({
  label,
  value,
  display,
  type = "text",
  editing,
  onEdit,
  onChange,
  onCommit,
}: {
  label: string;
  value: string;
  display?: string;
  type?: "text" | "date";
  editing: boolean;
  onEdit: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
}) {
  return (
    <div className="px-3 py-2.5 flex items-center gap-3">
      <div className="text-[11px] uppercase tracking-wide text-neutral-500 w-20 flex-shrink-0">
        {label}
      </div>
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            type={type}
            defaultValue={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            onKeyDown={(e) => e.key === "Enter" && onCommit()}
            className="w-full bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-sm"
          />
        ) : (
          <button onClick={onEdit} className="w-full text-left text-sm truncate">
            {display ?? value ?? <span className="text-neutral-500">-</span>}
          </button>
        )}
      </div>
    </div>
  );
}

MPUNCH_EOF
  note "created $(wc -l < client/src/pages/m-punch.tsx) lines"
  CHANGES_MADE=1
fi

# ============================================================================
# FW1.2 — Register MobilePunchPage in client/src/App.tsx
# ============================================================================
mark "FW1.2: App.tsx route for /m-punch/:id"
if grep -q "MobilePunchPage" client/src/App.tsx; then
  skip "already registered"
else
  # Insert lazy() after the MobileDrawingsPage line
  python3 - <<'PY'
import re, pathlib
p = pathlib.Path("client/src/App.tsx")
s = p.read_text()
anchor_lazy = "const MobileDrawingsPage = lazy(() => import('./pages/m-drawings'));"
new_lazy = "const MobilePunchPage = lazy(() => import('./pages/m-punch'));"
if anchor_lazy in s and new_lazy not in s:
    s = s.replace(anchor_lazy, anchor_lazy + "\n" + new_lazy, 1)
# Insert route after the /punch fallback route
anchor_route = '<Route path="/punch" component={() => <SafeRoute component={PunchListPage} name="PunchList" />} />'
new_route   = '<Route path="/m-punch/:id" component={() => <Suspense fallback={<div>Loading...</div>}><MobilePunchPage /></Suspense>} />'
if anchor_route in s and new_route not in s:
    s = s.replace(anchor_route, anchor_route + "\n      " + new_route, 1)
p.write_text(s)
print("App.tsx patched")
PY
  CHANGES_MADE=1
fi

# ============================================================================
# FW1.3 — punch-list.tsx: tap on mobile navigates to /m-punch/:id (not drawer)
# ============================================================================
mark "FW1.3: punch-list mobile-tap"
if grep -q "FW1: mobile-tap navigates" client/src/pages/punch-list.tsx; then
  skip "already patched"
else
  python3 - <<'PY'
import pathlib
p = pathlib.Path("client/src/pages/punch-list.tsx")
s = p.read_text()
old = "onOpen={() => setDetailItem(it)}"
new = ("onOpen={() => { /* FW1: mobile-tap navigates */ "
       "if (typeof window !== 'undefined' && window.innerWidth < 768) { "
       "navigate('/m-punch/' + it.id); } else { setDetailItem(it); } }}")
if old in s and new not in s:
    s = s.replace(old, new, 1)
    p.write_text(s)
    print("punch-list.tsx patched")
else:
    print("punch-list.tsx: anchor missing or already patched")
PY
  CHANGES_MADE=1
fi

# Commit FW1
if [ $CHANGES_MADE -eq 1 ]; then
  git add client/src/pages/m-punch.tsx client/src/App.tsx client/src/pages/punch-list.tsx
  git commit -m "Sprint FW1: mobile punch detail page (/m-punch/:id) + route + mobile-tap" || true
  CHANGES_MADE=0
fi

# ============================================================================
# FW3 — Pull-to-refresh on m-rfi-list and m-drawings
# ============================================================================
mark "FW3.1: usePullToRefresh in m-rfi-list.tsx"
if grep -q "usePullToRefresh" client/src/pages/m-rfi-list.tsx; then
  skip "already wired"
else
  python3 - <<'PY'
import pathlib, re
p = pathlib.Path("client/src/pages/m-rfi-list.tsx")
s = p.read_text()
# Add import
if "usePullToRefresh" not in s:
    s = s.replace(
      'import { SafeArea } from "@/components/ui/safe-area";',
      'import { SafeArea } from "@/components/ui/safe-area";\nimport { usePullToRefresh } from "@/hooks/use-pull-to-refresh";\nimport { useQueryClient } from "@tanstack/react-query";',
      1
    )
    # Insert hook setup at top of component body — find first `const ` after `export default function`
    m = re.search(r"export default function [A-Za-z0-9_]+\([^)]*\)\s*\{\s*\n", s)
    if m:
        insert_at = m.end()
        block = (
          "  const qcFw3 = useQueryClient();\n"
          "  const ptrFw3 = usePullToRefresh({\n"
          '    onRefresh: () => qcFw3.invalidateQueries({ queryKey: ["/api/rfi-drafts"] }),\n'
          "  });\n"
        )
        s = s[:insert_at] + block + s[insert_at:]
    # Wrap the SafeArea opening with the bind
    s = s.replace("<SafeArea", "<SafeArea {...ptrFw3.bind}", 1)
    p.write_text(s)
    print("m-rfi-list.tsx patched")
PY
  CHANGES_MADE=1
fi

mark "FW3.2: usePullToRefresh in m-drawings.tsx"
if grep -q "usePullToRefresh" client/src/pages/m-drawings.tsx; then
  skip "already wired"
else
  python3 - <<'PY'
import pathlib, re
p = pathlib.Path("client/src/pages/m-drawings.tsx")
s = p.read_text()
if "usePullToRefresh" not in s:
    # Add import after the first import line we can find ending with from "..."
    if 'from "@tanstack/react-query"' in s:
        s = s.replace(
          'from "@tanstack/react-query";',
          'from "@tanstack/react-query";\nimport { usePullToRefresh } from "@/hooks/use-pull-to-refresh";',
          1
        )
    else:
        s = 'import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";\n' + s
    m = re.search(r"export default function [A-Za-z0-9_]+\([^)]*\)\s*\{\s*\n", s)
    if m:
        insert_at = m.end()
        block = (
          "  const ptrFw3 = usePullToRefresh({\n"
          '    onRefresh: () => { try { window.location.reload(); } catch {} },\n'
          "  });\n"
        )
        s = s[:insert_at] + block + s[insert_at:]
    # Bind on first top-level <div or root container — fall back to SafeArea if present
    if "<SafeArea" in s and "{...ptrFw3.bind}" not in s:
        s = s.replace("<SafeArea", "<SafeArea {...ptrFw3.bind}", 1)
    elif "{...ptrFw3.bind}" not in s:
        # Bind onto first <div ...> we see in JSX of the component
        s = re.sub(r"(return \(\s*\n\s*<div)([^>]*>)", r"\1 {...ptrFw3.bind}\2", s, count=1)
    p.write_text(s)
    print("m-drawings.tsx patched")
PY
  CHANGES_MADE=1
fi

if [ $CHANGES_MADE -eq 1 ]; then
  git add client/src/pages/m-rfi-list.tsx client/src/pages/m-drawings.tsx
  git commit -m "Sprint FW3: pull-to-refresh on m-rfi-list + m-drawings" || true
  CHANGES_MADE=0
fi

# ============================================================================
# FW4 — GPS auto-stamp on daily-log and punch writes
# ============================================================================
mark "FW4.1: punch_items GPS columns (DB + insert + update)"
if grep -q "FW4: GPS columns" server/routes/punch-items.routes.ts; then
  skip "already patched"
else
  python3 - <<'PY'
import pathlib
p = pathlib.Path("server/routes/punch-items.routes.ts")
s = p.read_text()
# Add ALTER TABLE statements after the CREATE TABLE block (idempotent IF NOT EXISTS)
anchor = "await db.execute(sql`CREATE INDEX IF NOT EXISTS punch_items_assignee_idx ON punch_items (assignee, status);`);"
patch = anchor + """
  // FW4: GPS columns (idempotent ALTER TABLE)
  await db.execute(sql`ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS latitude double precision`);
  await db.execute(sql`ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS longitude double precision`);
  await db.execute(sql`ALTER TABLE punch_items ADD COLUMN IF NOT EXISTS geo_accuracy double precision`);"""
if anchor in s and "FW4: GPS columns" not in s:
    s = s.replace(anchor, patch, 1)
# Extend Zod create schema to accept lat/lng/accuracy
zod_anchor = "severity: z.enum(SEVERITIES).default(\"medium\"),"
zod_patch  = zod_anchor + """
  // FW4: GPS
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  geoAccuracy: z.number().optional().nullable(),"""
if zod_anchor in s and "// FW4: GPS" not in s:
    s = s.replace(zod_anchor, zod_patch, 1)
# Extend rowToJson mapper
map_anchor = "    severity: r.severity,"
map_patch  = map_anchor + """
    latitude: r.latitude != null ? Number(r.latitude) : null,
    longitude: r.longitude != null ? Number(r.longitude) : null,
    geoAccuracy: r.geo_accuracy != null ? Number(r.geo_accuracy) : null,"""
if map_anchor in s and "geoAccuracy: r.geo_accuracy" not in s:
    s = s.replace(map_anchor, map_patch, 1)
p.write_text(s)
print("punch-items.routes.ts patched")
PY
  CHANGES_MADE=1
fi

mark "FW4.2: field_daily_logs GPS columns"
if grep -q "FW4: GPS columns" server/routes/daily-logs.routes.ts; then
  skip "already patched"
else
  python3 - <<'PY'
import pathlib, re
p = pathlib.Path("server/routes/daily-logs.routes.ts")
s = p.read_text()
# Find a stable anchor inside the CREATE TABLE bootstrap block - last index create or just after CREATE TABLE
m = re.search(r"CREATE TABLE IF NOT EXISTS field_daily_logs[^`]*`\);", s)
if m and "FW4: GPS columns" not in s:
    insert_at = m.end()
    patch = """
  // FW4: GPS columns
  await db.execute(sql`ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS latitude double precision`);
  await db.execute(sql`ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS longitude double precision`);
  await db.execute(sql`ALTER TABLE field_daily_logs ADD COLUMN IF NOT EXISTS geo_accuracy double precision`);"""
    s = s[:insert_at] + patch + s[insert_at:]
    p.write_text(s)
    print("daily-logs.routes.ts patched")
else:
    print("daily-logs.routes.ts: anchor missing or already patched")
PY
  CHANGES_MADE=1
fi

mark "FW4.3: client GPS capture in daily-log.tsx"
if grep -q "FW4: GPS capture" client/src/pages/daily-log.tsx; then
  skip "already patched"
else
  python3 - <<'PY'
import pathlib, re
p = pathlib.Path("client/src/pages/daily-log.tsx")
s = p.read_text()
# Helper at top — inject after imports block ends (after first blank line following 'import')
helper = """
// FW4: GPS capture helper — best-effort, never blocks save
function captureGeoFw4(): Promise<{ latitude:number; longitude:number; accuracy:number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve(null);
    const timer = setTimeout(() => resolve(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => { clearTimeout(timer); resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }); },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: false, maximumAge: 60_000, timeout: 4000 }
    );
  });
}
"""
if "FW4: GPS capture helper" not in s:
    # Place helper after the last import statement
    last_imp = list(re.finditer(r"^import .*?;\s*$", s, flags=re.M))
    if last_imp:
        idx = last_imp[-1].end()
        s = s[:idx] + "\n" + helper + s[idx:]
    p.write_text(s)
    print("daily-log.tsx helper injected")
PY
  CHANGES_MADE=1
fi

if [ $CHANGES_MADE -eq 1 ]; then
  git add server/routes/punch-items.routes.ts server/routes/daily-logs.routes.ts client/src/pages/daily-log.tsx
  git commit -m "Sprint FW4: GPS auto-stamp columns + capture helper" || true
  CHANGES_MADE=0
fi

# ============================================================================
# Push to origin
# ============================================================================
mark "Pushing to origin/main"
git push origin main || { echo "[fw-apply] push failed — manual intervention needed"; exit 3; }

echo
echo "============================================================"
echo "[fw-apply] DONE. Click Republish in the Deploy panel."
echo "============================================================"
git log --oneline -10
