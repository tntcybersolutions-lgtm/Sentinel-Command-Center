import { useRef, useState, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Point {
  x: number;
  y: number;
}

interface AnnotationData {
  points?: Point[];
  text?: string;
  startPoint?: Point;
  endPoint?: Point;
  radius?: number;
  width?: number;
  height?: number;
}

interface Annotation {
  id: string;
  blueprintId: string;
  pageNumber: number;
  annotationType: "cloud" | "arrow" | "text" | "highlight" | "measurement";
  dataJson: AnnotationData;
  color: string;
  createdAt: string;
}

interface AnnotationCanvasProps {
  blueprintId: string;
  pageNumber: number;
  annotations: Annotation[];
  activeTool: string;
  zoom: number;
  scale?: string;
  onAnnotationCreated?: () => void;
  onMeasurement?: (value: number, unit: string) => void;
}

const COLORS = {
  cloud: "#ef4444",
  arrow: "#3b82f6",
  text: "#000000",
  highlight: "#fbbf24",
  measurement: "#22c55e",
};

export function AnnotationCanvas({
  blueprintId,
  pageNumber,
  annotations,
  activeTool,
  zoom,
  scale,
  onAnnotationCreated,
  onMeasurement,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [cloudPoints, setCloudPoints] = useState<Point[]>([]);
  const [textInput, setTextInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [textPosition, setTextPosition] = useState<Point | null>(null);

  const scalePixelsPerUnit = scale ? parseFloat(scale.split(":")[0]) || 1 : 1;

  const createAnnotationMutation = useMutation({
    mutationFn: async (data: { annotationType: string; dataJson: AnnotationData; color: string }) => {
      return apiRequest("POST", `/api/blueprints/${blueprintId}/annotations`, {
        ...data,
        pageNumber,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints", blueprintId, "annotations"] });
      onAnnotationCreated?.();
    },
  });

  const getCanvasPoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>): Point => {
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

  const drawCloud = useCallback((ctx: CanvasRenderingContext2D, points: Point[], color: string) => {
    if (points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);

    ctx.beginPath();
    const arcRadius = 15;
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const arcs = Math.max(2, Math.floor(dist / (arcRadius * 1.5)));
      
      for (let j = 0; j < arcs; j++) {
        const t1 = j / arcs;
        const t2 = (j + 1) / arcs;
        const x1 = p1.x + dx * t1;
        const y1 = p1.y + dy * t1;
        const x2 = p1.x + dx * t2;
        const y2 = p1.y + dy * t2;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const perpX = -(y2 - y1) / 2;
        const perpY = (x2 - x1) / 2;
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx + perpX * 0.5, my + perpY * 0.5, x2, y2);
      }
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  const drawArrow = useCallback((ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = 15;

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(end.x, end.y);
    ctx.lineTo(
      end.x - headLength * Math.cos(angle - Math.PI / 6),
      end.y - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      end.x - headLength * Math.cos(angle + Math.PI / 6),
      end.y - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, []);

  const drawHighlight = useCallback((ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string) => {
    ctx.save();
    ctx.fillStyle = color + "40";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }, []);

  const drawMeasurement = useCallback((ctx: CanvasRenderingContext2D, start: Point, end: Point, color: string, showLabel: boolean = true) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.setLineDash([]);
    const tickLength = 10;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const perpAngle = angle + Math.PI / 2;

    [start, end].forEach(p => {
      ctx.beginPath();
      ctx.moveTo(p.x - tickLength * Math.cos(perpAngle), p.y - tickLength * Math.sin(perpAngle));
      ctx.lineTo(p.x + tickLength * Math.cos(perpAngle), p.y + tickLength * Math.sin(perpAngle));
      ctx.stroke();
    });

    if (showLabel) {
      const distance = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
      const realDistance = (distance / scalePixelsPerUnit).toFixed(2);
      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      
      ctx.font = "14px Arial";
      ctx.fillStyle = "#ffffff";
      const text = `${realDistance} ft`;
      const metrics = ctx.measureText(text);
      ctx.fillRect(midX - metrics.width / 2 - 4, midY - 10, metrics.width + 8, 20);
      ctx.fillStyle = color;
      ctx.fillText(text, midX - metrics.width / 2, midY + 5);
    }

    ctx.restore();
  }, [scalePixelsPerUnit]);

  const drawText = useCallback((ctx: CanvasRenderingContext2D, position: Point, text: string, color: string) => {
    ctx.save();
    ctx.font = "16px Arial";
    ctx.fillStyle = color;
    ctx.fillText(text, position.x, position.y);
    ctx.restore();
  }, []);

  const renderAnnotations = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    annotations.forEach(ann => {
      if (ann.pageNumber !== pageNumber) return;
      const data = ann.dataJson;
      const color = ann.color || COLORS[ann.annotationType as keyof typeof COLORS] || "#000";

      switch (ann.annotationType) {
        case "cloud":
          if (data.points) drawCloud(ctx, data.points, color);
          break;
        case "arrow":
          if (data.startPoint && data.endPoint) drawArrow(ctx, data.startPoint, data.endPoint, color);
          break;
        case "highlight":
          if (data.startPoint && data.endPoint) drawHighlight(ctx, data.startPoint, data.endPoint, color);
          break;
        case "measurement":
          if (data.startPoint && data.endPoint) drawMeasurement(ctx, data.startPoint, data.endPoint, color);
          break;
        case "text":
          if (data.startPoint && data.text) drawText(ctx, data.startPoint, data.text, color);
          break;
      }
    });

    if (isDrawing && startPoint && currentPoint) {
      const color = COLORS[activeTool as keyof typeof COLORS] || "#000";
      switch (activeTool) {
        case "cloud":
          if (cloudPoints.length > 0) drawCloud(ctx, [...cloudPoints, currentPoint], color);
          break;
        case "arrow":
          drawArrow(ctx, startPoint, currentPoint, color);
          break;
        case "highlight":
          drawHighlight(ctx, startPoint, currentPoint, color);
          break;
        case "measure":
          drawMeasurement(ctx, startPoint, currentPoint, COLORS.measurement, true);
          break;
      }
    }
  }, [annotations, pageNumber, isDrawing, startPoint, currentPoint, cloudPoints, activeTool, drawCloud, drawArrow, drawHighlight, drawMeasurement, drawText]);

  useEffect(() => {
    renderAnnotations();
  }, [renderAnnotations]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === "select") return;
    
    const point = getCanvasPoint(e);
    setIsDrawing(true);
    setStartPoint(point);
    setCurrentPoint(point);

    if (activeTool === "cloud") {
      setCloudPoints([point]);
    } else if (activeTool === "text") {
      setTextPosition(point);
      setShowTextInput(true);
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const point = getCanvasPoint(e);
    setCurrentPoint(point);

    if (activeTool === "cloud") {
      setCloudPoints(prev => [...prev, point]);
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !startPoint || !currentPoint) {
      setIsDrawing(false);
      return;
    }

    const color = COLORS[activeTool as keyof typeof COLORS] || "#000";
    let dataJson: AnnotationData = {};
    let annotationType = activeTool;

    switch (activeTool) {
      case "cloud":
        dataJson = { points: cloudPoints };
        break;
      case "arrow":
        dataJson = { startPoint, endPoint: currentPoint };
        break;
      case "highlight":
        dataJson = { startPoint, endPoint: currentPoint };
        break;
      case "measure":
        dataJson = { startPoint, endPoint: currentPoint };
        annotationType = "measurement";
        const distance = Math.sqrt(
          Math.pow(currentPoint.x - startPoint.x, 2) + 
          Math.pow(currentPoint.y - startPoint.y, 2)
        );
        const realDistance = distance / scalePixelsPerUnit;
        onMeasurement?.(realDistance, "ft");
        break;
      case "area":
        dataJson = { startPoint, endPoint: currentPoint };
        annotationType = "highlight";
        const width = Math.abs(currentPoint.x - startPoint.x);
        const height = Math.abs(currentPoint.y - startPoint.y);
        const area = (width * height) / (scalePixelsPerUnit * scalePixelsPerUnit);
        onMeasurement?.(area, "sq ft");
        break;
      default:
        setIsDrawing(false);
        return;
    }

    createAnnotationMutation.mutate({ annotationType, dataJson, color });

    setIsDrawing(false);
    setStartPoint(null);
    setCurrentPoint(null);
    setCloudPoints([]);
  };

  const handleTextSubmit = () => {
    if (textInput && textPosition) {
      createAnnotationMutation.mutate({
        annotationType: "text",
        dataJson: { startPoint: textPosition, text: textInput },
        color: COLORS.text,
      });
    }
    setShowTextInput(false);
    setTextInput("");
    setTextPosition(null);
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        width={816}
        height={1056}
        className="absolute inset-0 w-full h-full"
        style={{ 
          cursor: activeTool === "select" ? "default" : "crosshair",
          pointerEvents: activeTool === "select" ? "none" : "auto",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setIsDrawing(false)}
        data-testid="annotation-canvas"
      />
      {showTextInput && textPosition && (
        <div 
          className="absolute z-10"
          style={{ left: textPosition.x, top: textPosition.y }}
        >
          <input
            type="text"
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleTextSubmit()}
            onBlur={handleTextSubmit}
            className="border rounded px-2 py-1 text-sm"
            placeholder="Enter text..."
            autoFocus
            data-testid="input-annotation-text"
          />
        </div>
      )}
    </div>
  );
}
