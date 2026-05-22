import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, FolderOpen, ChevronRight, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";

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
    <Card className="overflow-hidden" data-testid="card-egnyte-recent">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold tracking-tight">Recent documents</h2>
            <Badge variant="secondary" className="text-[10px] h-5">Egnyte</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-egnyte">
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => setLocation("/documents")} data-testid="button-open-documents">
              View all<ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>

        {isLoading && (
          <div className="divide-y">
            {[0,1,2,3].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && error && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <AlertCircle className="h-3.5 w-3.5" />Couldn't reach Egnyte.
          </div>
        )}

        {!isLoading && !error && docs.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-muted-foreground">
            No recent documents from Egnyte.
            <div className="mt-2">
              <Button variant="outline" size="sm" onClick={() => setLocation("/automation/egnyte-sync")} data-testid="button-egnyte-setup">Check Egnyte sync</Button>
            </div>
          </div>
        )}

        {!isLoading && !error && docs.length > 0 && (
          <div className="divide-y">
            {docs.slice(0, 6).map((d, i) => (
              <button
                key={d.id ?? d.path ?? i}
                onClick={() => setLocation(`/documents?path=${encodeURIComponent(d.path ?? d.name)}`)}
                className="w-full flex items-center gap-3 px-4 py-3 hover-elevate text-left transition-colors"
                data-testid={`row-egnyte-${i}`}
              >
                <div className="h-8 w-8 rounded-md bg-cyan-500/10 text-cyan-500 flex items-center justify-center ring-1 ring-cyan-500/20 shrink-0">
                  <FileText className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{d.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{d.projectName ?? d.folder ?? d.path ?? ""}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  {fmtTime(d.modifiedAt)}
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default EgnyteRecentDocs;
