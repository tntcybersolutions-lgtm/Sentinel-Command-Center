/**
 * Sprint M5 — Drawings markup MVP
 *
 * SVG overlay that adds arrow / text / freehand annotation on top of an
 * existing PDF.js viewer. Renders absolutely-positioned at 100% / 100%
 * of its parent so it tracks the PDF page exactly. Coordinates are stored
 * normalized (0..1) so they survive zoom + page-width changes the same
 * way the pin system already does.
 *
 * Persistence: per (drawingId, page) into localStorage. A future sprint
 * promotes this to a `drawing_markups` Postgres table + apiFetch routing
 * for cross-device sync, the same way pins work today.
 *
 * Tools:
 *   - Select  : default; lets pinch-zoom / pin-drop pass through (overlay disabled)
 *   - Arrow   : pointerDown sets start, pointerUp sets end → straight arrow
 *   - Text    : tap to place; modal prompt for label
 *   - Freehand: pointerDown→move records polyline points; pointerUp commits
 *   - Eraser  : tap a markup to delete it
 *
 * Markups can be cleared per-page from the toolbar. Each markup carries
 * an id + author (from localStorage sentinel-user-id) + createdAt so we can
 * later attribute them in the audit log.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  MousePointer2,
  Pencil,
  Type as TypeIcon,
  Eraser,
  Trash2,
  Palette,
} from "lucide-react";

export type MarkupTool = "select" | "arrow" | "text" | "freehand" | "eraser";

export interface Markup {
  id: string;
  page: number;
  type: "arrow" | "text" | "freehand";
  color: string;
  /** normalized 0..1 coords in pdf-space */
  points: { x: number; y: number }[];
  text?: string;
  author?: string;
  createdAt: number;
}

