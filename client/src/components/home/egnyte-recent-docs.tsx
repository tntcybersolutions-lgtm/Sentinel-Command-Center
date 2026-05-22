import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, FolderOpen, ChevronRight, ExternalLink, RefreshCw, AlertCircle, Cloud } from "lucide-react";

interface EgnyteDoc { id?: string; name: string; path?: string; size?: number; modifiedAt?: string; folder?: string; projectName?: string; type?: string; }

function fmtTime(s?: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff/60) + "m ago";
  if (diff < 86400) return Math.floor(diff/3600) + "h ago";
  if (diff < 604800) return Math.floor(diff/86400) + "d ago";
  return d.toLocaleDateString();
}

export function EgnyteRecentDocs() {
  const [, setLocation] = useLocation();
  const { data, isLoading, error, refetch, isFetching } = useQuery<EgnyteDoc[]>({
    queryKey: ["/api/egnyte/recent"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/egnyte/recent?limit=6");
        if (!r.ok) return [];
        const j = await r.json();
        if (Array.isArray(j)) return j;
        if (Array.isArray(j.docs)) return j.docs;
        if (Array.isArray(j.files)) return j.files;
        if (Array.isArray(j.data)) return j.data;
        return [];
      } catch { return []; }
    },
    staleTime: 60_000,
  });
  const docs = data ?? [];
  return (
    <Card className="overflow-hidden border-cyan-500/15 shadow-sm" data-testid="card-egnyte-recent">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-cyan-500/[0.06] to-transparent">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold tracking-tight">Recent documents</h2>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-cyan-500/10 text-cyan-400 border-cyan-500/30 gap-1"><Cloud className="h-2.5 w-2.5" />Egnyte</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-egnyte"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /></Button>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLocation("/documents")} data-testid="button-open-documents">View all<ChevronRight className="h-3 w-3 ml-1" /></Button>
          </div>
        </div>

        {isLoading && (
          <div className="divide-y">{[0,1,2,3].map((i) => (<div key={i} className="flex items-center gap-3 px-4 py-3"><Skeleton className="h-8 w-8 rounded" /><div className="flex-1 space-y-1"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-2 w-1/2" /></div></div>))}</div>
        )}

        {!isLoading && error && (
          <div className="px-6 py-8 text-center space-y-3">
            <div className="h-10 w-10 mx-auto rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center ring-1 ring-amber-500/30"><AlertCircle className="h-5 w-5" /></div>
            <p className="text-sm font-medium">Egnyte connection issue</p>
            <p className="text-xs text-muted-foreground">Couldn't reach Egnyte right now. Your docs are safe — this is just a display issue.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} data-testid="button-egnyte-retry">Retry</Button>
          </div>
        )}

        {!isLoading && !error && docs.length === 0 && (
          <div className="px-6 py-10 text-center space-y-3">
            <div className="h-12 w-12 mx-auto rounded-full bg-cyan-500/10 text-cyan-400 flex items-center justify-center ring-1 ring-cyan-500/30"><Cloud className="h-6 w-6" /></div>
            <div className="space-y-1"><p className="text-sm font-semibold">Egnyte sync ready</p><p className="text-xs text-muted-foreground max-w-xs mx-auto">Once your project documents land in Egnyte, recent files will appear here automatically.</p></div>
            <Button variant="outline" size="sm" onClick={() => setLocation("/automation/egnyte-sync")} data-testid="button-egnyte-setup" className="gap-2"><FolderOpen className="h-3.5 w-3.5" />Open Egnyte sync</Button>
          </div>
        )}

        {!isLoading && !error && docs.length > 0 && (
          <div className="divide-y">{docs.slice(0, 6).map((d, i) => (
            <button key={d.id ?? d.path ?? i} onClick={() => setLocation(`/documents?path=${encodeURIComponent(d.path ?? d.name)}`)} className="group w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 text-left transition-colors" data-testid={`row-egnyte-${i}`}>
              <div className="h-8 w-8 rounded-md bg-cyan-500/15 text-cyan-400 flex items-center justify-center ring-1 ring-cyan-500/30 shrink-0"><FileText className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0"><p className="font-medium text-sm truncate">{d.name}</p><p className="text-xs text-muted-foreground truncate">{d.projectName ?? d.folder ?? d.path ?? ""}</p></div>
              <div className="text-right text-xs text-muted-foreground shrink-0">{fmtTime(d.modifiedAt)}</div>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
            </button>
          ))}</div>
        )}
      </CardContent>
    </Card>
  );
}

export default EgnyteRecentDocs;
