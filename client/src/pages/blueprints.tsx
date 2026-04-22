import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import { BlueprintCanvas } from "@/components/BlueprintCanvas";
import {
  FileText, Upload, Ruler, Square, Circle, ArrowUp,
  MousePointer, ZoomIn, ZoomOut, RotateCw, Layers,
  Download, Hash, Pencil, Trash2, Plus, Cloud, ChevronRight,
  ChevronLeft, Maximize2
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface Blueprint {
  id: string;
  title: string;
  fileName: string;
  storageKey?: string;
  pageCount: number;
  scale?: string;
  category: string;
  uploadedAt: string;
}

interface TakeoffItem {
  id: string;
  blueprintId: string;
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
  category: string;
  color: string;
  createdAt: string;
}

interface Annotation {
  id: string;
  blueprintId: string;
  pageNumber: number;
  annotationType: "cloud" | "arrow" | "text" | "highlight" | "measurement";
  dataJson: Record<string, unknown>;
  color: string;
  createdAt: string;
}

const TOOL_ICONS = {
  select: MousePointer,
  cloud: Cloud,
  arrow: ArrowUp,
  text: Pencil,
  highlight: Square,
  measure: Ruler,
  area: Square,
  count: Hash,
};

const CATEGORIES = [
  "Architectural",
  "Structural", 
  "Mechanical",
  "Electrical",
  "Plumbing",
  "Civil",
  "Landscape",
  "Fire Protection",
  "General",
];

const UNITS = [
  "Each",
  "Linear Feet",
  "Square Feet",
  "Square Yards",
  "Cubic Feet",
  "Cubic Yards",
  "Gallons",
  "Pounds",
  "Tons",
];

export default function Blueprints() {
  const { toast } = useToast();
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  const [activeTool, setActiveTool] = useState<string>("select");
  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [showTakeoffPanel, setShowTakeoffPanel] = useState(true);
  const [isAddTakeoffOpen, setIsAddTakeoffOpen] = useState(false);
  const [newTakeoff, setNewTakeoff] = useState({
    name: "",
    quantity: 1,
    unit: "Each",
    category: "General",
    notes: "",
  });

  const { data: blueprints = [], isLoading: loadingBlueprints } = useQuery<Blueprint[]>({
    queryKey: ["/api/blueprints"],
  });

  const { data: takeoffItems = [], isLoading: loadingTakeoffs } = useQuery<TakeoffItem[]>({
    queryKey: ["/api/takeoffs", { blueprintId: selectedBlueprint?.id }],
    queryFn: () => fetch(`/api/takeoffs?blueprintId=${selectedBlueprint?.id}`).then(r => r.json()),
    enabled: !!selectedBlueprint,
  });

  const { data: annotations = [] } = useQuery<Annotation[]>({
    queryKey: ["/api/blueprints", selectedBlueprint?.id, "annotations", currentPage],
    queryFn: () => fetch(`/api/blueprints/${selectedBlueprint?.id}/annotations?pageNumber=${currentPage}`).then(r => r.json()),
    enabled: !!selectedBlueprint,
  });

  const createTakeoffMutation = useMutation({
    mutationFn: async (data: typeof newTakeoff) => {
      if (!selectedBlueprint) throw new Error("No blueprint selected");
      return apiRequest("POST", "/api/takeoffs", {
        ...data,
        blueprintId: selectedBlueprint.id,
        color: getRandomColor(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoffs"] });
      setIsAddTakeoffOpen(false);
      setNewTakeoff({ name: "", quantity: 1, unit: "Each", category: "General", notes: "" });
      toast({ title: "Takeoff item added" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add takeoff", description: error.message, variant: "destructive" });
    },
  });

  const deleteTakeoffMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/takeoffs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoffs"] });
      toast({ title: "Takeoff item deleted" });
    },
  });

  const exportTakeoffsMutation = useMutation({
    mutationFn: async () => {
      const csvContent = [
        ["Name", "Quantity", "Unit", "Category", "Notes"].join(","),
        ...takeoffItems.map(item => 
          [item.name, item.quantity, item.unit, item.category, item.notes || ""].join(",")
        ),
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `takeoff-${selectedBlueprint?.title || "export"}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onSuccess: () => {
      toast({ title: "Takeoffs exported to CSV" });
    },
  });

  const createBlueprintMutation = useMutation({
    mutationFn: async (data: { title: string; fileName: string; storageKey: string; fileSize: number; category: string }) => {
      return apiRequest("POST", "/api/blueprints", {
        title: data.title,
        fileName: data.fileName,
        storageKey: data.storageKey,
        fileSize: data.fileSize,
        mimeType: "application/pdf",
        pageCount: 1,
        category: data.category,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blueprints"] });
      toast({ title: "Blueprint uploaded successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save blueprint", description: error.message, variant: "destructive" });
    },
  });

  const [pendingUpload, setPendingUpload] = useState<{ name: string; objectPath: string; size: number } | null>(null);

  async function handleGetUploadParams(file: { name: string; size: number | null; type: string }) {
    const fileSize = file.size ?? 0;
    const res = await fetch("/api/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: file.name,
        size: fileSize,
        contentType: file.type,
      }),
    });
    if (!res.ok) {
      toast({ title: "Upload failed", description: "Could not get upload URL", variant: "destructive" });
      throw new Error("Failed to get upload URL");
    }
    const { uploadURL, objectPath } = await res.json();
    setPendingUpload({ name: file.name, objectPath, size: fileSize });
    return {
      method: "PUT" as const,
      url: uploadURL as string,
      headers: { "Content-Type": file.type },
    };
  }

  function handleUploadComplete() {
    if (pendingUpload) {
      createBlueprintMutation.mutate({
        title: pendingUpload.name.replace(/\.[^/.]+$/, ""),
        fileName: pendingUpload.name,
        storageKey: pendingUpload.objectPath,
        fileSize: pendingUpload.size,
        category: "General",
      });
      setPendingUpload(null);
    }
  }

  function handleDownload(bp: Blueprint) {
    if (bp.storageKey) {
      window.open(bp.storageKey, "_blank");
    } else {
      toast({ title: "Download unavailable", description: "No file associated with this blueprint" });
    }
  }

  function getRandomColor() {
    const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function handleZoomIn() {
    setZoom(Math.min(zoom + 25, 300));
  }

  function handleZoomOut() {
    setZoom(Math.max(zoom - 25, 25));
  }

  function handleRotate() {
    toast({ title: "Rotate", description: "Blueprint rotated 90 degrees" });
  }

  function handleCalibrate() {
    toast({ 
      title: "Scale Calibration", 
      description: "Click two points on a known dimension to set the scale" 
    });
    setActiveTool("measure");
  }

  if (!selectedBlueprint) {
    return (
      <div className="flex flex-col h-full p-6 gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Blueprints & Takeoffs</h1>
            <p className="text-muted-foreground">View construction drawings and create takeoffs</p>
          </div>
          <ObjectUploader
            onGetUploadParameters={handleGetUploadParams}
            onComplete={handleUploadComplete}
            maxFileSize={52428800}
          >
            <Upload className="w-4 h-4 mr-2" />
            Upload Blueprint
          </ObjectUploader>
        </div>

        {loadingBlueprints ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4">
                  <div className="h-32 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded mt-3 w-3/4" />
                  <div className="h-3 bg-muted rounded mt-2 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : blueprints.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16">
            <FileText className="h-16 w-16 text-muted-foreground mb-4" />
            <CardTitle className="mb-2">No Blueprints</CardTitle>
            <CardDescription className="text-center mb-4">
              Upload construction drawings to begin takeoffs
            </CardDescription>
            <ObjectUploader
              onGetUploadParameters={handleGetUploadParams}
              onComplete={handleUploadComplete}
              maxFileSize={52428800}
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Blueprint
            </ObjectUploader>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {blueprints.map(bp => (
              <Card 
                key={bp.id}
                className="hover-elevate"
                data-testid={`card-blueprint-${bp.id}`}
              >
                <CardContent className="p-4">
                  <div 
                    className="h-32 bg-muted rounded flex items-center justify-center mb-3 cursor-pointer"
                    onClick={() => setSelectedBlueprint(bp)}
                  >
                    <FileText className="h-12 w-12 text-muted-foreground" />
                  </div>
                  <div 
                    className="font-medium truncate cursor-pointer"
                    onClick={() => setSelectedBlueprint(bp)}
                  >
                    {bp.title}
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant="secondary">{bp.category}</Badge>
                      <span>{bp.pageCount} pages</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(bp);
                      }}
                      data-testid={`button-download-blueprint-${bp.id}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Quick Start</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Upload className="h-5 w-5 text-primary" />
                <span className="font-medium">1. Upload</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Upload PDF drawings from bid documents
              </p>
            </div>
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Ruler className="h-5 w-5 text-primary" />
                <span className="font-medium">2. Calibrate</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Set the scale using a known dimension
              </p>
            </div>
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="h-5 w-5 text-primary" />
                <span className="font-medium">3. Takeoff</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Measure, count, and export quantities
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between gap-4 p-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelectedBlueprint(null)}
            data-testid="button-back"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="font-semibold" data-testid="text-blueprint-title">{selectedBlueprint.title}</h2>
            <p className="text-xs text-muted-foreground">
              {selectedBlueprint.category} • {selectedBlueprint.pageCount} pages
              {selectedBlueprint.scale && ` • Scale: ${selectedBlueprint.scale}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-muted">
          {(Object.keys(TOOL_ICONS) as Array<keyof typeof TOOL_ICONS>).map(tool => {
            const Icon = TOOL_ICONS[tool];
            return (
              <Button
                key={tool}
                variant={activeTool === tool ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8"
                onClick={() => setActiveTool(tool)}
                title={tool.charAt(0).toUpperCase() + tool.slice(1)}
                data-testid={`button-tool-${tool}`}
              >
                <Icon className="h-4 w-4" />
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={handleZoomOut} data-testid="button-zoom-out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm w-12 text-center">{zoom}%</span>
          <Button variant="ghost" size="icon" onClick={handleZoomIn} data-testid="button-zoom-in">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button variant="ghost" size="icon" onClick={handleRotate} data-testid="button-rotate">
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleCalibrate} data-testid="button-calibrate">
            <Ruler className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" data-testid="button-fullscreen">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => handleDownload(selectedBlueprint)}
            data-testid="button-download-current"
            title="Download Blueprint"
          >
            <Download className="h-4 w-4" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant={showTakeoffPanel ? "secondary" : "ghost"}
            size="icon"
            onClick={() => setShowTakeoffPanel(!showTakeoffPanel)}
            data-testid="button-toggle-takeoff"
          >
            <Layers className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-auto bg-muted/50 p-4 flex justify-center">
          <BlueprintCanvas
            blueprintId={selectedBlueprint.id}
            pageNumber={currentPage}
            activeTool={activeTool}
            zoom={zoom}
            onCountClick={(x, y) => {
              setIsAddTakeoffOpen(true);
              toast({ title: "Count marker placed", description: `Position: (${Math.round(x)}, ${Math.round(y)})` });
            }}
          />
        </div>

        {showTakeoffPanel && (
          <div className="w-80 border-l bg-background overflow-hidden flex flex-col">
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="font-semibold">Takeoff Items</h3>
              <div className="flex gap-1">
                <Dialog open={isAddTakeoffOpen} onOpenChange={setIsAddTakeoffOpen}>
                  <DialogTrigger asChild>
                    <Button size="icon" variant="ghost" data-testid="button-add-takeoff">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Takeoff Item</DialogTitle>
                      <DialogDescription>
                        Add a new quantity item to this blueprint
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Item Name</Label>
                        <Input
                          value={newTakeoff.name}
                          onChange={e => setNewTakeoff(p => ({ ...p, name: e.target.value }))}
                          placeholder="e.g., 2x4 Studs"
                          data-testid="input-takeoff-name"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Quantity</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={newTakeoff.quantity}
                            onChange={e => setNewTakeoff(p => ({ ...p, quantity: parseFloat(e.target.value) || 0 }))}
                            data-testid="input-takeoff-quantity"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Unit</Label>
                          <Select
                            value={newTakeoff.unit}
                            onValueChange={v => setNewTakeoff(p => ({ ...p, unit: v }))}
                          >
                            <SelectTrigger data-testid="select-takeoff-unit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {UNITS.map(u => (
                                <SelectItem key={u} value={u}>{u}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Category</Label>
                        <Select
                          value={newTakeoff.category}
                          onValueChange={v => setNewTakeoff(p => ({ ...p, category: v }))}
                        >
                          <SelectTrigger data-testid="select-takeoff-category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(c => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Notes</Label>
                        <Textarea
                          value={newTakeoff.notes}
                          onChange={e => setNewTakeoff(p => ({ ...p, notes: e.target.value }))}
                          placeholder="Optional notes..."
                          data-testid="input-takeoff-notes"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsAddTakeoffOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => createTakeoffMutation.mutate(newTakeoff)}
                        disabled={!newTakeoff.name || createTakeoffMutation.isPending}
                        data-testid="button-save-takeoff"
                      >
                        Add Item
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  onClick={() => exportTakeoffsMutation.mutate()}
                  disabled={takeoffItems.length === 0}
                  data-testid="button-export-takeoffs"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-3">
              {loadingTakeoffs ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-muted rounded animate-pulse" />
                  ))}
                </div>
              ) : takeoffItems.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Hash className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No takeoff items yet</p>
                  <p className="text-xs">Click + to add items</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {takeoffItems.map(item => (
                    <Card key={item.id} className="p-3" data-testid={`takeoff-item-${item.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full flex-shrink-0" 
                            style={{ backgroundColor: item.color }}
                          />
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {item.quantity} {item.unit}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => deleteTakeoffMutation.mutate(item.id)}
                          data-testid={`button-delete-takeoff-${item.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      {item.notes && (
                        <p className="text-xs text-muted-foreground mt-2">{item.notes}</p>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {takeoffItems.length > 0 && (
              <div className="p-3 border-t bg-muted/50">
                <div className="text-sm font-medium mb-2">Summary</div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Total Items:</span>
                    <span>{takeoffItems.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Categories:</span>
                    <span>{new Set(takeoffItems.map(i => i.category)).size}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 p-2 border-t bg-background text-sm">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="w-20 text-center">
            Page {currentPage} / {selectedBlueprint.pageCount}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={currentPage >= selectedBlueprint.pageCount}
            onClick={() => setCurrentPage(p => p + 1)}
            data-testid="button-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-muted-foreground">
          <span>Tool: {activeTool}</span>
          <div className="w-px h-4 bg-border" />
          <span>Annotations: {annotations.length}</span>
        </div>
      </div>
    </div>
  );
}