const COLORS = ["#E24B4A", "#FAC775", "#A6E3A1", "#7DB7E8", "#E8EAEE"];
const STORAGE_KEY = (drawingId: string) => `sentinel-markups:${drawingId}`;

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadFromStorage(drawingId: string): Markup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(drawingId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Markup[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToStorage(drawingId: string, markups: Markup[]): void {
  try { localStorage.setItem(STORAGE_KEY(drawingId), JSON.stringify(markups)); } catch { /* ignore */ }
}

export interface DrawingMarkupCanvasProps {
  drawingId: string;
  page: number;
  /** Whether the host element wants this overlay to accept input. When the
   * outer pin-drop / pinch-zoom is the right behavior the host can disable
   * the overlay by passing tool="select". */
  tool: MarkupTool;
  setTool: (t: MarkupTool) => void;
}

/**
 * Overlay SVG. Place inside the same positioned container as the PDF
 * (absolute, inset: 0). Coordinates are normalized so zoom/pan transforms
 * applied to the parent automatically scale the overlay.
 */
export function DrawingMarkupOverlay({ drawingId, page, tool }: { drawingId: string; page: number; tool: MarkupTool }) {
  const [markups, setMarkups] = useState<Markup[]>(() => loadFromStorage(drawingId));
  const [color, setColor] = useState<string>(COLORS[0]);
  const [draftArrow, setDraftArrow] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [draftPath, setDraftPath] = useState<{ x: number; y: number }[] | null>(null);
  const [textDraft, setTextDraft] = useState<{ x: number; y: number; value: string } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Reload when drawing changes
  useEffect(() => { setMarkups(loadFromStorage(drawingId)); }, [drawingId]);

  // Persist after every change
  useEffect(() => { saveToStorage(drawingId, markups); }, [drawingId, markups]);

  // Sync across tabs (e.g. if user opens two drawing tabs)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY(drawingId)) return;
      setMarkups(loadFromStorage(drawingId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [drawingId]);

  const pointFromEvent = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }, []);

  const author = useMemo(() => {
    try { return localStorage.getItem("sentinel-user-id") || undefined; } catch { return undefined; }
  }, []);

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === "select") return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as SVGSVGElement).setPointerCapture?.(e.pointerId);
    const p = pointFromEvent(e);
    if (tool === "arrow") {
      setDraftArrow({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    } else if (tool === "freehand") {
      setDraftPath([p]);
    } else if (tool === "text") {
      setTextDraft({ x: p.x, y: p.y, value: "" });
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === "select") return;
    const p = pointFromEvent(e);
    if (draftArrow) {
      setDraftArrow({ ...draftArrow, x1: p.x, y1: p.y });
    } else if (draftPath) {
      setDraftPath((prev) => (prev ? [...prev, p] : prev));
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (tool === "select") return;
    if (draftArrow) {
      const dx = draftArrow.x1 - draftArrow.x0;
      const dy = draftArrow.y1 - draftArrow.y0;
      // require a minimum drag distance so accidental taps don't make zero-length arrows
      if (Math.hypot(dx, dy) > 0.01) {
        setMarkups((m) => [
          ...m,
          {
            id: newId(), page, type: "arrow", color,
            points: [{ x: draftArrow.x0, y: draftArrow.y0 }, { x: draftArrow.x1, y: draftArrow.y1 }],
            author, createdAt: Date.now(),
          },
        ]);
      }
      setDraftArrow(null);
    } else if (draftPath) {
      if (draftPath.length > 1) {
        setMarkups((m) => [
          ...m,
          { id: newId(), page, type: "freehand", color, points: draftPath, author, createdAt: Date.now() },
        ]);
      }
      setDraftPath(null);
    }
  };

  const onMarkupClick = (id: string) => {
    if (tool !== "eraser") return;
    setMarkups((m) => m.filter((x) => x.id !== id));
  };

  const commitText = () => {
    if (!textDraft) return;
    const t = textDraft.value.trim();
    if (t) {
      setMarkups((m) => [
        ...m,
        { id: newId(), page, type: "text", color, points: [{ x: textDraft.x, y: textDraft.y }], text: t, author, createdAt: Date.now() },
      ]);
    }
    setTextDraft(null);
  };

  // Filter to this page only — markups carry their page number with them.
  const visible = markups.filter((m) => m.page === page);

  return (
    <>
      <svg
        ref={svgRef}
        data-testid="drawing-markup-overlay"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          // Block pointer events only when a markup tool is active; otherwise
          // let the underlying PDF canvas + pin-drop logic handle interactions.
          pointerEvents: tool === "select" ? "none" : "auto",
          touchAction: tool === "select" ? "auto" : "none",
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <defs>
          {COLORS.map((c) => (
            <marker
              key={c}
              id={`m5-arrowhead-${c.replace(/[^a-zA-Z0-9]/g, "")}`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="4"
              markerHeight="4"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 Z" fill={c} />
            </marker>
          ))}
        </defs>
        {visible.map((m) => {
          const arrowHead = `url(#m5-arrowhead-${m.color.replace(/[^a-zA-Z0-9]/g, "")})`;
          if (m.type === "arrow") {
            const [a, b] = m.points;
            return (
              <line
                key={m.id}
                data-markup-id={m.id}
                x1={a.x * 100}
                y1={a.y * 100}
                x2={b.x * 100}
                y2={b.y * 100}
                stroke={m.color}
                strokeWidth={0.6}
                strokeLinecap="round"
                markerEnd={arrowHead}
                style={{ cursor: tool === "eraser" ? "pointer" : "default" }}
                onClick={() => onMarkupClick(m.id)}
              />
            );
          }
          if (m.type === "freehand") {
            const d = m.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 100} ${p.y * 100}`).join(" ");
            return (
              <path
                key={m.id}
                data-markup-id={m.id}
                d={d}
                stroke={m.color}
                strokeWidth={0.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                style={{ cursor: tool === "eraser" ? "pointer" : "default" }}
                onClick={() => onMarkupClick(m.id)}
              />
            );
          }
          if (m.type === "text" && m.text) {
            const p = m.points[0];
            return (
              <text
                key={m.id}
                data-markup-id={m.id}
                x={p.x * 100}
                y={p.y * 100}
                fontSize={2.6}
                fontWeight={600}
                fill={m.color}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth={0.05}
                paintOrder="stroke"
                style={{ cursor: tool === "eraser" ? "pointer" : "default" }}
                onClick={() => onMarkupClick(m.id)}
              >
                {m.text}
              </text>
            );
          }
          return null;
        })}
        {draftArrow && (
          <line
            x1={draftArrow.x0 * 100}
            y1={draftArrow.y0 * 100}
            x2={draftArrow.x1 * 100}
            y2={draftArrow.y1 * 100}
            stroke={color}
            strokeWidth={0.6}
            strokeDasharray="1 1"
            strokeLinecap="round"
          />
        )}
        {draftPath && draftPath.length > 1 && (
          <path
            d={draftPath.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x * 100} ${p.y * 100}`).join(" ")}
            stroke={color}
            strokeWidth={0.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.7}
          />
        )}
      </svg>

      {/* Text-tool floating input */}
      {textDraft && (
        <div
          data-testid="drawing-markup-text-input"
          style={{
            position: "absolute",
            left: `${textDraft.x * 100}%`,
            top: `${textDraft.y * 100}%`,
            transform: "translate(-4px, -4px)",
            zIndex: 5,
          }}
        >
          <input
            autoFocus
            value={textDraft.value}
            onChange={(e) => setTextDraft({ ...textDraft, value: e.target.value })}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText();
              if (e.key === "Escape") setTextDraft(null);
            }}
            placeholder="Label…"
            style={{
              background: "rgba(0,0,0,0.7)",
              color: color,
              border: `1px solid ${color}`,
              borderRadius: 4,
              padding: "2px 6px",
              fontSize: 12,
              outline: "none",
              minWidth: 80,
            }}
          />
        </div>
      )}

      {/* Color picker is rendered alongside the tool palette, not here, so
          this overlay file stays a pure rendering surface. */}
    </>
  );
}

