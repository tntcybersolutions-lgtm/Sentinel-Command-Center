import { useRef, useState, useEffect, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Annotation {
  id: string;
  blueprintId: string;
  pageNumber: number;
  annotationType: string;
  dataJson: {
    points?: { x: number; y: number }[];
    start?: { x: number; y: number };
    end?: { x: number; y: number };
    center?: { x: number; y: number };
    width?: number;
    height?: number;
    radius?: number;
    text?: string;
  };
  color: string;
  label?: string;
}

interface BlueprintCanvasProps {
  blueprintId: string;
  pageNumber: number;
  activeTool: string;
  zoom: number;
  onCountClick?: (x: number, y: number) => void;
}

type DrawingState = {
  isDrawing: boolean;
  startPoint: { x: number; y: number } | null;
  currentPoints: { x: number; y: number }[];
  previewShape: Partial<Annotation["dataJson"]> | null;
};

const TOOL_COLORS: Record<string, string> = {
  select: "#6b7280",
  arrow: "#22c55e",
  area: "#3b82f6",
  rectangle: "#3b82f6",
  cloud: "#8b5cf6",
  text: "#ef4444",
  pencil: "#ef4444",
  highlight: "#eab308",
  count: "#f97316",
  measure: "#eab308",
};

const TOOL_TO_ANNOTATION_TYPE: Record<string, string> = {
  area: "rectangle",
  rectangle: "rectangle",
  text: "text",
  pencil: "pencil",
  highlight: "highlight",
  arrow: "arrow",
  cloud: "cloud",
  count: "count",
  measure: "measurement",
};

export function BlueprintCanvas({
  blueprintId,
  pageNumber,
  activeTool,
  zoom,
  onCountClick,
}: BlueprintCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  const [drawingState, setDrawingState] = useState<DrawingState>({
    isDrawing: false,
    startPoint: null,
    currentPoints: [],
    previewShape: null,
  });
  
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [selectedAnnotation, setSelectedAnnotation] = useState<string | null>(null);

  const { data: annotations = [], isLoading } = useQuery<Annotation[]>({
    queryKey: ["/api/blueprints", blueprintId, "annotations", pageNumber],
    queryFn: () => fetch(`/api/blueprints/${blueprintId}/annotations?pageNumber=${pageNumber}`).then(r => r.json()),
    enabled: !!blueprintId,
  });

  const createAnnotationMutation = useMutation({
    mutationFn: async (data: Omit<Annotation, "id">) => {
      return apiRequest("POST", `/api/blueprints/${blueprintId}/annotations`, data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints", blueprintId, "annotations", pageNumber] });
      toast({ title: "Annotation saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save annotation", description: error.message, variant: "destructive" });
    },
  });

  const deleteAnnotationMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/annotations/${id}`);
    },
    onSuccess: (_, deletedId) => {
      setUndoStack(prev => [...prev, deletedId]);
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints", blueprintId, "annotations", pageNumber] });
    },
  });

  const getCanvasCoords = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (activeTool === "select") {
      const coords = getCanvasCoords(e);
      const clickedAnnotation = annotations.find(a => isPointInAnnotation(coords, a));
      setSelectedAnnotation(clickedAnnotation?.id || null);
      return;
    }
    
    if (activeTool === "count") {
      const coords = getCanvasCoords(e);
      onCountClick?.(coords.x, coords.y);
      return;
    }

    const coords = getCanvasCoords(e);
    setDrawingState({
      isDrawing: true,
      startPoint: coords,
      currentPoints: [coords],
      previewShape: null,
    });
  }, [activeTool, annotations, getCanvasCoords, onCountClick]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawingState.isDrawing || !drawingState.startPoint) return;
    
    const coords = getCanvasCoords(e);
    
    const freehandTools = ["pencil", "text"];
    if (freehandTools.includes(activeTool)) {
      setDrawingState(prev => ({
        ...prev,
        currentPoints: [...prev.currentPoints, coords],
      }));
    } else {
      setDrawingState(prev => ({
        ...prev,
        previewShape: {
          start: prev.startPoint!,
          end: coords,
          width: Math.abs(coords.x - prev.startPoint!.x),
          height: Math.abs(coords.y - prev.startPoint!.y),
        },
      }));
    }
  }, [drawingState.isDrawing, drawingState.startPoint, activeTool, getCanvasCoords]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!drawingState.isDrawing || !drawingState.startPoint) return;
    
    const coords = getCanvasCoords(e);
    const color = TOOL_COLORS[activeTool] || "#ef4444";
    const annotationType = TOOL_TO_ANNOTATION_TYPE[activeTool] || activeTool;
    
    let dataJson: Annotation["dataJson"] = {};
    
    switch (activeTool) {
      case "pencil":
      case "text":
        dataJson = { points: drawingState.currentPoints };
        break;
      case "arrow":
        dataJson = { start: drawingState.startPoint, end: coords };
        break;
      case "rectangle":
      case "area":
      case "highlight":
        dataJson = {
          start: {
            x: Math.min(drawingState.startPoint.x, coords.x),
            y: Math.min(drawingState.startPoint.y, coords.y),
          },
          width: Math.abs(coords.x - drawingState.startPoint.x),
          height: Math.abs(coords.y - drawingState.startPoint.y),
        };
        break;
      case "cloud":
        const centerX = (drawingState.startPoint.x + coords.x) / 2;
        const centerY = (drawingState.startPoint.y + coords.y) / 2;
        dataJson = {
          center: { x: centerX, y: centerY },
          width: Math.abs(coords.x - drawingState.startPoint.x),
          height: Math.abs(coords.y - drawingState.startPoint.y),
        };
        break;
      default:
        setDrawingState({
          isDrawing: false,
          startPoint: null,
          currentPoints: [],
          previewShape: null,
        });
        return;
    }

    const drawingTools = ["pencil", "text", "arrow", "rectangle", "area", "highlight", "cloud"];
    if (drawingTools.includes(activeTool)) {
      createAnnotationMutation.mutate({
        blueprintId,
        pageNumber,
        annotationType,
        dataJson,
        color,
        tenantId: "default",
      } as any);
    }

    setDrawingState({
      isDrawing: false,
      startPoint: null,
      currentPoints: [],
      previewShape: null,
    });
  }, [drawingState, activeTool, blueprintId, pageNumber, getCanvasCoords, createAnnotationMutation]);

  function isPointInAnnotation(point: { x: number; y: number }, annotation: Annotation): boolean {
    const data = annotation.dataJson;
    const tolerance = 10;
    
    switch (annotation.annotationType) {
      case "rectangle":
        if (data.start && data.width && data.height) {
          return (
            point.x >= data.start.x - tolerance &&
            point.x <= data.start.x + data.width + tolerance &&
            point.y >= data.start.y - tolerance &&
            point.y <= data.start.y + data.height + tolerance
          );
        }
        break;
      case "cloud":
        if (data.center && data.width && data.height) {
          const dx = (point.x - data.center.x) / (data.width / 2 + tolerance);
          const dy = (point.y - data.center.y) / (data.height / 2 + tolerance);
          return dx * dx + dy * dy <= 1;
        }
        break;
      case "arrow":
        if (data.start && data.end) {
          const dist = distanceToLine(point, data.start, data.end);
          return dist <= tolerance;
        }
        break;
      case "pencil":
        if (data.points) {
          return data.points.some(p => 
            Math.abs(point.x - p.x) <= tolerance && Math.abs(point.y - p.y) <= tolerance
          );
        }
        break;
    }
    return false;
  }

  function distanceToLine(
    point: { x: number; y: number },
    lineStart: { x: number; y: number },
    lineEnd: { x: number; y: number }
  ): number {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    let xx, yy;
    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }
    const dx = point.x - xx;
    const dy = point.y - yy;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const drawAnnotation = useCallback((ctx: CanvasRenderingContext2D, annotation: Annotation) => {
    const data = annotation.dataJson;
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color + "20";
    ctx.lineWidth = selectedAnnotation === annotation.id ? 4 : 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (annotation.annotationType) {
      case "pencil":
        if (data.points && data.points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(data.points[0].x, data.points[0].y);
          data.points.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
          ctx.stroke();
        }
        break;
        
      case "arrow":
        if (data.start && data.end) {
          drawArrow(ctx, data.start, data.end, annotation.color);
        }
        break;
        
      case "rectangle":
        if (data.start && data.width && data.height) {
          ctx.beginPath();
          ctx.rect(data.start.x, data.start.y, data.width, data.height);
          ctx.fill();
          ctx.stroke();
        }
        break;
        
      case "highlight":
        if (data.start && data.width && data.height) {
          ctx.fillStyle = annotation.color + "40";
          ctx.beginPath();
          ctx.rect(data.start.x, data.start.y, data.width, data.height);
          ctx.fill();
        }
        break;
        
      case "cloud":
        if (data.center && data.width && data.height) {
          drawCloud(ctx, data.center, data.width, data.height);
        }
        break;
    }
  }, [selectedAnnotation]);

  function drawArrow(
    ctx: CanvasRenderingContext2D,
    start: { x: number; y: number },
    end: { x: number; y: number },
    color: string
  ) {
    const headLen = 15;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    
    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawCloud(
    ctx: CanvasRenderingContext2D,
    center: { x: number; y: number },
    width: number,
    height: number
  ) {
    const numBumps = 12;
    const rx = width / 2;
    const ry = height / 2;
    
    ctx.beginPath();
    for (let i = 0; i <= numBumps; i++) {
      const angle = (i / numBumps) * Math.PI * 2;
      const bumpRadius = 8 + Math.sin(i * 3) * 4;
      const x = center.x + (rx + bumpRadius * Math.cos(i * 5)) * Math.cos(angle);
      const y = center.y + (ry + bumpRadius * Math.sin(i * 5)) * Math.sin(angle);
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevAngle = ((i - 1) / numBumps) * Math.PI * 2;
        const cpX = center.x + rx * 1.2 * Math.cos((angle + prevAngle) / 2);
        const cpY = center.y + ry * 1.2 * Math.sin((angle + prevAngle) / 2);
        ctx.quadraticCurveTo(cpX, cpY, x, y);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#fafafa");
    gradient.addColorStop(0.5, "#f5f5f5");
    gradient.addColorStop(1, "#f0f0f0");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const gridSize = 25;
    ctx.strokeStyle = "#e8e8e8";
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    
    ctx.strokeStyle = "#d4d4d4";
    ctx.lineWidth = 1;
    const majorGridSize = 100;
    for (let x = 0; x <= canvas.width; x += majorGridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += majorGridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    annotations.forEach(annotation => drawAnnotation(ctx, annotation));

    if (drawingState.isDrawing && drawingState.startPoint) {
      const color = TOOL_COLORS[activeTool] || "#ef4444";
      ctx.strokeStyle = color;
      ctx.fillStyle = color + "20";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);

      if (activeTool === "pencil" && drawingState.currentPoints.length > 1) {
        ctx.beginPath();
        ctx.moveTo(drawingState.currentPoints[0].x, drawingState.currentPoints[0].y);
        drawingState.currentPoints.slice(1).forEach(p => ctx.lineTo(p.x, p.y));
        ctx.stroke();
      } else if (drawingState.previewShape) {
        const { start, end, width, height } = drawingState.previewShape;
        if (start && end) {
          if (activeTool === "rectangle" && width && height) {
            ctx.beginPath();
            ctx.rect(
              Math.min(start.x, end.x),
              Math.min(start.y, end.y),
              width,
              height
            );
            ctx.fill();
            ctx.stroke();
          } else if (activeTool === "arrow") {
            drawArrow(ctx, start, end, color);
          } else if (activeTool === "cloud" && width && height) {
            const centerX = (start.x + end.x) / 2;
            const centerY = (start.y + end.y) / 2;
            drawCloud(ctx, { x: centerX, y: centerY }, width, height);
          }
        }
      }
      ctx.setLineDash([]);
    }
  }, [annotations, drawingState, activeTool, drawAnnotation, selectedAnnotation]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedAnnotation) {
        deleteAnnotationMutation.mutate(selectedAnnotation);
        setSelectedAnnotation(null);
      }
    }
    if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      toast({ title: "Undo", description: "Undo functionality - last deleted item can be restored" });
    }
  }, [selectedAnnotation, deleteAnnotationMutation, toast]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const canvasWidth = 816;
  const canvasHeight = 1056;

  const hasAnnotations = annotations && annotations.length > 0;
  const showEmptyState = !isLoading && !hasAnnotations && activeTool === "select";

  return (
    <div 
      ref={containerRef}
      className="relative bg-white rounded shadow-lg mx-auto overflow-hidden"
      style={{ 
        width: `${(canvasWidth * zoom) / 100}px`,
        height: `${(canvasHeight * zoom) / 100}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        className="w-full h-full"
        style={{ cursor: activeTool === "select" ? "default" : "crosshair" }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        data-testid="canvas-blueprint"
      />
      {showEmptyState && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="bg-muted/80 backdrop-blur-sm rounded-lg p-8 text-center shadow-sm border border-border/50">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-primary/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Blueprint Canvas Ready</h3>
            <p className="text-sm text-muted-foreground max-w-xs">
              Select a drawing tool from the toolbar above to start adding annotations, measurements, and takeoff counts.
            </p>
          </div>
        </div>
      )}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/50">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
        </div>
      )}
    </div>
  );
}
