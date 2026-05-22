import { useRef, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Upload, Zap, Ruler, ArrowRight, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
    } finally { setUploading(false); }
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };

  return (
    <Card className="relative overflow-hidden border-violet-500/20 bg-gradient-to-br from-violet-500/[0.08] via-background to-blue-500/[0.06] shadow-sm" data-testid="card-smart-takeoff-spotlight">
      <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-violet-500/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
      <CardContent className="relative p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center ring-1 ring-violet-500/40"><Ruler className="h-4 w-4" /></div>
            <div>
              <div className="flex items-center gap-2"><h2 className="text-sm font-semibold tracking-tight">Smart Takeoff</h2><Badge className="gap-1 text-[10px] h-5 px-1.5 bg-violet-500 text-white border-0 shadow-sm"><Sparkles className="h-3 w-3" />AI</Badge></div>
              <p className="text-xs text-muted-foreground">Drop a sheet PDF, get AI quantities in ~90 seconds.</p>
            </div>
          </div>
          <span className="text-[10px] uppercase tracking-wider text-violet-400/80 hidden sm:inline">Beta</span>
        </div>

        <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} className={`group relative cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-all ${drag ? "border-violet-500 bg-violet-500/15 scale-[0.99]" : "border-violet-500/30 hover:border-violet-500/60 hover:bg-violet-500/[0.06]"}`} data-testid="dropzone-takeoff">
          {uploading ? (<><Zap className="h-8 w-8 mx-auto mb-2 text-violet-400 animate-pulse" /><p className="text-sm font-medium">Reading the sheet…</p></>) : (<><Upload className="h-8 w-8 mx-auto mb-2 text-violet-400/60 group-hover:text-violet-400 transition-colors" /><p className="text-sm font-semibold">Drop a PDF sheet</p><p className="text-xs text-muted-foreground mt-1">or click to browse</p></>)}
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} data-testid="input-takeoff-pdf" />
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <Stat icon={FileText} label="Sheets read" value="~90s" tone="text-cyan-400" />
          <Stat icon={Ruler} label="Auto quantities" value="LF / SF / EA" tone="text-emerald-400" />
          <Stat icon={Sparkles} label="Accuracy" value="94% avg" tone="text-violet-400" />
        </div>

        <Button variant="ghost" size="sm" onClick={() => setLocation("/estimate/blueprints")} className="w-full justify-between text-xs text-violet-400 hover:text-violet-300 hover:bg-violet-500/10" data-testid="button-open-takeoff">Open Smart Takeoff workspace<ArrowRight className="h-3 w-3" /></Button>
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col items-center text-center gap-0.5 px-1 py-2 rounded-md bg-background/40 ring-1 ring-white/5">
      <Icon className={`h-3 w-3 ${tone ?? "text-muted-foreground"}`} />
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="font-mono font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export default SmartTakeoffSpotlight;
