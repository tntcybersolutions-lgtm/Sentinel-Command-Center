import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, Clock, Search, FileCheck, AlertTriangle, FolderArchive, ChevronRight } from "lucide-react";

interface BidProject {
  id: string;
  opportunityId?: string | null;
  opportunityTitle?: string | null;
  agency?: string | null;
  status?: string | null;
  progress?: number | null;
  dueAt?: string | null;
  tasksCompleted?: number;
  tasksTotal?: number;
  artifactsReady?: number;
  artifactsTotal?: number;
}

interface SamSummary {
  bidProjectId: string;
  samDocCount: number;
  totalBytes: number;
  lastImportedAt: string | null;
}

function scoreColor(s: number) { if (s >= 80) return "bg-green-100 text-green-800 border-green-200"; if (s >= 50) return "bg-yellow-100 text-yellow-800 border-yellow-200"; return "bg-red-100 text-red-800 border-red-200"; }
function scoreLabel(s: number) { if (s >= 80) return "Ready"; if (s >= 50) return "At Risk"; return "Not Ready"; }
function progressColor(s: number) { if (s >= 80) return "bg-green-500"; if (s >= 50) return "bg-yellow-500"; return "bg-red-500"; }
function formatBytes(b: number) { if (b < 1024) return b + " B"; if (b < 1048576) return (b/1024).toFixed(1) + " KB"; if (b < 1073741824) return (b/1048576).toFixed(1) + " MB"; return (b/1073741824).toFixed(2) + " GB"; }

type FilterType = "all" | "ready" | "at-risk" | "not-ready";

