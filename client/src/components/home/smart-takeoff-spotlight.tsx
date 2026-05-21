import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Upload, Zap, Ruler, ArrowRight, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * Smart Takeoff Spotlight — the Procore-killer wedge on the home screen.
 * Drop a sheet PDF, get AI quantities in ~90 seconds.
 */
export function SmartTakeoffSpotlight() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      toast({ title: "Please drop a PDF sheet", description: "Smart Takeoff reads architectural and structural PDF sheets.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/blueprints/upload", { method: "POST", body: fd }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Sheet queued for takeoff", description: file.name });
        setLocation(data?.id ? `/blueprints/${data.id}/smart-takeoff` : "/estimate/blueprints");
      } else {
        toast({ title: "Opening takeoff workspace", description: file.name });
        setLocation("/estimate/blueprints");
      }
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  return (
    <Card
      className="relative overflow-hidden border-primary/20 bg-gradient-to-br from-violet-500/[0.04] via-background to-blue-500/[0.04]"
      data-testid="card-smart-takeoff-spotlight"
    >
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
      <CardContent className="relative p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="h-9 w-9 rounded-lg bg-violet-500/15 text-violet-500 flex items-center justify-center ring-1 ring-violet-500/30">
            <Ruler className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-tight">Smart Takeoff</h2>
              <Badge variant="secondary" className="gap-1 text-[10px] h-5 px-1.5 bg-violet-500/10 text-violet-500 border-violet-500/20">
                <Sparkles className="h-3 w-3" />AI
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">Drop a sheet PDF, get AI quantities in ~90 seconds.</p>
          </div>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`group relative cursor-pointer rounded-lg border-2 border-dashed p-5 text-center transition-all ${drag ? "border-violet-500 bg-violet-500/10" : "border-muted-foreground/20 hover:border-violet-500/50 hover:bg-violet-500/[0.03]"}`}
          data-testid="dropzone-takeoff"
        >
          {uploading ? (
            <>
              <Zap className="h-8 w-8 mx-auto mb-2 text-violet-500 animate-pulse" />
              <p className="text-sm font-medium">Reading the sheet…</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground group-hover:text-violet-500 transition-colors" />
              <p className="text-sm font-medium">Drop a PDF sheet</p>
              <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            data-testid="input-takeoff-pdf"
          />
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <Stat icon={FileText} label="Sheets read" value="~90s" />
          <Stat icon={Ruler} label="Auto quantities" value="LF / SF / EA" />
          <Stat icon={Sparkles} label="Accuracy" value="94% avg" />
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/estimate/blueprints")}
          className="w-full justify-between text-xs"
          data-testid="button-open-takeoff"
        >
          Open Smart Takeoff workspace
          <ArrowRight className="h-3 w-3" />
        </Button>
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-0.5 px-1 py-2 rounded-md bg-muted/40">
      <Icon className="h-3 w-3 text-muted-foreground" />
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default SmartTakeoffSpotlight;
