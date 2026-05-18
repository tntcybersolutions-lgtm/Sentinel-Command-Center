import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import { apiFetch } from "@/lib/offline-queue";
import { DrawingMarkupOverlay, DrawingMarkupToolbar, useMarkupStorage, type MarkupTool } from "@/components/drawing-markup-canvas";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
// Bundle the pdf.js worker as a same-origin asset so the service worker can
// cache it for offline drawing viewing. The previous CDN URL (unpkg.com) is
// cross-origin and explicitly skipped by sw.js, which would break offline.
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface Drawing {
  id: string;
  projectId: string;
  title: string;
  sheet: string | null;
  discipline: string | null;
  fileUrl: string;
  pageCount: number | null;
  createdAt: string;
}
interface DrawingPin {
  id: string;
  drawingId: string;
  page: number;
  x: string | number;
  y: string | number;
  label: string | null;
  linkType: string | null;
  linkId: string | null;
  createdAt: string;
}
interface RfiRow { id: string; rfiNumber?: string | number; subject?: string; }
interface PhotoRow { id: string; caption?: string | null; takenAt?: string; createdAt?: string; }
interface PunchRow { id: string; itemNumber?: string | number; title?: string; description?: string; }

type LinkType = "RFI" | "Photo" | "Punch" | "Submittal";
const LINK_TYPES: LinkType[] = ["RFI", "Photo", "Punch", "Submittal"];

// Sprint M5 — thin wrapper so we can call useMarkupStorage(drawingId)
// without hoisting that hook into the main page (which would re-run on every
// drawing switch and re-read localStorage unnecessarily).
function DrawingMarkupToolbarHost({
  drawingId, tool, setTool, page,
}: { drawingId: string; tool: MarkupTool; setTool: (t: MarkupTool) => void; page: number }) {
  const { clearPage } = useMarkupStorage(drawingId);
  return <DrawingMarkupToolbar tool={tool} setTool={setTool} onClearPage={() => clearPage(page)} page={page} />;
}

