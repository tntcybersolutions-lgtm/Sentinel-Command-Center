import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCircle, XCircle, Clock, Search, FileCheck, AlertTriangle, RefreshCw } from "lucide-react";
import { Link } from "wouter";

interface BidReadinessItem {
  id: string;
  title: string;
  status: string;
  dueDate: string | null;
  opportunityId: string | null;
  overallScore: number | null;
  readinessStatus: string | null;
  missingItems: string[];
  hasScore: boolean;
}

function scoreColor(s: number | null) {
  if (s === null) return "bg-gray-100 text-gray-600 border-gray-200";
  if (s >= 80) return "bg-green-100 text-green-800 border-green-200";
  if (s >= 50) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function scoreLabel(s: number | null, status: string | null) {
  if (s === null || !status) return "No Score";
  if (s >= 80 || status === "ready") return "Ready";
  if (s >= 50 || status === "warning") return "At Risk";
  return "Not Ready";
}

function progressColor(s: number | null) {
  if (s === null) return "bg-gray-400";
  if (s >= 80) return "bg-green-500";
  if (s >= 50) return "bg-yellow-500";
  return "bg-red-500";
}

function getScore(item: BidReadinessItem): number {
  return item.overallScore ?? 0;
}

function isReady(item: BidReadinessItem) {
  return getScore(item) >= 80 || item.readinessStatus === "ready";
}

function isAtRisk(item: BidReadinessItem) {
  const s = getScore(item);
  return (s >= 50 && s < 80) || item.readinessStatus === "warning";
}

function isNotReady(item: BidReadinessItem) {
  return getScore(item) < 50 && item.readinessStatus !== "ready" && item.readinessStatus !== "warning";
}

type FilterType = "all" | "ready" | "at-risk" | "not-ready" | "no-score";

export default function BidReadinessDashboard() {
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  const { data: bids = [], isLoading, refetch } = useQuery<BidReadinessItem[]>({
    queryKey: ["/api/bids/readiness-dashboard"],
    queryFn: () => apiRequest("GET", "/api/bids/readiness-dashboard").then(r => r.json()),
    staleTime: 30_000,
  });

  const filtered = bids.filter((b) => {
    const ms = b.title?.toLowerCase().includes(search.toLowerCase()) ?? true;
    if (!ms) return false;
    if (filter === "all") return true;
    if (filter === "no-score") return !b.hasScore;
    if (filter === "ready") return isReady(b);
    if (filter === "at-risk") return isAtRisk(b);
    if (filter === "not-ready") return isNotReady(b);
    return true;
  });

  const totalReady = bids.filter(isReady).length;
  const totalAtRisk = bids.filter(isAtRisk).length;
  const totalNotReady = bids.filter(b => b.hasScore && isNotReady(b)).length;
  const totalNoScore = bids.filter(b => !b.hasScore).length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileCheck className="h-7 w-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Bid Readiness Dashboard</h1>
            <p className="text-sm text-gray-500">Go / No-Go tracker for active bid projects</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <Card className="border-blue-200">
          <CardContent className="pt-4">
            <div className="text-3xl font-bold text-blue-600" data-testid="text-total-bids">{isLoading ? "—" : bids.length}</div>
            <div className="text-sm text-gray-500 mt-1">Total Bids</div>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="pt-4">
            <div className="text-3xl font-bold text-green-600">{isLoading ? "—" : totalReady}</div>
            <div className="text-sm text-gray-500 mt-1">Ready</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200">
          <CardContent className="pt-4">
            <div className="text-3xl font-bold text-yellow-600">{isLoading ? "—" : totalAtRisk}</div>
            <div className="text-sm text-gray-500 mt-1">At Risk</div>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="pt-4">
            <div className="text-3xl font-bold text-red-600">{isLoading ? "—" : totalNotReady}</div>
            <div className="text-sm text-gray-500 mt-1">Not Ready</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search bids..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "ready", "at-risk", "not-ready", "no-score"] as FilterType[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === "all" ? `All (${bids.length})` :
               f === "ready" ? `Ready (${totalReady})` :
               f === "at-risk" ? `At Risk (${totalAtRisk})` :
               f === "not-ready" ? `Not Ready (${totalNotReady})` :
               `No Score (${totalNoScore})`}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6 space-y-3">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
                <div className="h-2 bg-gray-200 rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((bid) => {
            const score = bid.overallScore;
            const label = scoreLabel(score, bid.readinessStatus);
            return (
              <Card key={bid.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base font-semibold truncate">{bid.title}</CardTitle>
                      <p className="text-xs text-gray-400 mt-0.5 font-mono">{bid.status?.toUpperCase()}</p>
                    </div>
                    <Badge className={`text-xs font-semibold border ml-2 flex-shrink-0 ${scoreColor(score)}`}>
                      {label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {bid.hasScore && score !== null ? (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-gray-900">{score}%</span>
                        <div className="flex-1">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${progressColor(score)}`}
                              style={{ width: `${score}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      {bid.missingItems && bid.missingItems.length > 0 && (
                        <div className="flex items-start gap-2 p-2 bg-amber-50 rounded-md border border-amber-100">
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span className="text-xs text-amber-700">
                            {bid.missingItems.length} item(s) need attention before submission.
                          </span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-md border border-gray-100">
                      <AlertTriangle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="text-xs text-gray-500">
                        No readiness score yet.{" "}
                        <Link href={`/bids/${bid.id}`} className="text-blue-600 hover:underline">
                          Run analysis →
                        </Link>
                      </span>
                    </div>
                  )}
                  {bid.dueDate && (
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>Due: {new Date(bid.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-2 text-center py-12 text-gray-400">
              <FileCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>{bids.length === 0 ? "No bids found. Add bids via the Capture Pipeline." : "No bids match your filter."}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