/**
 * Tool palette — render in the host page layout above or beside the canvas.
 * Receives the currently selected tool + setter so state lives at the host.
 */
export function DrawingMarkupToolbar({
  tool,
  setTool,
  onClearPage,
  page,
}: {
  tool: MarkupTool;
  setTool: (t: MarkupTool) => void;
  onClearPage: () => void;
  page: number;
}) {
  const Btn = ({ id, Icon, label }: { id: MarkupTool; Icon: typeof MousePointer2; label: string }) => (
    <button
      type="button"
      data-testid={`markup-tool-${id}`}
      onClick={() => setTool(id)}
      aria-label={label}
      aria-pressed={tool === id}
      style={{
        background: tool === id ? "#FAC775" : "#14171C",
        color: tool === id ? "#1A0E08" : "#E8EAEE",
        border: "0.5px solid #2C2C2A",
        borderRadius: 8,
        padding: 8,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon size={16} />
    </button>
  );

  return (
    <div
      data-testid="drawing-markup-toolbar"
      style={{
        display: "flex",
        gap: 6,
        alignItems: "center",
        marginBottom: 8,
        flexWrap: "wrap",
      }}
    >
      <Btn id="select" Icon={MousePointer2} label="Select (zoom / pin)" />
      <Btn id="arrow" Icon={ArrowUpRight} label="Arrow" />
      <Btn id="text" Icon={TypeIcon} label="Text label" />
      <Btn id="freehand" Icon={Pencil} label="Freehand" />
      <Btn id="eraser" Icon={Eraser} label="Eraser" />
      <button
        type="button"
        data-testid="markup-clear-page"
        onClick={() => {
          if (!window.confirm(`Clear all markups on page ${page}?`)) return;
          onClearPage();
        }}
        aria-label={`Clear all markups on page ${page}`}
        style={{
          background: "#14171C",
          color: "#E24B4A",
          border: "0.5px solid #2C2C2A",
          borderRadius: 8,
          padding: 8,
          cursor: "pointer",
          marginLeft: "auto",
        }}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

/**
 * Convenience hook: read+write markups for a (drawingId) from localStorage
 * so a parent component can implement Clear-Page or export-all without
 * having to know about the storage key.
 */
export function useMarkupStorage(drawingId: string) {
  const [markups, setMarkups] = useState<Markup[]>(() => loadFromStorage(drawingId));
  useEffect(() => { setMarkups(loadFromStorage(drawingId)); }, [drawingId]);
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY(drawingId)) return;
      setMarkups(loadFromStorage(drawingId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [drawingId]);
  const clearPage = useCallback((page: number) => {
    const next = loadFromStorage(drawingId).filter((m) => m.page !== page);
    saveToStorage(drawingId, next);
    setMarkups(next);
  }, [drawingId]);
  return { markups, clearPage };
}

export default DrawingMarkupOverlay;
