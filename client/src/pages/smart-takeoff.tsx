import { useEffect, useMemo, useRef, useState } from "react";
import { useRoute } from "wouter";
import { Document, Page, pdfjs } from "react-pdf";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  Ruler,
  Move,
  Square,
  Box,
  Hash,
  Sparkles,
  Trash2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
} from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type Tool = "calibrate" | "linear" | "polyline" | "area" | "volume" | "count" | "vision";

interface Point {
  x: number;
  y: number;
}

interface MeasurementResult {
  type: string;
  quantity: number;
  unit: "LF" | "SF" | "CY" | "EA";
  closed: boolean;
}

interface Measurement {
  id: string;
  tool: Tool;
  pageNumber: number;
  points: Point[];
  result: MeasurementResult;
  label: string;
  createdAt: string;
}

interface BlueprintRow {
  id: string;
  title: string;
  fileName: string;
  storageKey: string;
  pageCount: number | null;
  pixelsPerFootByPage: Record<string, number> | null;
}

const VISION_TARGETS = [
  "doors",
  "windows",
  "parking_spaces",
  "light_fixtures",
  "electrical_outlets",
  "data_outlets",
  "fire_sprinklers",
  "plumbing_fixtures",
  "hvac_diffusers",
  "smoke_detectors",
  "exit_signs",
  "structural_columns",
  "trees",
  "other",
] as const;

