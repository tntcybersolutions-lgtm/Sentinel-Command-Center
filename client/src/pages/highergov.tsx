import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Search,
  Loader2,
  Eye,
  X,
  RefreshCw,
  Database,
  CloudDownload,
  ArrowRightCircle,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function formatDate(d: string | undefined | null) {
  if (!d) return "\u2014";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "\u2014";
  return date.toLocaleDateString();
}

function formatValue(v: string | number | undefined | null) {
  if (v == null || v === "") return "\u2014";
  const num = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(num)) return String(v);
  if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
  return `$${num.toFixed(0)}`;
}

function ScoreBadge({ score }: { score: number }) {
  const variant = score >= 60 ? "default" : "secondary";
  return <Badge variant={variant} data-testid="badge-score">Score {score}</Badge>;
}

export default function HigherGov() {
  const [searchInput, setSearchInput] = useState("");
  const [liveQuery, setLiveQuery] = useState("");
  const [dbSearch, setDbSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedResult, setSelectedResult] = useState<any>(null);
  const [showProfileDialog, setShowProfileDialog] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [profileKeywords, setProfileKeywords] = useState("");
  const [profileNaics, setProfileNaics] = useState("");
  const [profileAgencies, setProfileAgencies] = useState("");
  const [profileStates, setProfileStates] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: dbOpps, isLoading: loadingDb } = useQuery<any[]>({
    queryKey: ["/api/highergov/opportunities", dbSearch, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (dbSearch) params.set("search", dbSearch);
      if (statusFilter) params.set("status", statusFilter);
      const qs = params.toString();
      return fetchJson(`/api/highergov/opportunities${qs ? `?${qs}` : ""}`);
    },
  });

  const { data: syncRuns, isLoading: loadingSyncRuns } = useQuery<any[]>({
    queryKey: ["/api/highergov/sync-runs"],
    queryFn: () => fetchJson("/api/highergov/sync-runs"),
  });

  const { data: watchProfiles } = useQuery<any[]>({
    queryKey: ["/api/highergov/watch-profiles"],
    queryFn: () => fetchJson("/api/highergov/watch-profiles"),
  });

  const { data: liveResults, isLoading: loadingLive } = useQuery<any>({
    queryKey: ["/api/integrations/highergov/search", liveQuery],
    queryFn: () => fetchJson(`/api/integrations/highergov/search?q=${encodeURIComponent(liveQuery)}&limit=20`),
    enabled: !!liveQuery,
  });

  const syncMutation = useMutation({
    mutationFn: async (query?: string) => {
      const res = await apiRequest("POST", "/api/highergov/sync", { mode: "manual", query });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/highergov/opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/highergov/sync-runs"] });
      toast({
        title: "Sync Complete",
        description: `Fetched ${data.fetched ?? 0}, inserted ${data.inserted ?? 0}, updated ${data.updated ?? 0}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Sync Failed", description: err.message, variant: "destructive" });
    },
  });

  const convertMutation = useMutation({
    mutationFn: async ({ id, makeBidJacket }: { id: string; makeBidJacket: boolean }) => {
      const res = await apiRequest("POST", `/api/highergov/opportunities/${id}/convert`, { makeBidJacket });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/highergov/opportunities"] });
      toast({ title: "Converted", description: "Opportunity created in pipeline" });
    },
    onError: (err: any) => {
      toast({ title: "Conversion Failed", description: err.message, variant: "destructive" });
    },
  });

  const createProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/highergov/watch-profiles", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/highergov/watch-profiles"] });
      setShowProfileDialog(false);
      setProfileName("");
      setProfileKeywords("");
      setProfileNaics("");
      setProfileAgencies("");
      setProfileStates("");
      toast({ title: "Profile Created", description: "Watch profile saved" });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/highergov/watch-profiles/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/highergov/watch-profiles"] });
      toast({ title: "Profile Deleted" });
    },
  });

  const liveResultsArr = liveResults?.opportunities || liveResults?.results || liveResults?.data || (Array.isArray(liveResults) ? liveResults : []);
  const lastSync = syncRuns && syncRuns.length > 0 ? syncRuns[0] : null;

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of (dbOpps || [])) map[r.status] = (map[r.status] || 0) + 1;
    return map;
  }, [dbOpps]);

  const handleLiveSearch = () => {
    if (searchInput.trim()) {
      setLiveQuery(searchInput.trim());
      setSelectedResult(null);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4" data-testid="page-highergov">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
            HigherGov Intelligence
          </h1>
          <p className="text-sm text-muted-foreground">
            Search, sync, and manage federal opportunities
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastSync && (
            <Badge variant="outline" className="text-xs" data-testid="badge-last-sync">
              <Clock className="h-3 w-3 mr-1" />
              Last sync: {formatDate(lastSync.startedAt)}
              {lastSync.status === "success" ? (
                <CheckCircle2 className="h-3 w-3 ml-1 text-green-600" />
              ) : lastSync.status === "failed" ? (
                <AlertCircle className="h-3 w-3 ml-1 text-destructive" />
              ) : null}
            </Badge>
          )}
          <Button
            variant="outline"
            onClick={() => syncMutation.mutate(undefined)}
            disabled={syncMutation.isPending}
            data-testid="button-sync-now"
          >
            {syncMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CloudDownload className="h-4 w-4 mr-1" />
            )}
            {syncMutation.isPending ? "Syncing..." : "Sync Now"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="database" className="space-y-4">
        <TabsList data-testid="highergov-tabs">
          <TabsTrigger value="database" data-testid="tab-database">
            <Database className="h-4 w-4 mr-1" /> Synced Opportunities
            {dbOpps && <Badge variant="secondary" className="ml-1 text-xs">{dbOpps.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="live" data-testid="tab-live-search">
            <Search className="h-4 w-4 mr-1" /> Live Search
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-sync-history">
            <Clock className="h-4 w-4 mr-1" /> Sync History
          </TabsTrigger>
          <TabsTrigger value="profiles" data-testid="tab-watch-profiles">
            <Settings className="h-4 w-4 mr-1" /> Watch Profiles
          </TabsTrigger>
        </TabsList>

        <TabsContent value="database" className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Filter synced opportunities..."
                className="pl-10"
                value={dbSearch}
                onChange={(e) => setDbSearch(e.target.value)}
                data-testid="input-db-search"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button variant={statusFilter === "" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("")} data-testid="filter-all">
                All
              </Button>
              <Button variant={statusFilter === "new" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("new")} data-testid="filter-new">
                New {statusCounts.new ? <Badge variant="secondary" className="ml-1 text-xs">{statusCounts.new}</Badge> : null}
              </Button>
              <Button variant={statusFilter === "converted" ? "default" : "outline"} size="sm" onClick={() => setStatusFilter("converted")} data-testid="filter-converted">
                Converted {statusCounts.converted ? <Badge variant="secondary" className="ml-1 text-xs">{statusCounts.converted}</Badge> : null}
              </Button>
            </div>
          </div>

          {loadingDb ? (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (dbOpps?.length ?? 0) === 0 ? (
            <Card className="p-6" data-testid="empty-state-opportunities">
              <div className="text-center space-y-2">
                <Database className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No synced opportunities yet. Click <b>Sync Now</b> to pull data from HigherGov.
                </p>
              </div>
            </Card>
          ) : (
            <Table data-testid="table-db-opportunities">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Posted</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Set-Aside</TableHead>
                  <TableHead>NAICS</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dbOpps!.map((opp: any) => (
                  <TableRow key={opp.id} data-testid={`row-db-opp-${opp.id}`}>
                    <TableCell className="font-medium text-sm max-w-[250px] truncate" data-testid={`text-opp-title-${opp.id}`}>{opp.title || "\u2014"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" data-testid={`text-opp-agency-${opp.id}`}>{opp.agency || "\u2014"}</TableCell>
                    <TableCell><ScoreBadge score={opp.score ?? 0} /></TableCell>
                    <TableCell className="text-sm">{formatDate(opp.postedAt)}</TableCell>
                    <TableCell className="text-sm">{formatDate(opp.dueAt)}</TableCell>
                    <TableCell className="text-sm tabular-nums" data-testid={`text-opp-value-${opp.id}`}>{formatValue(opp.estimatedValue)}</TableCell>
                    <TableCell>
                      {opp.setAside ? <Badge variant="secondary">{opp.setAside}</Badge> : <span className="text-sm text-muted-foreground">{"\u2014"}</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{opp.naicsCode || "\u2014"}</TableCell>
                    <TableCell>
                      <Badge variant={opp.status === "converted" ? "default" : "outline"} className="text-xs" data-testid={`badge-status-${opp.id}`}>
                        {opp.status === "converted" ? "Converted" : opp.status === "new" ? "New" : opp.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setSelectedResult(opp)}
                          data-testid={`button-view-db-${opp.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {opp.status !== "converted" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => convertMutation.mutate({ id: opp.id, makeBidJacket: true })}
                            disabled={convertMutation.isPending}
                            data-testid={`button-convert-${opp.id}`}
                          >
                            <ArrowRightCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="live" className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search federal opportunities..."
                className="pl-10"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLiveSearch()}
                data-testid="input-highergov-search"
              />
            </div>
            <Button onClick={handleLiveSearch} disabled={!searchInput.trim() || loadingLive} data-testid="button-highergov-search">
              {loadingLive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              {loadingLive ? "Searching..." : "Search"}
            </Button>
            {liveResultsArr.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncMutation.mutate(searchInput)}
                disabled={syncMutation.isPending}
                data-testid="button-sync-results"
              >
                <CloudDownload className="h-4 w-4 mr-1" />
                Save to Database
              </Button>
            )}
          </div>

          {loadingLive && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching HigherGov...
            </div>
          )}

          {liveQuery && !loadingLive && (
            <Table data-testid="table-highergov-results">
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Agency</TableHead>
                  <TableHead>Posted Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Set-Aside</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {liveResultsArr.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No results found for "{liveQuery}"
                    </TableCell>
                  </TableRow>
                ) : (
                  liveResultsArr.map((r: any, i: number) => (
                    <TableRow key={r.id || i} data-testid={`row-result-${i}`}>
                      <TableCell className="font-medium text-sm max-w-[300px] truncate">{r.title || "\u2014"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.agency || "\u2014"}</TableCell>
                      <TableCell className="text-sm">{formatDate(r.postedDate)}</TableCell>
                      <TableCell className="text-sm">{formatDate(r.dueDate)}</TableCell>
                      <TableCell className="text-sm tabular-nums">{formatValue(r.value)}</TableCell>
                      <TableCell>
                        {r.setAside ? <Badge variant="secondary">{r.setAside}</Badge> : <span className="text-sm text-muted-foreground">{"\u2014"}</span>}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => setSelectedResult(r)} data-testid={`button-view-${i}`}>
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          {loadingSyncRuns ? (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : (syncRuns?.length ?? 0) === 0 ? (
            <Card className="p-6" data-testid="empty-state-history">
              <div className="text-center space-y-2">
                <RefreshCw className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No sync history yet. Click "Sync Now" to run first sync.</p>
              </div>
            </Card>
          ) : (
            <Table data-testid="table-sync-history">
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead>Fetched</TableHead>
                  <TableHead>Inserted</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Errors</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {syncRuns!.map((run: any) => (
                  <TableRow key={run.id} data-testid={`row-sync-${run.id}`}>
                    <TableCell className="text-sm">{new Date(run.startedAt).toLocaleString()}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{run.mode || "\u2014"}</TableCell>
                    <TableCell className="text-sm tabular-nums">{run.fetchedCount ?? 0}</TableCell>
                    <TableCell className="text-sm tabular-nums">{run.insertedCount ?? 0}</TableCell>
                    <TableCell className="text-sm tabular-nums">{run.updatedCount ?? 0}</TableCell>
                    <TableCell className="text-sm tabular-nums">{run.errorCount ?? 0}</TableCell>
                    <TableCell>
                      <Badge
                        variant={run.status === "success" ? "default" : run.status === "failed" ? "destructive" : "secondary"}
                        className="text-xs"
                        data-testid={`badge-sync-status-${run.id}`}
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="profiles" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Watch profiles define scoring criteria for synced opportunities.</p>
            <Button onClick={() => setShowProfileDialog(true)} data-testid="button-create-profile">
              <Plus className="h-4 w-4 mr-1" /> New Profile
            </Button>
          </div>

          {(watchProfiles?.length ?? 0) === 0 ? (
            <Card className="p-6" data-testid="empty-state-profiles">
              <div className="text-center space-y-2">
                <Settings className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No watch profiles yet. Create one to enable opportunity scoring.</p>
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {watchProfiles!.map((profile: any) => (
                <Card key={profile.id} className="p-4" data-testid={`card-profile-${profile.id}`}>
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium" data-testid={`text-profile-name-${profile.id}`}>{profile.name}</span>
                        <Badge variant={profile.isActive ? "default" : "secondary"} className="text-xs">
                          {profile.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 mt-1">
                        {profile.keywordsCsv && <span>Keywords: {profile.keywordsCsv}</span>}
                        {profile.naicsCsv && <span>NAICS: {profile.naicsCsv}</span>}
                        {profile.agenciesCsv && <span>Agencies: {profile.agenciesCsv}</span>}
                        {profile.statesCsv && <span>States: {profile.statesCsv}</span>}
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteProfileMutation.mutate(profile.id)}
                      disabled={deleteProfileMutation.isPending}
                      data-testid={`button-delete-profile-${profile.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {selectedResult && (
        <Card className="fixed bottom-4 right-4 w-96 max-h-[60vh] overflow-auto z-50 shadow-lg" data-testid="panel-detail">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base truncate">{selectedResult.title || "Details"}</CardTitle>
            <Button size="icon" variant="ghost" onClick={() => setSelectedResult(null)} data-testid="button-close-detail">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {Object.entries(selectedResult)
                .filter(([k]) => !["id", "tenantId", "createdAt", "updatedAt", "rawPayloadJson", "rawJson", "raw"].includes(k))
                .map(([key, val]) => (
                  <div key={key}>
                    <span className="text-muted-foreground capitalize">{key.replace(/([A-Z])/g, " $1").trim()}: </span>
                    <span className="font-medium">{val != null ? String(val) : "\u2014"}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showProfileDialog} onOpenChange={setShowProfileDialog}>
        <DialogContent data-testid="dialog-create-profile">
          <DialogHeader>
            <DialogTitle>Create Watch Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Profile Name</Label>
              <Input value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g., Construction Opportunities" data-testid="input-profile-name" />
            </div>
            <div>
              <Label>Keywords (comma-separated)</Label>
              <Input value={profileKeywords} onChange={(e) => setProfileKeywords(e.target.value)} placeholder="e.g., construction, renovation, HVAC" data-testid="input-profile-keywords" />
            </div>
            <div>
              <Label>NAICS Codes (comma-separated)</Label>
              <Input value={profileNaics} onChange={(e) => setProfileNaics(e.target.value)} placeholder="e.g., 236220, 238220" data-testid="input-profile-naics" />
            </div>
            <div>
              <Label>Agencies (comma-separated)</Label>
              <Input value={profileAgencies} onChange={(e) => setProfileAgencies(e.target.value)} placeholder="e.g., VA, Army, Air Force" data-testid="input-profile-agencies" />
            </div>
            <div>
              <Label>States (comma-separated)</Label>
              <Input value={profileStates} onChange={(e) => setProfileStates(e.target.value)} placeholder="e.g., MO, KS, NE" data-testid="input-profile-states" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileDialog(false)}>Cancel</Button>
            <Button
              onClick={() => createProfileMutation.mutate({
                name: profileName || "Default Profile",
                keywordsCsv: profileKeywords,
                naicsCsv: profileNaics,
                agenciesCsv: profileAgencies,
                statesCsv: profileStates,
              })}
              disabled={createProfileMutation.isPending}
              data-testid="button-save-profile"
            >
              {createProfileMutation.isPending ? "Saving..." : "Save Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