function BidCard({ bid }: { bid: BidProject }) {
  const progress = Number(bid.progress) || 0;
  const { data: sam } = useQuery<SamSummary>({
    queryKey: ["/api/jackets/bid", bid.id, "sam-summary"],
    queryFn: async () => {
      const r = await fetch(`/api/jackets/bid/${bid.id}/sam-summary`);
      if (!r.ok) return { bidProjectId: bid.id, samDocCount: 0, totalBytes: 0, lastImportedAt: null };
      return r.json();
    },
  });

  return (
    <Link href={`/bid-jacket/${bid.id}`}>
      <Card className="cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base font-semibold truncate">{bid.opportunityTitle || "Untitled Bid"}</CardTitle>
              <p className="text-sm text-gray-500 mt-0.5 truncate">{bid.agency || "—"}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge className={`text-xs font-semibold border ${scoreColor(progress)}`}>{scoreLabel(progress)}</Badge>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-900">{progress}%</span>
            <div className="flex-1">
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${progressColor(progress)}`} style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>

          {bid.dueAt && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Clock className="h-3 w-3" />
              <span>Due: {new Date(bid.dueAt).toLocaleDateString()}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5">
            <div className="flex items-center gap-1.5">
              {(bid.tasksCompleted ?? 0) === (bid.tasksTotal ?? 0) && (bid.tasksTotal ?? 0) > 0
                ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                : <Clock className="h-4 w-4 text-gray-300 flex-shrink-0" />}
              <span className="text-xs text-gray-700">Tasks {bid.tasksCompleted ?? 0}/{bid.tasksTotal ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(bid.artifactsReady ?? 0) === (bid.artifactsTotal ?? 0) && (bid.artifactsTotal ?? 0) > 0
                ? <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                : <Clock className="h-4 w-4 text-gray-300 flex-shrink-0" />}
              <span className="text-xs text-gray-700">Artifacts {bid.artifactsReady ?? 0}/{bid.artifactsTotal ?? 0}</span>
            </div>
          </div>

          {/* SAM.gov import status — the missing piece */}
          <div className={`flex items-center gap-2 p-2 rounded-md border ${(sam?.samDocCount ?? 0) > 0 ? "bg-blue-50 border-blue-100" : "bg-gray-50 border-gray-100"}`}>
            <FolderArchive className={`h-4 w-4 flex-shrink-0 ${(sam?.samDocCount ?? 0) > 0 ? "text-blue-600" : "text-gray-400"}`} />
            <div className="flex-1 text-xs">
              {sam === undefined ? (
                <span className="text-gray-500">Loading SAM docs...</span>
              ) : sam.samDocCount > 0 ? (
                <>
                  <span className="font-semibold text-blue-700">{sam.samDocCount} SAM source doc{sam.samDocCount === 1 ? "" : "s"}</span>
                  <span className="text-gray-500"> · {formatBytes(sam.totalBytes)}</span>
                  {sam.lastImportedAt && (
                    <span className="text-gray-400"> · imported {new Date(sam.lastImportedAt).toLocaleDateString()}</span>
                  )}
                </>
              ) : (
                <span className="text-gray-500">No SAM docs imported yet · click to open jacket</span>
              )}
            </div>
          </div>

          {progress < 80 && (
            <div className="flex items-center gap-2 p-2 bg-amber-50 rounded-md border border-amber-100">
              <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <span className="text-xs text-amber-700">{(bid.tasksTotal ?? 0) - (bid.tasksCompleted ?? 0)} task(s), {(bid.artifactsTotal ?? 0) - (bid.artifactsReady ?? 0)} artifact(s) outstanding.</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function BidReadinessDashboard() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const { data: bids = [], isLoading } = useQuery<BidProject[]>({
    queryKey: ["/api/bid-projects"],
    queryFn: async () => {
      const r = await fetch("/api/bid-projects");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const filtered = bids.filter((b) => {
    const title = (b.opportunityTitle || "").toLowerCase();
    const agency = (b.agency || "").toLowerCase();
    const ms = title.includes(search.toLowerCase()) || agency.includes(search.toLowerCase());
    const p = Number(b.progress) || 0;
    const mf = filter === "all"
      || (filter === "ready" && p >= 80)
      || (filter === "at-risk" && p >= 50 && p < 80)
      || (filter === "not-ready" && p < 50);
    return ms && mf;
  });

  const totalReady = bids.filter((b) => (Number(b.progress) || 0) >= 80).length;
  const totalAtRisk = bids.filter((b) => { const p = Number(b.progress) || 0; return p >= 50 && p < 80; }).length;
  const totalNotReady = bids.filter((b) => (Number(b.progress) || 0) < 50).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <FileCheck className="h-7 w-7 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bid Readiness Dashboard</h1>
          <p className="text-sm text-gray-500">Click any bid to open its jacket — SAM source documents, artifacts, checklist</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><div className="text-3xl font-bold text-gray-900">{bids.length}</div><div className="text-sm text-gray-500 mt-1">Total Bids</div></CardContent></Card>
        <Card className="border-green-200"><CardContent className="pt-4"><div className="text-3xl font-bold text-green-600">{totalReady}</div><div className="text-sm text-gray-500 mt-1">Ready</div></CardContent></Card>
        <Card className="border-yellow-200"><CardContent className="pt-4"><div className="text-3xl font-bold text-yellow-600">{totalAtRisk}</div><div className="text-sm text-gray-500 mt-1">At Risk</div></CardContent></Card>
        <Card className="border-red-200"><CardContent className="pt-4"><div className="text-3xl font-bold text-red-600">{totalNotReady}</div><div className="text-sm text-gray-500 mt-1">Not Ready</div></CardContent></Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input placeholder="Search bids or agencies..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          {(["all","ready","at-risk","not-ready"] as FilterType[]).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "ready" ? "Ready" : f === "at-risk" ? "At Risk" : "Not Ready"}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {isLoading && (
          <div className="col-span-2 text-center py-12 text-gray-400">
            <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-30 animate-pulse" />
            <p>Loading bids...</p>
          </div>
        )}
        {!isLoading && filtered.map((bid) => <BidCard key={bid.id} bid={bid} />)}
        {!isLoading && filtered.length === 0 && (
          <div className="col-span-2 text-center py-12 text-gray-400">
            <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>{bids.length === 0 ? "No bid projects yet — create one from the Pipeline page." : "No bids match your filter."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
