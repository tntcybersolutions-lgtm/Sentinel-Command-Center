import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation, Link } from "wouter";
import {
  Activity,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Settings,
  ExternalLink,
  Clock,
  Zap,
  Building,
  Mail,
  MessageSquare,
  FolderOpen,
  Calculator,
  Link2,
  Unlink,
  Play,
  Pause,
  Database,
  Trash2,
  Plus,
  HardDrive,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface IntegrationStatus {
  id: string;
  name: string;
  description: string;
  status: "healthy" | "warning" | "error" | "disabled";
  lastSync: string | null;
  lastError: string | null;
  metrics: {
    requestsToday: number;
    successRate: number;
    avgLatency: number;
  };
  enabled: boolean;
}

// Real API data only

interface EgnyteStatus {
  configured: boolean;
  connected: boolean;
  domain?: string;
  user?: { username: string; email: string } | null;
}

interface EgnyteRootPath {
  id: string;
  path: string;
  label: string;
  pathType: string;
  enabled: boolean;
  lastScannedAt: string | null;
}

interface EgnyteSyncStatus {
  connection: {
    connected: boolean;
    provider: string;
    domain?: string;
    user?: string;
  };
  lastSync: {
    id: string;
    syncType: string;
    status: string;
    totalItems: number;
    processedItems: number;
    errorCount: number;
    startedAt: string;
    completedAt: string | null;
  } | null;
  rootPaths: EgnyteRootPath[];
  provider: string;
}

export default function Integrations() {
  const { toast } = useToast();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationStatus | null>(null);
  const [location] = useLocation();
  const [newRootPath, setNewRootPath] = useState({ path: "", label: "" });
  const [showAddRootPath, setShowAddRootPath] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [showTokenDialog, setShowTokenDialog] = useState(false);

  // Check for OAuth success/error from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "egnyte") {
      toast({ title: "Egnyte Connected", description: "Successfully connected to Egnyte document storage" });
      window.history.replaceState({}, "", "/integrations");
    } else if (params.get("error")) {
      toast({ title: "Connection Failed", description: `Failed to connect: ${params.get("error")}`, variant: "destructive" });
      window.history.replaceState({}, "", "/integrations");
    }
  }, [location, toast]);

  const { data: integrations, isLoading, refetch } = useQuery<IntegrationStatus[]>({
    queryKey: ["/api/integrations/status"],
  });

  // Egnyte connection status
  const { data: egnyteStatus, refetch: refetchEgnyte } = useQuery<EgnyteStatus>({
    queryKey: ["/api/egnyte/status"],
  });

  // Egnyte sync status (mirror mode)
  const { data: egnyteSyncStatus, refetch: refetchSyncStatus } = useQuery<EgnyteSyncStatus>({
    queryKey: ["/api/egnyte/sync/status"],
  });

  // Add root path mutation
  const addRootPathMutation = useMutation({
    mutationFn: async (data: { path: string; label: string }) => 
      apiRequest("POST", "/api/egnyte/sync/root-paths", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
      setNewRootPath({ path: "", label: "" });
      setShowAddRootPath(false);
      toast({ title: "Root Path Added", description: "The folder path has been added for syncing" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Remove root path mutation
  const removeRootPathMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/egnyte/sync/root-paths/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
      toast({ title: "Root Path Removed", description: "The folder path has been removed" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Connect with username/password mutation (uses configured API credentials)
  const connectInternalMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const response = await apiRequest("POST", "/api/egnyte/connect-internal", data);
      return response.json();
    },
    onSuccess: (data: { message: string; syncStarted: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/status"] });
      setUsername("");
      setPassword("");
      setShowLoginDialog(false);
      toast({ 
        title: "Egnyte Connected", 
        description: data.syncStarted 
          ? "Connected successfully! Initial sync has started automatically." 
          : data.message 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  // Connect with direct access token
  const connectTokenMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", "/api/egnyte/connect-token", { accessToken: token });
      return response.json();
    },
    onSuccess: (data: { message: string; syncStarted: boolean }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/status"] });
      setAccessToken("");
      setShowTokenDialog(false);
      toast({ 
        title: "Egnyte Connected", 
        description: data.syncStarted 
          ? "Connected successfully! Initial sync has started automatically." 
          : data.message 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Connection Failed", description: error.message, variant: "destructive" });
    },
  });

  // Start sync mutation
  const startSyncMutation = useMutation({
    mutationFn: async (syncType: "initial" | "delta") => 
      apiRequest("POST", syncType === "initial" ? "/api/egnyte/sync/start" : "/api/egnyte/sync/delta"),
    onSuccess: (_, syncType) => {
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
      toast({ 
        title: "Sync Started", 
        description: `${syncType === "initial" ? "Initial" : "Delta"} sync is now running in the background` 
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  // Disconnect Egnyte
  const disconnectEgnyteMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/egnyte/disconnect"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/status"] });
      toast({ title: "Disconnected", description: "Egnyte has been disconnected" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleConnectEgnyte = () => {
    window.location.href = "/api/egnyte/authorize";
  };

  const handleDisconnectEgnyte = () => {
    disconnectEgnyteMutation.mutate();
  };

  const syncMutation = useMutation({
    mutationFn: async (integrationId: string) => {
      const syncEndpoints: Record<string, string> = {
        samgov: "/api/services/integrations/samgov/ingest",
        egnyte: "/api/egnyte/status",
        teams: "/api/integrations/teams/status",
        outlook: "/api/services/comms/calendar/upcoming",
        quickbooks: "/api/integrations/status",
      };
      const endpoint = syncEndpoints[integrationId] || "/api/integrations/status";
      const method = integrationId === "samgov" ? "POST" : "GET";
      return apiRequest(method, endpoint);
    },
    onSuccess: (_data, integrationId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations/status"] });
      toast({ title: "Sync Complete", description: `Successfully synced ${integrationId}` });
    },
    onError: (error: Error, integrationId) => {
      toast({ title: "Sync Failed", description: `Failed to sync ${integrationId}: ${error.message}`, variant: "destructive" });
    },
  });

  const handleRefreshIntegrations = () => {
    refetch();
    toast({ title: "Refreshing Integrations", description: "Checking status of all connected services..." });
  };

  const handleSync = (integrationId: string) => {
    syncMutation.mutate(integrationId);
  };

  const handleSettings = (integration: IntegrationStatus) => {
    setSelectedIntegration(integration);
    setSettingsOpen(true);
  };

  // Real data from API - no mocks
  const displayIntegrations = integrations || [];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "warning":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      case "error":
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <Activity className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getIntegrationIcon = (id: string) => {
    switch (id) {
      case "samgov":
        return <Building className="h-5 w-5 text-blue-500" />;
      case "outlook":
        return <Mail className="h-5 w-5 text-blue-600" />;
      case "teams":
        return <MessageSquare className="h-5 w-5 text-purple-500" />;
      case "egnyte":
        return <FolderOpen className="h-5 w-5 text-green-600" />;
      case "quickbooks":
        return <Calculator className="h-5 w-5 text-emerald-500" />;
      default:
        return <Zap className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Healthy</Badge>;
      case "warning":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Warning</Badge>;
      case "error":
        return <Badge variant="destructive">Error</Badge>;
      default:
        return <Badge variant="secondary">Disabled</Badge>;
    }
  };

  const formatLastSync = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const healthyCount = displayIntegrations.filter((i) => i.status === "healthy").length;
  const warningCount = displayIntegrations.filter((i) => i.status === "warning").length;
  const errorCount = displayIntegrations.filter((i) => i.status === "error").length;

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
          <p className="text-muted-foreground">Monitor and manage external service connections</p>
        </div>
        <Button variant="outline" onClick={handleRefreshIntegrations} data-testid="button-refresh-integrations">
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh All
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="stat-card-total">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Integrations</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-total-count">{displayIntegrations.length}</div>
            <p className="text-xs text-muted-foreground">Configured services</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-healthy">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Healthy</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500" data-testid="text-healthy-count">{healthyCount}</div>
            <p className="text-xs text-muted-foreground">Operating normally</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-warnings">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500" data-testid="text-warning-count">{warningCount}</div>
            <p className="text-xs text-muted-foreground">Needs attention</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-errors">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-500" data-testid="text-error-count">{errorCount}</div>
            <p className="text-xs text-muted-foreground">Requires action</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          [1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-40 w-full" />)
        ) : (
          displayIntegrations.map((integration) => (
            <Card key={integration.id} data-testid={`integration-card-${integration.id}`}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                    {getIntegrationIcon(integration.id)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold">{integration.name}</h3>
                      {getStatusBadge(integration.status)}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{integration.description}</p>
                  </div>
                </div>

                {integration.enabled && (
                  <div className="grid grid-cols-3 gap-2 mb-3 text-center border-t pt-3">
                    <div>
                      <div className="text-sm font-bold">{integration.metrics.requestsToday}</div>
                      <div className="text-xs text-muted-foreground">Requests</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold">{integration.metrics.successRate}%</div>
                      <div className="text-xs text-muted-foreground">Success</div>
                    </div>
                    <div>
                      <div className="text-sm font-bold">{integration.metrics.avgLatency}ms</div>
                      <div className="text-xs text-muted-foreground">Latency</div>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 border-t pt-3">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatLastSync(integration.lastSync)}
                  </span>
                  <div className="flex items-center gap-1">
                    {integration.id === "egnyte" ? (
                      egnyteStatus?.connected ? (
                        <>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => handleSync(integration.id)} 
                            disabled={syncMutation.isPending}
                            data-testid="button-sync-egnyte"
                          >
                            <RefreshCw className={`h-3 w-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                            Sync
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleDisconnectEgnyte}
                            disabled={disconnectEgnyteMutation.isPending}
                            data-testid="button-disconnect-egnyte"
                          >
                            <Unlink className="h-3 w-3" />
                            Disconnect
                          </Button>
                        </>
                      ) : egnyteStatus?.configured ? (
                        <div className="flex items-center gap-1">
                          <Button 
                            size="sm" 
                            onClick={() => setShowLoginDialog(true)}
                            data-testid="button-connect-egnyte"
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            Connect Egnyte
                          </Button>
                          <Link href="/egnyte-diagnostics">
                            <Button variant="ghost" size="sm" data-testid="button-egnyte-diagnostics">
                              Debug
                            </Button>
                          </Link>
                        </div>
                      ) : (
                        <Badge variant="secondary">Not Configured</Badge>
                      )
                    ) : (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleSync(integration.id)} 
                          disabled={syncMutation.isPending}
                          data-testid={`button-sync-${integration.id}`}
                        >
                          <RefreshCw className={`h-3 w-3 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                          {syncMutation.isPending ? "Syncing..." : "Sync"}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleSettings(integration)} 
                          disabled={syncMutation.isPending}
                          data-testid={`button-settings-${integration.id}`}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Egnyte Mirror Sync Configuration */}
      {egnyteStatus?.connected && (
        <Card className="border-primary/20" data-testid="egnyte-sync-config">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <HardDrive className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    Egnyte Mirror Mode
                    <Badge variant="secondary" className="text-xs">
                      {egnyteSyncStatus?.provider || "egnyte"}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Sync Egnyte folders to populate the dashboard with live data
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetchSyncStatus()}
                  data-testid="button-refresh-sync-status"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh
                </Button>
                <Button
                  size="sm"
                  onClick={() => startSyncMutation.mutate("initial")}
                  disabled={startSyncMutation.isPending || (egnyteSyncStatus?.rootPaths?.length || 0) === 0}
                  data-testid="button-start-initial-sync"
                >
                  {startSyncMutation.isPending ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <Play className="h-3 w-3 mr-1" />
                  )}
                  Start Full Sync
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => startSyncMutation.mutate("delta")}
                  disabled={startSyncMutation.isPending || !egnyteSyncStatus?.lastSync}
                  data-testid="button-start-delta-sync"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Delta Sync
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Sync Status */}
            {egnyteSyncStatus?.lastSync && (
              <div className="bg-muted/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Last Sync
                  </h4>
                  <Badge 
                    variant={egnyteSyncStatus.lastSync.status === "completed" ? "secondary" : 
                             egnyteSyncStatus.lastSync.status === "running" ? "default" : "destructive"}
                    className={egnyteSyncStatus.lastSync.status === "completed" ? "bg-green-500/10 text-green-500" : ""}
                  >
                    {egnyteSyncStatus.lastSync.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-muted-foreground">Type</div>
                    <div className="font-medium capitalize">{egnyteSyncStatus.lastSync.syncType}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Progress</div>
                    <div className="font-medium">
                      {egnyteSyncStatus.lastSync.processedItems} / {egnyteSyncStatus.lastSync.totalItems}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Errors</div>
                    <div className={`font-medium ${egnyteSyncStatus.lastSync.errorCount > 0 ? "text-destructive" : ""}`}>
                      {egnyteSyncStatus.lastSync.errorCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Started</div>
                    <div className="font-medium">{formatLastSync(egnyteSyncStatus.lastSync.startedAt)}</div>
                  </div>
                </div>
                {egnyteSyncStatus.lastSync.status === "running" && (
                  <Progress 
                    value={(egnyteSyncStatus.lastSync.processedItems / Math.max(egnyteSyncStatus.lastSync.totalItems, 1)) * 100}
                    className="mt-3"
                  />
                )}
              </div>
            )}

            {/* Root Paths Configuration */}
            <div>
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h4 className="font-medium">Root Folder Paths</h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddRootPath(!showAddRootPath)}
                  data-testid="button-add-root-path"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Path
                </Button>
              </div>

              {showAddRootPath && (
                <div className="bg-muted/50 rounded-lg p-4 mb-4">
                  <div className="grid gap-3">
                    <div>
                      <Label htmlFor="root-path">Egnyte Path</Label>
                      <Input
                        id="root-path"
                        placeholder="/Shared/Company Jackets"
                        value={newRootPath.path}
                        onChange={(e) => setNewRootPath({ ...newRootPath, path: e.target.value })}
                        data-testid="input-root-path"
                      />
                    </div>
                    <div>
                      <Label htmlFor="root-label">Display Label</Label>
                      <Input
                        id="root-label"
                        placeholder="Company Jackets"
                        value={newRootPath.label}
                        onChange={(e) => setNewRootPath({ ...newRootPath, label: e.target.value })}
                        data-testid="input-root-label"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => addRootPathMutation.mutate(newRootPath)}
                        disabled={!newRootPath.path || !newRootPath.label || addRootPathMutation.isPending}
                        data-testid="button-save-root-path"
                      >
                        {addRootPathMutation.isPending ? (
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                        ) : null}
                        Save
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowAddRootPath(false);
                          setNewRootPath({ path: "", label: "" });
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {egnyteSyncStatus?.rootPaths && egnyteSyncStatus.rootPaths.length > 0 ? (
                <div className="space-y-2">
                  {egnyteSyncStatus.rootPaths.map((rp) => (
                    <div
                      key={rp.id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                      data-testid={`root-path-${rp.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <FolderOpen className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">{rp.label}</div>
                          <div className="text-xs text-muted-foreground">{rp.path}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {rp.lastScannedAt && (
                          <span className="text-xs text-muted-foreground">
                            Scanned {formatLastSync(rp.lastScannedAt)}
                          </span>
                        )}
                        <Badge variant="secondary" className="text-xs">{rp.pathType}</Badge>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeRootPathMutation.mutate(rp.id)}
                          disabled={removeRootPathMutation.isPending}
                          data-testid={`button-remove-path-${rp.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No root paths configured</p>
                  <p className="text-sm">Add Egnyte folder paths to start syncing documents</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Egnyte Reconcile Admin Panel */}
      <EgnyteReconcilePanel />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Integration Settings</DialogTitle>
            <DialogDescription>
              Configure settings for {selectedIntegration?.name}
            </DialogDescription>
          </DialogHeader>
          {selectedIntegration && (
            <div className="grid gap-4 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Enable Integration</Label>
                  <p className="text-sm text-muted-foreground">Toggle this integration on or off</p>
                </div>
                <Switch checked={selectedIntegration.enabled} disabled />
              </div>
              <div className="grid gap-2">
                <Label>Integration ID</Label>
                <Input value={selectedIntegration.id} disabled />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Badge 
                  variant={selectedIntegration.status === "healthy" ? "secondary" : "destructive"}
                  className={selectedIntegration.status === "healthy" ? "bg-green-500/20 text-green-500 w-fit" : "w-fit"}
                >
                  {selectedIntegration.status}
                </Badge>
              </div>
              {selectedIntegration.lastError && (
                <div className="grid gap-2">
                  <Label>Last Error</Label>
                  <p className="text-sm text-destructive">{selectedIntegration.lastError}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettingsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLoginDialog} onOpenChange={setShowLoginDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect to Egnyte</DialogTitle>
            <DialogDescription>
              Enter your Egnyte login credentials to connect.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Egnyte Email/Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="chad@tntcyber.com"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-username"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Egnyte Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Your Egnyte password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-password"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Connects to tntcyber.egnyte.com and auto-syncs /Shared/Black Hawk Construction
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowLoginDialog(false); setUsername(""); setPassword(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => connectInternalMutation.mutate({ username, password })}
              disabled={!username || !password || connectInternalMutation.isPending}
              data-testid="button-connect-login"
            >
              {connectInternalMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect & Start Sync"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTokenDialog} onOpenChange={setShowTokenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste Access Token</DialogTitle>
            <DialogDescription>
              If you have an Egnyte access token, paste it here to connect.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="access-token">Access Token</Label>
              <Input
                id="access-token"
                type="password"
                placeholder="Paste your Egnyte access token here"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
                data-testid="input-access-token"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Get a token from your Egnyte Developer Portal or from Egnyte support.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowTokenDialog(false); setAccessToken(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={() => connectTokenMutation.mutate(accessToken)}
              disabled={!accessToken || connectTokenMutation.isPending}
              data-testid="button-connect-token"
            >
              {connectTokenMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                "Connect & Start Sync"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ReconcileSummary {
  totalDocuments: number;
  syncedDocuments: number;
  unsyncedDocuments: number;
  totalFolders: number;
  syncRate: string;
  lastReconcileAt: string;
  missingInEgnyte: { id: string; fileName: string }[];
  orphanedInDb: { id: string; fileName: string }[];
}

function EgnyteReconcilePanel() {
  const { toast } = useToast();
  const [isReconciling, setIsReconciling] = useState(false);
  
  const { data: summary, refetch } = useQuery<ReconcileSummary>({
    queryKey: ["/api/egnyte/reconcile/summary"],
  });

  const reconcileMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/egnyte/reconcile"),
    onSuccess: () => {
      refetch();
      toast({ title: "Reconciliation Complete", description: "Egnyte documents have been reconciled with the database." });
      setIsReconciling(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Reconciliation failed", variant: "destructive" });
      setIsReconciling(false);
    },
  });

  const handleReconcile = () => {
    setIsReconciling(true);
    reconcileMutation.mutate();
  };

  return (
    <Card data-testid="egnyte-reconcile-panel">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <CardTitle>Egnyte Reconcile</CardTitle>
              <CardDescription>Compare Egnyte vs database records, identify missing files and orphans</CardDescription>
            </div>
          </div>
          <Button
            onClick={handleReconcile}
            disabled={isReconciling || reconcileMutation.isPending}
            data-testid="button-run-reconcile"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isReconciling ? "animate-spin" : ""}`} />
            {isReconciling ? "Reconciling..." : "Run Reconcile"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Total Documents</p>
                <p className="text-2xl font-bold" data-testid="text-reconcile-total">{summary.totalDocuments}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Synced</p>
                <p className="text-2xl font-bold text-green-500" data-testid="text-reconcile-synced">{summary.syncedDocuments}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Unsynced</p>
                <p className="text-2xl font-bold text-yellow-500" data-testid="text-reconcile-unsynced">{summary.unsyncedDocuments}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Sync Rate</p>
                <p className="text-2xl font-bold" data-testid="text-reconcile-rate">{summary.syncRate}%</p>
              </div>
            </div>

            <Progress value={parseFloat(summary.syncRate)} className="h-2" />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Total Folders: {summary.totalFolders}</span>
              <span data-testid="text-reconcile-last">Last reconciled: {new Date(summary.lastReconcileAt).toLocaleString()}</span>
            </div>

            {summary.missingInEgnyte.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-500" />
                  Missing in Egnyte ({summary.missingInEgnyte.length})
                </h4>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {summary.missingInEgnyte.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 text-sm p-1 rounded-md bg-muted" data-testid={`text-missing-${doc.id}`}>
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      <span className="truncate">{doc.fileName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {summary.orphanedInDb.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  Orphaned in DB ({summary.orphanedInDb.length})
                </h4>
                <div className="space-y-1 max-h-32 overflow-auto">
                  {summary.orphanedInDb.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-2 text-sm p-1 rounded-md bg-muted" data-testid={`text-orphan-${doc.id}`}>
                      <FolderOpen className="h-3 w-3 shrink-0" />
                      <span className="truncate">{doc.fileName}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Click "Run Reconcile" to compare Egnyte with database</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