export default function SmartTakeoffPage() {
  const [, params] = useRoute<{ id: string }>("/blueprints/:id/smart-takeoff");
  const blueprintId = params?.id;
  const { toast } = useToast();

  const [tool, setTool] = useState<Tool>("calibrate");
  const [pageNumber, setPageNumber] = useState(1);
  const [points, setPoints] = useState<Point[]>([]);
  const [calibrationLength, setCalibrationLength] = useState("10");
  const [volumeDepth, setVolumeDepth] = useState("0.5");
  const [busy, setBusy] = useState(false);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const pageRef = useRef<HTMLDivElement>(null);

  // Vision count state
  const [visionTarget, setVisionTarget] = useState<typeof VISION_TARGETS[number]>("doors");
  const [visionHint, setVisionHint] = useState("");
  const [visionRect, setVisionRect] = useState<{ start: Point; end: Point } | null>(null);
  const [visionDragging, setVisionDragging] = useState(false);

  const { data: blueprint } = useQuery<BlueprintRow>({
    queryKey: ["/api/blueprints", blueprintId],
    enabled: !!blueprintId,
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/blueprints/${blueprintId}`);
      return r.json();
    },
  });

  const pixelsPerFoot = useMemo(() => {
    return blueprint?.pixelsPerFootByPage?.[String(pageNumber)] ?? null;
  }, [blueprint, pageNumber]);

  const isCalibrated = pixelsPerFoot != null && pixelsPerFoot > 0;
  const pdfUrl = blueprint ? `/api/documents/${blueprint.id}/download` : "";

  // Reset points when switching tools or pages
  useEffect(() => {
    setPoints([]);
    setVisionRect(null);
  }, [tool, pageNumber]);

  function getRelativePoint(e: React.MouseEvent): Point | null {
    const el = pageRef.current?.querySelector(".react-pdf__Page__canvas") as HTMLCanvasElement | null;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleClick(e: React.MouseEvent) {
    if (busy) return;
    if (tool === "vision") return; // vision uses drag, not click
    const pt = getRelativePoint(e);
    if (!pt) return;

    if (tool === "calibrate") {
      const next = [...points, pt].slice(-2);
      setPoints(next);
      if (next.length === 2) {
        runCalibration(next[0], next[1]);
      }
      return;
    }
    if (tool === "linear" && points.length >= 2) {
      // start a new measurement after one completes
      setPoints([pt]);
      return;
    }
    setPoints((prev) => [...prev, pt]);
  }

  function handleDoubleClick() {
    // Polyline / area / volume → finalize on double-click
    if (tool === "polyline" || tool === "area" || tool === "volume") {
      if (points.length >= 2) finishMeasurement();
    }
    if (tool === "linear" && points.length === 2) finishMeasurement();
    if (tool === "count") finishMeasurement();
  }

  // Vision drag handling
  function handleMouseDown(e: React.MouseEvent) {
    if (tool !== "vision") return;
    const pt = getRelativePoint(e);
    if (!pt) return;
    setVisionDragging(true);
    setVisionRect({ start: pt, end: pt });
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!visionDragging || tool !== "vision") return;
    const pt = getRelativePoint(e);
    if (!pt || !visionRect) return;
    setVisionRect({ ...visionRect, end: pt });
  }

  function handleMouseUp() {
    if (visionDragging) setVisionDragging(false);
  }

  async function runCalibration(p1: Point, p2: Point) {
    if (!blueprintId) return;
    const known = parseFloat(calibrationLength);
    if (!Number.isFinite(known) || known <= 0) {
      toast({ title: "Bad calibration length", description: "Enter a positive number of feet first.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const r = await apiRequest("POST", `/api/blueprints/${blueprintId}/calibrate`, {
        pageNumber,
        p1,
        p2,
        knownLengthFt: known,
      });
      const data = await r.json();
      toast({ title: "Calibrated", description: `Page ${pageNumber}: ${data.pixelsPerFoot.toFixed(2)} px/ft` });
      // refresh blueprint to pick up new ppf
      window.location.reload();
    } catch (err: any) {
      toast({ title: "Calibration failed", description: err.message || String(err), variant: "destructive" });
    } finally {
      setBusy(false);
      setPoints([]);
    }
  }

  async function finishMeasurement() {
    if (!blueprintId || points.length === 0) return;
    if (tool === "calibrate" || tool === "vision") return;
    if (!isCalibrated && tool !== "count") {
      toast({ title: "Calibrate first", description: "Click two points on a known dimension and enter its length.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = { pageNumber, type: tool, points };
      if (tool === "volume") {
        const d = parseFloat(volumeDepth);
        if (!Number.isFinite(d) || d <= 0) {
          throw new Error("Volume depth must be > 0 ft");
        }
        body.depthFt = d;
      }
      const r = await apiRequest("POST", `/api/blueprints/${blueprintId}/measure`, body);
      const result: MeasurementResult = await r.json();
      const m: Measurement = {
        id: cryptoRandomId(),
        tool,
        pageNumber,
        points: [...points],
        result,
        label: defaultLabel(tool, result),
        createdAt: new Date().toISOString(),
      };
      setMeasurements((prev) => [m, ...prev]);
      setPoints([]);
      toast({
        title: `${result.quantity.toLocaleString()} ${result.unit}`,
        description: `${tool} measurement saved`,
      });
    } catch (err: any) {
      toast({ title: "Measurement failed", description: err.message || String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function runVisionCount() {
    if (!visionRect) {
      toast({ title: "Drag a rectangle", description: "Drag across the area to count first.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const canvas = pageRef.current?.querySelector(".react-pdf__Page__canvas") as HTMLCanvasElement | null;
      if (!canvas) throw new Error("PDF canvas not ready");
      const x = Math.min(visionRect.start.x, visionRect.end.x);
      const y = Math.min(visionRect.start.y, visionRect.end.y);
      const w = Math.abs(visionRect.end.x - visionRect.start.x);
      const h = Math.abs(visionRect.end.y - visionRect.start.y);
      if (w < 20 || h < 20) throw new Error("Selection too small");

      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = w;
      cropCanvas.height = h;
      const ctx = cropCanvas.getContext("2d");
      if (!ctx) throw new Error("Cannot create crop canvas");
      ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
      const dataUrl = cropCanvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];

      const r = await apiRequest("POST", `/api/blueprints/vision-count`, {
        imageBase64: base64,
        mimeType: "image/png",
        targetType: visionTarget,
        hint: visionHint || undefined,
      });
      const result = await r.json();

      const m: Measurement = {
        id: cryptoRandomId(),
        tool: "vision",
        pageNumber,
        points: [
          { x, y },
          { x: x + w, y: y + h },
        ],
        result: {
          type: "vision_count",
          quantity: result.count,
          unit: "EA",
          closed: false,
        },
        label: `${visionTarget} (${result.source}${result.confidence ? `, ${Math.round(result.confidence * 100)}%` : ""})`,
        createdAt: new Date().toISOString(),
      };
      setMeasurements((prev) => [m, ...prev]);
      setVisionRect(null);
      toast({
        title: `${result.count} ${visionTarget}`,
        description:
          result.source === "fallback"
            ? `Stub mode — ${result.notes || "set ANTHROPIC_API_KEY for real counts"}`
            : result.notes || `confidence ${Math.round(result.confidence * 100)}%`,
        variant: result.source === "fallback" ? "destructive" : "default",
      });
    } catch (err: any) {
      toast({ title: "Vision count failed", description: err.message || String(err), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  function deleteMeasurement(id: string) {
    setMeasurements((prev) => prev.filter((m) => m.id !== id));
  }

  if (!blueprintId) {
    return <div className="p-6">No blueprint selected.</div>;
  }
  if (!blueprint) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading blueprint…
      </div>
    );
  }

  const totalPages = blueprint.pageCount ?? 1;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Tool sidebar */}
      <aside className="w-64 border-r bg-muted/20 p-4 flex flex-col gap-4 overflow-y-auto">
        <div>
          <h2 className="font-semibold text-sm tracking-wide uppercase text-muted-foreground">Smart Takeoff</h2>
          <p className="text-xs text-muted-foreground mt-1 truncate" title={blueprint.title}>
            {blueprint.title}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Badge variant={isCalibrated ? "default" : "secondary"}>
            {isCalibrated ? `${pixelsPerFoot!.toFixed(1)} px/ft` : "Not calibrated"}
          </Badge>
          <Badge variant="outline">page {pageNumber}/{totalPages}</Badge>
        </div>

        <ToolButton active={tool === "calibrate"} onClick={() => setTool("calibrate")} icon={<Ruler className="h-4 w-4" />} label="Calibrate" />
        <div className="pl-6">
          <Label htmlFor="cal-len" className="text-xs">Known length (ft)</Label>
          <Input
            id="cal-len"
            type="number"
            value={calibrationLength}
            onChange={(e) => setCalibrationLength(e.target.value)}
            disabled={tool !== "calibrate"}
            data-testid="input-calibration-length"
          />
        </div>

        <ToolButton active={tool === "linear"} onClick={() => setTool("linear")} icon={<Move className="h-4 w-4" />} label="Linear (LF)" />
        <ToolButton active={tool === "polyline"} onClick={() => setTool("polyline")} icon={<Move className="h-4 w-4" />} label="Polyline (LF)" />
        <ToolButton active={tool === "area"} onClick={() => setTool("area")} icon={<Square className="h-4 w-4" />} label="Area (SF)" />
        <ToolButton active={tool === "volume"} onClick={() => setTool("volume")} icon={<Box className="h-4 w-4" />} label="Volume (CY)" />
        {tool === "volume" && (
          <div className="pl-6">
            <Label htmlFor="vol-depth" className="text-xs">Depth (ft)</Label>
            <Input
              id="vol-depth"
              type="number"
              value={volumeDepth}
              onChange={(e) => setVolumeDepth(e.target.value)}
              data-testid="input-volume-depth"
            />
          </div>
        )}
        <ToolButton active={tool === "count"} onClick={() => setTool("count")} icon={<Hash className="h-4 w-4" />} label="Count (EA)" />
        <ToolButton active={tool === "vision"} onClick={() => setTool("vision")} icon={<Sparkles className="h-4 w-4" />} label="AI Vision Count" />

        {tool === "vision" && (
          <div className="pl-6 space-y-2">
            <div>
              <Label className="text-xs">Target</Label>
              <Select value={visionTarget} onValueChange={(v) => setVisionTarget(v as any)}>
                <SelectTrigger data-testid="select-vision-target"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VISION_TARGETS.map((t) => (
                    <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Hint (optional)</Label>
              <Input
                value={visionHint}
                onChange={(e) => setVisionHint(e.target.value)}
                placeholder="e.g. only single-leaf doors"
                data-testid="input-vision-hint"
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={runVisionCount}
              disabled={!visionRect || busy}
              data-testid="button-run-vision"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              Count region
            </Button>
          </div>
        )}

        <div className="text-xs text-muted-foreground pt-2 border-t">
          {tool === "calibrate" && "Click 2 points on a known dimension."}
          {tool === "linear" && "Click 2 points to measure length."}
          {(tool === "polyline" || tool === "area" || tool === "volume") && "Click points; double-click to finish."}
          {tool === "count" && "Click each item; double-click to total."}
          {tool === "vision" && "Drag a rectangle around the area to count."}
        </div>
      </aside>

      {/* PDF viewer */}
      <main className="flex-1 overflow-auto bg-neutral-100 relative">
        <div className="sticky top-0 z-10 flex items-center gap-2 p-2 bg-white border-b">
          <Button size="sm" variant="outline" onClick={() => setPageNumber((n) => Math.max(1, n - 1))} disabled={pageNumber <= 1} data-testid="button-prev-page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm">Page {pageNumber} / {totalPages}</span>
          <Button size="sm" variant="outline" onClick={() => setPageNumber((n) => Math.min(totalPages, n + 1))} disabled={pageNumber >= totalPages} data-testid="button-next-page">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground ml-4">
            {points.length} point{points.length === 1 ? "" : "s"} placed
          </span>
        </div>

        <div
          ref={pageRef}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          className="relative inline-block cursor-crosshair select-none"
          data-testid="pdf-overlay"
        >
          <Document file={pdfUrl} loading={<div className="p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}>
            <Page pageNumber={pageNumber} renderAnnotationLayer={false} renderTextLayer={false} />
          </Document>

          {/* Marker overlay */}
          <svg className="absolute inset-0 pointer-events-none" style={{ width: "100%", height: "100%" }}>
            {points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={5} fill="#ef4444" stroke="white" strokeWidth={2} />
            ))}
            {points.length >= 2 && (tool === "linear" || tool === "polyline" || tool === "area" || tool === "volume") && (
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill={tool === "area" || tool === "volume" ? "rgba(239,68,68,0.15)" : "none"}
                stroke="#ef4444"
                strokeWidth={2}
              />
            )}
            {visionRect && (
              <rect
                x={Math.min(visionRect.start.x, visionRect.end.x)}
                y={Math.min(visionRect.start.y, visionRect.end.y)}
                width={Math.abs(visionRect.end.x - visionRect.start.x)}
                height={Math.abs(visionRect.end.y - visionRect.start.y)}
                fill="rgba(99,102,241,0.15)"
                stroke="#6366f1"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
            )}
          </svg>
        </div>
      </main>

      {/* Measurement history */}
      <aside className="w-80 border-l p-4 overflow-y-auto bg-white">
        <h3 className="font-semibold text-sm tracking-wide uppercase text-muted-foreground mb-3">Measurements ({measurements.length})</h3>
        {measurements.length === 0 ? (
          <p className="text-xs text-muted-foreground">No measurements yet. Pick a tool and start clicking.</p>
        ) : (
          <div className="space-y-2">
            {measurements.map((m) => (
              <Card key={m.id} data-testid={`measurement-${m.id}`}>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{m.label}</span>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteMeasurement(m.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 text-xs space-y-1">
                  <div className="font-mono">
                    {m.result.quantity.toLocaleString()} <span className="text-muted-foreground">{m.result.unit}</span>
                  </div>
                  <div className="text-muted-foreground">
                    {m.tool} · page {m.pageNumber}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function ToolButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Button
      variant={active ? "default" : "outline"}
      size="sm"
      className="justify-start gap-2"
      onClick={onClick}
      data-testid={`tool-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
    >
      {icon}
      {label}
    </Button>
  );
}

function defaultLabel(tool: Tool, r: MeasurementResult): string {
  const verb = tool === "linear" ? "Linear" : tool === "polyline" ? "Polyline" : tool === "area" ? "Area" : tool === "volume" ? "Volume" : tool === "count" ? "Count" : tool;
  return `${verb}: ${r.quantity.toLocaleString()} ${r.unit}`;
}

function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2);
}
