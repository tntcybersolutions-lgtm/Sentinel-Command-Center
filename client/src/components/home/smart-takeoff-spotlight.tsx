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
      } else { toast({ title: "Opening takeoff workspace", description: file.name }); setLocation("/estimate/blueprints"); }
    } finally { setUploading(false); }
  };

  const onDrop = (e: React.DragEvent) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); };

  return (
    <Card className="relative overflow-hidden bg-card/80 border-violet-500/30 shadow-lg shadow-violet-500/5" data-testid="card-smart-takeoff-spotlight">
      <div className="absolute -top-16 -right-16 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
      <CardContent className="relative p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-gradient-to-r from-violet-500/[0.08] to-transparent">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-violet-400" />
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Smart Takeoff</h2>
            <Badge className="gap-1 text-[10px] h-5 px-1.5 bg-violet-500 text-white border-0 shadow-sm font-semibold"><Sparkles className="h-3 w-3" />AI</Badge>
          </div>
          <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-violet-500/50 text-violet-200 bg-violet-500/15 font-semibold">BETA</Badge>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">Drop a sheet PDF, get AI quantities in ~90 seconds.</p>
          <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} className={`group relative cursor-pointer rounded-lg border-2 border-dashed py-5 px-4 text-center transition-all ${drag ? "border-violet-500 bg-violet-500/15 scale-[0.99]" : "border-violet-500/40 hover:border-violet-500/70 hover:bg-violet-500/[0.08]"}`} data-testid="dropzone-takeoff">
            {uploading ? (<><Zap className="h-6 w-6 mx-auto mb-1.5 text-violet-400 animate-pulse" /><p className="text-sm font-semibold">Reading the sheet…</p></>) : (<div className="flex items-center justify-center gap-3"><Upload className="h-5 w-5 text-violet-300 group-hover:text-violet-200 transition-colors" /><div className="text-left"><p className="text-sm font-semibold leading-tight text-foreground">Drop a PDF sheet</p><p className="text-xs text-muted-foreground leading-tight">or click to browse</p></div></div>)}
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} data-testid="input-takeoff-pdf" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat icon={FileText} label="Sheets read" value="~90s" tone="text-cyan-400" ring="ring-cyan-500/20" />
            <Stat icon={Ruler} label="Quantities" value="LF / SF / EA" tone="text-emerald-400" ring="ring-emerald-500/20" />
            <Stat icon={Sparkles} label="Accuracy" value="94% avg" tone="text-violet-400" ring="ring-violet-500/20" />
          </div>
          <Button variant="outline" size="sm" onClick={() => setLocation("/estimate/blueprints")} className="w-full justify-between text-xs h-8 border-violet-500/40 bg-violet-500/10 text-violet-100 hover:bg-violet-500/20 hover:text-white" data-testid="button-open-takeoff"><span className="font-semibold">Open Smart Takeoff workspace</span><ArrowRight className="h-3.5 w-3.5" /></Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon: Icon, label, value, tone, ring }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone?: string; ring?: string }) {
  return (
    <div className={`flex flex-col items-center text-center gap-1 px-2 py-2.5 rounded-md bg-white/[0.04] ring-1 ${ring ?? "ring-white/10"}`}>
      <Icon className={`h-3.5 w-3.5 ${tone ?? "text-muted-foreground"}`} />
      <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">{label}</span>
      <span className="font-mono font-bold tabular-nums text-foreground text-xs">{value}</span>
    </div>
  );
}

export default SmartTakeoffSpotlight;
