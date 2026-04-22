import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  RefreshCw,
  Brain,
  Loader2,
  Rss,
  Clock,
  CheckCircle2,
  Search,
  Filter,
  FileEdit,
  FilePlus,
  FileWarning,
  AlertTriangle,
  Eye,
  CheckCheck,
  X,
  ArrowUpDown,
} from "lucide-react";

interface ChangeEvent {
  id: string;
  tenantId: string;
  sourceType: string;
  externalId: string;
  entityId: string | null;
  changeType: string;
  changeSummary: string | null;
  previousHash: string | null;
  newHash: string | null;
  diffJson: any;
  processed: boolean;
  processedAt: string | null;
  createdAt: string;
  opportunity: {
    title: string;
    status: string;
    dueAt: string | null;
    setAside: string | null;
  } | null;
}

interface PaginatedResponse {
  data: ChangeEvent[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export default function CaptureFeed() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [changeTypeFilter, setChangeTypeFilter] = useState<string>("all");
  const [processedFilter, setProcessedFilter] = useState<string>("false");
  const [selectedEvent, setSelectedEvent] = useState<ChangeEvent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { toast } = useToast();

  const { data: response, isLoading, refetch } = useQuery<PaginatedResponse>({
    queryKey: ["/api/v4/change-events", { processed: processedFilter, limit: 200 }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "200" });
      if (processedFilter !== "all") params.set("processed", processedFilter);
      const res = await fetch(`/api/v4/change-events?${params}`);
      return res.json();
    },
  });

  const events = response?.data || [];

  const filtered = useMemo(() => {
    let result = [...events];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(e =>
        (e.changeSummary || "").toLowerCase().includes(q) ||
        (e.opportunity?.title || "").toLowerCase().includes(q) ||
        (e.externalId || "").toLowerCase().includes(q)
      );
    }
    if (sourceFilter !== "all") {
      result = result.filter(e => e.sourceType === sourceFilter);
    }
    if (changeTypeFilter !== "all") {
      result = result.filter(e => e.changeType === changeTypeFilter);
    }
    return result;
  }, [events, searchQuery, sourceFilter, changeTypeFilter]);

  const processMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/v4/change-events/${id}/process`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v4/change-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/stats"] });
      toast({ title: "Marked Processed", description: "Change event has been acknowledged." });
    },
  });

  const processAllMutation = useMutation({
    mutationFn: async () => {
      const unprocessed = filtered.filter(e => !e.processed);
      for (const e of unprocessed) {
        await apiRequest("PATCH", `/api/v4/change-events/${e.id}/process`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v4/change-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/v4/stats"] });
      toast({ title: "All Processed", description: "All visible events marked as processed." });
    },
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/herbie/autonomous/run-cycle");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Scan Complete", description: "HERBIE scanned for new changes." });
    },
    onError: () => {
      toast({ title: "Scan Failed", variant: "destructive" });
    },
  });

  const getChangeTypeIcon = (type: string) => {
    switch (type) {
      case "new": return <FilePlus className="h-4 w-4 text-green-500" />;
      case "updated": return <FileEdit className="h-4 w-4 text-blue-500" />;
      case "amendment": return <FileWarning className="h-4 w-4 text-orange-500" />;
      case "docs_added": return <FilePlus className="h-4 w-4 text-purple-500" />;
      case "status_change": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default: return <Rss className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getChangeTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      new: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
      updated: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      amendment: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
      docs_added: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      status_change: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
    };
    return <Badge className={colors[type] || ""}>{type.replace(/_/g, " ")}</Badge>;
  };

  const getSourceBadge = (source: string) => {
    if (source === "samgov") return <Badge variant="outline" className="text-xs">SAM</Badge>;
    if (source === "highergov") return <Badge variant="outline" className="text-xs">HGov</Badge>;
    return <Badge variant="outline" className="text-xs">{source}</Badge>;
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const unprocessedCount = events.filter(e => !e.processed).length;
  const newCount = events.filter(e => e.changeType === "new").length;
  const amendmentCount = events.filter(e => e.changeType === "amendment").length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 space-y-4 border-b">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Capture Feed</h1>
            <p className="text-sm text-muted-foreground">
              {unprocessedCount} unprocessed changes across {events.length} events
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => processAllMutation.mutate()}
              disabled={processAllMutation.isPending || unprocessedCount === 0}
              data-testid="button-process-all"
            >
              {processAllMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
              Mark All Read
            </Button>
            <Button variant="outline" onClick={() => refetch()} data-testid="button-refresh">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending} data-testid="button-scan">
              {scanMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Brain className="mr-2 h-4 w-4" />}
              Scan
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Pending</span>
              </div>
              <p className="text-xl font-bold mt-1" data-testid="text-pending-count">{unprocessedCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <FilePlus className="h-4 w-4 text-green-500" />
                <span className="text-sm text-muted-foreground">New</span>
              </div>
              <p className="text-xl font-bold mt-1" data-testid="text-new-count">{newCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-orange-500" />
                <span className="text-sm text-muted-foreground">Amendments</span>
              </div>
              <p className="text-xl font-bold mt-1" data-testid="text-amendment-count">{amendmentCount}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search events..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
          <Select value={processedFilter} onValueChange={(v) => { setProcessedFilter(v); }}>
            <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="false">Unprocessed</SelectItem>
              <SelectItem value="true">Processed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[130px]" data-testid="select-source-filter">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="samgov">SAM.gov</SelectItem>
              <SelectItem value="highergov">HigherGov</SelectItem>
              <SelectItem value="manual">Manual</SelectItem>
            </SelectContent>
          </Select>
          <Select value={changeTypeFilter} onValueChange={setChangeTypeFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-type-filter">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="new">New</SelectItem>
              <SelectItem value="updated">Updated</SelectItem>
              <SelectItem value="amendment">Amendment</SelectItem>
              <SelectItem value="docs_added">Docs Added</SelectItem>
              <SelectItem value="status_change">Status Change</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground" data-testid="text-result-count">{filtered.length} events</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-[90px]">Type</TableHead>
                <TableHead className="min-w-[250px]">Change</TableHead>
                <TableHead className="min-w-[200px]">Opportunity</TableHead>
                <TableHead className="w-[80px]">Source</TableHead>
                <TableHead className="w-[80px]">When</TableHead>
                <TableHead className="w-[70px]">Status</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                    No change events match your filters.
                  </TableCell>
                </TableRow>
              ) : filtered.map(event => (
                <TableRow
                  key={event.id}
                  className={`cursor-pointer hover-elevate ${!event.processed ? "bg-muted/30" : ""}`}
                  onClick={() => { setSelectedEvent(event); setDrawerOpen(true); }}
                  data-testid={`row-event-${event.id}`}
                >
                  <TableCell className="pr-0">
                    {getChangeTypeIcon(event.changeType)}
                  </TableCell>
                  <TableCell>
                    {getChangeTypeBadge(event.changeType)}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm line-clamp-1" data-testid={`text-summary-${event.id}`}>
                      {event.changeSummary || "No summary"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {event.opportunity ? (
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium line-clamp-1">{event.opportunity.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {event.opportunity.setAside && <span>{event.opportunity.setAside}</span>}
                        </p>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">--</span>
                    )}
                  </TableCell>
                  <TableCell>{getSourceBadge(event.sourceType)}</TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{formatTimeAgo(event.createdAt)}</span>
                  </TableCell>
                  <TableCell>
                    {event.processed ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-orange-500" />
                    )}
                  </TableCell>
                  <TableCell>
                    {!event.processed && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); processMutation.mutate(event.id); }}
                        data-testid={`button-process-${event.id}`}
                      >
                        <CheckCheck className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="drawer-event-detail">
          {selectedEvent && (
            <div className="space-y-6">
              <SheetHeader>
                <SheetTitle className="text-lg leading-tight pr-6" data-testid="text-drawer-title">
                  Change Event Details
                </SheetTitle>
              </SheetHeader>

              <div className="flex items-center gap-2 flex-wrap">
                {getChangeTypeBadge(selectedEvent.changeType)}
                {getSourceBadge(selectedEvent.sourceType)}
                {selectedEvent.processed ? (
                  <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Processed</Badge>
                ) : (
                  <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">Pending</Badge>
                )}
              </div>

              <Card>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Summary</p>
                    <p className="text-sm" data-testid="text-drawer-summary">{selectedEvent.changeSummary || "No summary available"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Source</p>
                    <p className="text-sm">{selectedEvent.sourceType === "samgov" ? "SAM.gov" : selectedEvent.sourceType === "highergov" ? "HigherGov" : selectedEvent.sourceType}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">External ID</p>
                    <p className="text-sm font-mono text-xs">{selectedEvent.externalId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Timestamp</p>
                    <p className="text-sm">{new Date(selectedEvent.createdAt).toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              {selectedEvent.opportunity && (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <p className="text-xs text-muted-foreground mb-1">Linked Opportunity</p>
                    <p className="text-sm font-medium">{selectedEvent.opportunity.title}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary">{selectedEvent.opportunity.status}</Badge>
                      {selectedEvent.opportunity.setAside && (
                        <Badge variant="outline">{selectedEvent.opportunity.setAside}</Badge>
                      )}
                    </div>
                    {selectedEvent.opportunity.dueAt && (
                      <p className="text-xs text-muted-foreground">
                        Due: {new Date(selectedEvent.opportunity.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              {selectedEvent.diffJson && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-2">Changed Fields</p>
                    <div className="flex gap-1 flex-wrap">
                      {(selectedEvent.diffJson.fields_changed || []).map((f: string) => (
                        <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {!selectedEvent.processed && (
                <Button
                  className="w-full"
                  onClick={() => {
                    processMutation.mutate(selectedEvent.id);
                    setSelectedEvent({ ...selectedEvent, processed: true });
                  }}
                  disabled={processMutation.isPending}
                  data-testid="button-process-drawer"
                >
                  <CheckCheck className="mr-2 h-4 w-4" />
                  Mark as Processed
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