export default function MobileDrawingsPage() {
  const [match, params] = useRoute("/projects/:id/drawings");
  const projectId = (match && params?.id) || "default";
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pinDraft, setPinDraft] = useState<{ x: number; y: number } | null>(null);
  const [linkType, setLinkType] = useState<LinkType>("RFI");
  const [linkId, setLinkId] = useState<string>("");
  const [linkLabel, setLinkLabel] = useState("");
  const [pdfWidth, setPdfWidth] = useState(360);
  // Sprint M5 — markup tool state + storage; "select" lets existing pin-drop/zoom logic pass through unchanged.
  const [markupTool, setMarkupTool] = useState<MarkupTool>("select");
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // ── Pinch-zoom + pan state ─────────────────────────────────────────────────
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const gestureRef = useRef<{
    pinchStartDist: number;
    pinchStartScale: number;
    panStart: { x: number; y: number } | null;
    panOrigin: { x: number; y: number };
    lastTouchEnd: number;
  }>({ pinchStartDist: 0, pinchStartScale: 1, panStart: null, panOrigin: { x: 0, y: 0 }, lastTouchEnd: 0 });

  useEffect(() => {
    const update = () => {
      const w = wrapperRef.current?.getBoundingClientRect().width;
      if (w && w > 60) setPdfWidth(Math.round(w));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [selectedId]);

  // Reset pan/zoom when changing drawing or page.
  useEffect(() => { setScale(1); setPan({ x: 0, y: 0 }); }, [selectedId, page]);

  const drawingsQ = useQuery<Drawing[]>({
    queryKey: ["/api/projects", projectId, "drawings"],
    queryFn: async () => {
      const r = await apiFetch(`/api/projects/${projectId}/drawings`);
      if (!r.ok) return [];
      return (await r.json()) as Drawing[];
    },
  });
  const drawings = drawingsQ.data ?? [];
  const selected = drawings.find((d) => d.id === selectedId) || drawings[0] || null;

  useEffect(() => {
    if (!selectedId && drawings.length > 0) setSelectedId(drawings[0].id);
  }, [drawings, selectedId]);

  const pinsQ = useQuery<DrawingPin[]>({
    queryKey: ["/api/drawings", selected?.id, "pins"],
    queryFn: async () => {
      if (!selected) return [];
      const r = await apiFetch(`/api/drawings/${selected.id}/pins`);
      if (!r.ok) return [];
      return (await r.json()) as DrawingPin[];
    },
    enabled: !!selected,
  });
  const pins = (pinsQ.data ?? []).filter((p) => p.page === page);

  // Entity-backed link selectors
  const rfisQ = useQuery<RfiRow[]>({
    queryKey: ["/api/projects", projectId, "rfis"],
    queryFn: async () => {
      const r = await apiFetch(`/api/projects/${projectId}/rfis`);
      if (!r.ok) return [];
      const data = await r.json();
      return (Array.isArray(data) ? data : data.items || []) as RfiRow[];
    },
    enabled: !!pinDraft && linkType === "RFI",
  });
  const photosQ = useQuery<PhotoRow[]>({
    queryKey: ["/api/projects", projectId, "photos"],
    queryFn: async () => {
      const r = await apiFetch(`/api/projects/${projectId}/photos`);
      if (!r.ok) return [];
      const data = await r.json();
      return (Array.isArray(data) ? data : data.items || []) as PhotoRow[];
    },
    enabled: !!pinDraft && linkType === "Photo",
  });
  const punchQ = useQuery<PunchRow[]>({
    queryKey: ["/api/projects", projectId, "punch-list"],
    queryFn: async () => {
      const r = await apiFetch(`/api/projects/${projectId}/punch-list`);
      if (!r.ok) return [];
      const data = await r.json();
      return (Array.isArray(data) ? data : data.items || []) as PunchRow[];
    },
    enabled: !!pinDraft && linkType === "Punch",
  });

  const onSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest("[data-pin]")) return;
    if (gestureRef.current.lastTouchEnd && Date.now() - gestureRef.current.lastTouchEnd < 250) return;
    const rect = e.currentTarget.getBoundingClientRect();
    // Convert click to pdf-space (account for pan/zoom).
    const localX = (e.clientX - rect.left - pan.x) / (rect.width * scale);
    const localY = (e.clientY - rect.top - pan.y) / (rect.height * scale);
    if (localX < 0 || localX > 1 || localY < 0 || localY > 1) return;
    setPinDraft({ x: localX, y: localY });
    setLinkId(""); setLinkLabel("");
  };

  // ── Touch handlers: pinch-zoom + pan + tap to drop ─────────────────────────
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      gestureRef.current.pinchStartDist = dist;
      gestureRef.current.pinchStartScale = scale;
      gestureRef.current.panStart = null;
    } else if (e.touches.length === 1 && scale > 1) {
      const t = e.touches[0];
      gestureRef.current.panStart = { x: t.clientX, y: t.clientY };
      gestureRef.current.panOrigin = { ...pan };
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && gestureRef.current.pinchStartDist > 0) {
      e.preventDefault();
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const ratio = dist / gestureRef.current.pinchStartDist;
      const next = Math.max(1, Math.min(4, gestureRef.current.pinchStartScale * ratio));
      setScale(+next.toFixed(3));
    } else if (e.touches.length === 1 && gestureRef.current.panStart && scale > 1) {
      e.preventDefault();
      const t = e.touches[0];
      const dx = t.clientX - gestureRef.current.panStart.x;
      const dy = t.clientY - gestureRef.current.panStart.y;
      setPan({ x: gestureRef.current.panOrigin.x + dx, y: gestureRef.current.panOrigin.y + dy });
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    gestureRef.current.lastTouchEnd = Date.now();
    if (e.touches.length === 0) {
      gestureRef.current.pinchStartDist = 0;
      gestureRef.current.panStart = null;
      // Snap pan back if at scale 1
      if (scale <= 1.001) setPan({ x: 0, y: 0 });
    }
  };

  const cancelDraft = () => { setPinDraft(null); setLinkLabel(""); setLinkId(""); };

  const savePin = async () => {
    if (!selected || !pinDraft) return;
    const idem = `pin-${selected.id}-${page}-${pinDraft.x.toFixed(4)}-${pinDraft.y.toFixed(4)}-${Date.now()}`;
    const r = await apiFetch(`/api/drawings/${selected.id}/pins`, {
      method: "POST",
      headers: { "Idempotency-Key": idem },
      body: JSON.stringify({
        page, x: pinDraft.x, y: pinDraft.y,
        label: linkLabel || linkType,
        linkType,
        linkId: linkId || null,
      }),
    });
    if (r.ok || r.status === 202) {
      setPinDraft(null); setLinkLabel(""); setLinkId("");
      qc.invalidateQueries({ queryKey: ["/api/drawings", selected.id, "pins"] });
    }
  };

  const deletePin = async (pin: DrawingPin) => {
    if (!selected) return;
    await apiFetch(`/api/drawings/${selected.id}/pins/${pin.id}`, { method: "DELETE" });
    qc.invalidateQueries({ queryKey: ["/api/drawings", selected.id, "pins"] });
  };

  return (
    <div
      data-testid="m-drawings-page"
      style={{ background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE", padding: "16px 16px 96px" }}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Drawings</h1>
        <select
          data-testid="drawings-picker"
          value={selected?.id || ""}
          onChange={(e) => { setSelectedId(e.target.value); setPage(1); }}
          style={{
            background: "#14171C", border: "0.5px solid #2C2C2A", color: "#E8EAEE",
            borderRadius: 999, padding: "6px 12px", fontSize: 13,
          }}
        >
          {drawings.length === 0 && <option value="">No drawings</option>}
          {drawings.map((d) => (
            <option key={d.id} value={d.id}>{d.sheet ? `${d.sheet} · ${d.title}` : d.title}</option>
          ))}
        </select>
      </header>

      {/* Sprint M5 — markup tools (arrow / text / freehand / eraser). */}
      {selected && (
        <DrawingMarkupToolbarHost
          drawingId={selected.id}
          tool={markupTool}
          setTool={setMarkupTool}
          page={page}
        />
      )}

      {drawings.length === 0 && !drawingsQ.isLoading && (
        <div
          data-testid="drawings-empty"
          style={{ background: "#14171C", borderRadius: 14, padding: 20, textAlign: "center", color: "#8B92A1" }}
        >
          No drawings uploaded for this project yet. Upload a PDF from the desktop to get started.
        </div>
      )}

      {selected && (
        <>
          <div
            ref={wrapperRef}
            data-testid="drawings-canvas"
            onClick={onSurfaceClick}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            style={{
              position: "relative",
              background: "#FFFFFF",
              borderRadius: 12,
              overflow: "hidden",
              minHeight: 200,
              touchAction: "none",
              cursor: "crosshair",
              userSelect: "none",
            }}
          >
            <div
              data-testid="drawings-stage"
              style={{
                transformOrigin: "0 0",
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                width: "100%",
                position: "relative",
              }}
            >
              <Document
                file={selected.fileUrl}
                loading={<PdfSkeleton />}
                error={<div style={{ padding: 20, color: "#E24B4A" }}>Failed to load PDF.</div>}
              >
                <Page pageNumber={page} width={pdfWidth} renderAnnotationLayer={false} renderTextLayer={false} />
              </Document>
              {/* Sprint M5 — markup overlay; pointer events pass-through when tool="select". */}
              <DrawingMarkupOverlay drawingId={selected.id} page={page} tool={markupTool} />
              {pins.map((p) => {
                const px = Number(p.x) * 100;
                const py = Number(p.y) * 100;
                return (
                  <div
                    key={p.id}
                    data-pin
                    data-testid={`drawing-pin-${p.id}`}
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete pin${p.label ? ` "${p.label}"` : ""}?`)) deletePin(p); }}
                    title={p.linkType ? `${p.linkType}: ${p.label || p.linkId || ""}` : (p.label || "")}
                    style={{
                      position: "absolute",
                      left: `${px}%`,
                      top: `${py}%`,
                      transform: `translate(-50%, -100%) scale(${1 / scale})`,
                      transformOrigin: "50% 100%",
                      background: "#E24B4A", color: "#fff",
                      width: 24, height: 24, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 700,
                      boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                      cursor: "pointer",
                    }}
                  >{(p.label || p.linkType || "•").slice(0, 1)}</div>
                );
              })}
              {pinDraft && (
                <div
                  data-pin
                  data-testid="drawing-pin-draft"
                  style={{
                    position: "absolute",
                    left: `${pinDraft.x * 100}%`,
                    top: `${pinDraft.y * 100}%`,
                    transform: `translate(-50%, -100%) scale(${1 / scale})`,
                    transformOrigin: "50% 100%",
                    background: "#FAC775", color: "#1A0E08",
                    width: 28, height: 28, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: 700,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                  }}
                >+</div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <PageBtn label="◀" onClick={() => setPage((p) => Math.max(1, p - 1))} />
              <span style={{ fontSize: 13, color: "#8B92A1", padding: "6px 8px" }}>p {page}{selected.pageCount ? `/${selected.pageCount}` : ""}</span>
              <PageBtn label="▶" onClick={() => setPage((p) => p + 1)} />
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <PageBtn label="−" onClick={() => setScale((s) => Math.max(1, +(s - 0.25).toFixed(2)))} />
              <span data-testid="drawings-scale" style={{ fontSize: 13, color: "#8B92A1", padding: "6px 8px" }}>{Math.round(scale * 100)}%</span>
              <PageBtn label="+" onClick={() => setScale((s) => Math.min(4, +(s + 0.25).toFixed(2)))} />
              <PageBtn label="⤢" onClick={() => { setScale(1); setPan({ x: 0, y: 0 }); }} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#5C6370", marginTop: 4 }}>
            Pinch to zoom · drag to pan · tap to drop a pin.
          </div>

          {pinDraft && (
            <div
              data-testid="pin-link-panel"
              style={{ marginTop: 14, background: "#14171C", borderRadius: 14, padding: 14 }}
            >
              <div style={{ fontSize: 12, color: "#8B92A1", marginBottom: 8 }}>Link this pin</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                {LINK_TYPES.map((t) => (
                  <button
                    key={t}
                    data-testid={`pin-link-type-${t.toLowerCase()}`}
                    onClick={() => { setLinkType(t); setLinkId(""); }}
                    style={{
                      padding: "6px 12px", borderRadius: 999,
                      background: linkType === t ? "#1D9E75" : "transparent",
                      color: linkType === t ? "#fff" : "#8B92A1",
                      border: "1px solid #2C2C2A", fontSize: 12, cursor: "pointer",
                    }}
                  >{t}</button>
                ))}
              </div>

              {/* Entity-backed selector — picks an existing record where possible */}
              {linkType === "RFI" && (
                <select
                  data-testid="pin-link-entity-rfi"
                  value={linkId}
                  onChange={(e) => {
                    setLinkId(e.target.value);
                    const r = (rfisQ.data || []).find((x) => x.id === e.target.value);
                    if (r) setLinkLabel(`RFI #${r.rfiNumber ?? ""} ${r.subject ?? ""}`.trim());
                  }}
                  style={selectStyle}
                >
                  <option value="">Choose an RFI…</option>
                  {(rfisQ.data || []).map((r) => (
                    <option key={r.id} value={r.id}>RFI #{r.rfiNumber ?? r.id.slice(0, 6)} · {r.subject ?? ""}</option>
                  ))}
                </select>
              )}
              {linkType === "Photo" && (
                <select
                  data-testid="pin-link-entity-photo"
                  value={linkId}
                  onChange={(e) => {
                    setLinkId(e.target.value);
                    const r = (photosQ.data || []).find((x) => x.id === e.target.value);
                    if (r) setLinkLabel(r.caption || `Photo ${r.id.slice(0, 6)}`);
                  }}
                  style={selectStyle}
                >
                  <option value="">Choose a photo…</option>
                  {(photosQ.data || []).map((r) => (
                    <option key={r.id} value={r.id}>{r.caption || `Photo ${r.id.slice(0, 6)}`}</option>
                  ))}
                </select>
              )}
              {linkType === "Punch" && (
                <select
                  data-testid="pin-link-entity-punch"
                  value={linkId}
                  onChange={(e) => {
                    setLinkId(e.target.value);
                    const r = (punchQ.data || []).find((x) => x.id === e.target.value);
                    if (r) setLinkLabel(`Punch #${r.itemNumber ?? ""} ${r.title ?? r.description ?? ""}`.trim());
                  }}
                  style={selectStyle}
                >
                  <option value="">Choose a punch item…</option>
                  {(punchQ.data || []).map((r) => (
                    <option key={r.id} value={r.id}>#{r.itemNumber ?? r.id.slice(0, 6)} · {r.title ?? r.description ?? ""}</option>
                  ))}
                </select>
              )}

              <input
                data-testid="pin-link-label"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder={`Optional ${linkType} label`}
                style={{ ...selectStyle, marginTop: 10 }}
              />

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  data-testid="pin-save"
                  onClick={savePin}
                  style={{
                    flex: 1, padding: "10px 14px", background: "#1D9E75", color: "#fff",
                    border: "none", borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: "pointer",
                  }}
                >Save pin</button>
                <button
                  data-testid="pin-cancel"
                  onClick={cancelDraft}
                  style={{
                    flex: 1, padding: "10px 14px", background: "transparent", color: "#E8EAEE",
                    border: "1px solid #2C2C2A", borderRadius: 10, fontSize: 14, cursor: "pointer",
                  }}
                >Cancel</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", background: "#0B0D11",
  color: "#E8EAEE", border: "1px solid #2C2C2A", borderRadius: 10,
  fontSize: 14,
};

function PageBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#14171C", color: "#E8EAEE", border: "1px solid #2C2C2A",
        borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontSize: 14,
      }}
    >{label}</button>
  );
}

function PdfSkeleton() {
  return (
    <div
      data-testid="pdf-skeleton"
      style={{
        width: "100%", height: 360, background: "linear-gradient(90deg,#E8EAEE 0%,#F2F4F7 50%,#E8EAEE 100%)",
        backgroundSize: "200% 100%", animation: "pdf-shimmer 1.4s ease-in-out infinite",
      }}
    >
      <style>{`@keyframes pdf-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  );
}
