import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Document, Page, pdfjs } from "react-pdf";
import { apiFetch } from "@/lib/offline-queue";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

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

const LINK_TYPES = ["RFI", "Photo", "Punch", "Submittal"] as const;

export default function MobileDrawingsPage() {
  const [match, params] = useRoute("/projects/:id/drawings");
  const projectId = (match && params?.id) || "default";
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [pinDraft, setPinDraft] = useState<{ x: number; y: number } | null>(null);
  const [linkType, setLinkType] = useState<string>(LINK_TYPES[0]);
  const [linkLabel, setLinkLabel] = useState("");
  const [pdfWidth, setPdfWidth] = useState(360);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const update = () => {
      const w = wrapperRef.current?.getBoundingClientRect().width;
      if (w && w > 60) setPdfWidth(Math.round(w));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [selectedId]);

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

  const onDocClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setPinDraft({ x, y });
  };

  const cancelDraft = () => { setPinDraft(null); setLinkLabel(""); };

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
      }),
    });
    if (r.ok || r.status === 202) {
      setPinDraft(null); setLinkLabel("");
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
            onClick={onDocClick}
            style={{
              position: "relative",
              background: "#FFFFFF",
              borderRadius: 12,
              overflow: "hidden",
              minHeight: 200,
              touchAction: "manipulation",
              cursor: "crosshair",
            }}
          >
            <Document
              file={selected.fileUrl}
              loading={<PdfSkeleton />}
              error={<div style={{ padding: 20, color: "#E24B4A" }}>Failed to load PDF.</div>}
            >
              <Page pageNumber={page} width={Math.round(pdfWidth * scale)} renderAnnotationLayer={false} renderTextLayer={false} />
            </Document>
            {pins.map((p) => {
              const px = Number(p.x) * 100;
              const py = Number(p.y) * 100;
              return (
                <div
                  key={p.id}
                  data-testid={`drawing-pin-${p.id}`}
                  onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete pin${p.label ? ` "${p.label}"` : ""}?`)) deletePin(p); }}
                  title={p.label || ""}
                  style={{
                    position: "absolute",
                    left: `${px}%`,
                    top: `${py}%`,
                    transform: "translate(-50%, -100%)",
                    background: "#E24B4A", color: "#fff",
                    width: 24, height: 24, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 700,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.4)",
                    cursor: "pointer",
                  }}
                >{(p.label || "•").slice(0, 1)}</div>
              );
            })}
            {pinDraft && (
              <div
                data-testid="drawing-pin-draft"
                style={{
                  position: "absolute",
                  left: `${pinDraft.x * 100}%`,
                  top: `${pinDraft.y * 100}%`,
                  transform: "translate(-50%, -100%)",
                  background: "#FAC775", color: "#1A0E08",
                  width: 28, height: 28, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 13, fontWeight: 700,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
                }}
              >+</div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <PageBtn label="◀" onClick={() => setPage((p) => Math.max(1, p - 1))} />
              <span style={{ fontSize: 13, color: "#8B92A1", padding: "6px 8px" }}>p {page}{selected.pageCount ? `/${selected.pageCount}` : ""}</span>
              <PageBtn label="▶" onClick={() => setPage((p) => p + 1)} />
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <PageBtn label="−" onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))} />
              <span style={{ fontSize: 13, color: "#8B92A1", padding: "6px 8px" }}>{Math.round(scale * 100)}%</span>
              <PageBtn label="+" onClick={() => setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)))} />
            </div>
          </div>

          {pinDraft && (
            <div
              data-testid="pin-link-panel"
              style={{ marginTop: 14, background: "#14171C", borderRadius: 14, padding: 14 }}
            >
              <div style={{ fontSize: 12, color: "#8B92A1", marginBottom: 8 }}>Link this pin</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {LINK_TYPES.map((t) => (
                  <button
                    key={t}
                    data-testid={`pin-link-type-${t.toLowerCase()}`}
                    onClick={() => setLinkType(t)}
                    style={{
                      padding: "6px 12px", borderRadius: 999,
                      background: linkType === t ? "#1D9E75" : "transparent",
                      color: linkType === t ? "#fff" : "#8B92A1",
                      border: "1px solid #2C2C2A", fontSize: 12, cursor: "pointer",
                    }}
                  >{t}</button>
                ))}
              </div>
              <input
                data-testid="pin-link-label"
                value={linkLabel}
                onChange={(e) => setLinkLabel(e.target.value)}
                placeholder={`${linkType} label / number`}
                style={{
                  width: "100%", padding: "10px 12px", background: "#0B0D11",
                  color: "#E8EAEE", border: "1px solid #2C2C2A", borderRadius: 10,
                  fontSize: 14, marginBottom: 10,
                }}
              />
              <div style={{ display: "flex", gap: 10 }}>
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
