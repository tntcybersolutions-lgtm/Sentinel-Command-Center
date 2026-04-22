import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  ArrowLeft, 
  Play, 
  Pause, 
  FolderSync,
  FileText,
  Folder,
  Clock,
  Database,
  Cloud,
  Activity
} from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface SyncStatus {
  status: "idle" | "syncing" | "paused" | "completed" | "error";
  syncId?: string;
  startedAt?: string;
  foldersProcessed?: number;
  filesProcessed?: number;
  currentPath?: string;
  progress?: number;
  errors?: Array<{ path: string; error: string; timestamp: string }>;
}

interface CurrentProgress {
  foldersProcessed: number;
  filesProcessed: number;
  totalFoldersQueued: number;
  currentPath: string;
  errorsCount: number;
  bytesProcessed: number;
  startedAt?: string;
  elapsedSeconds?: number;
}

interface LiveProgressResponse {
  currentProgress: CurrentProgress;
  status: string;
  syncId?: string;
  lastActivityAt?: string;
  errors?: Array<{ path: string; error: string; timestamp: string }>;
}

interface ReconcileResult {
  totalFilesEgnyte: number;
  totalFilesDB: number;
  totalFoldersEgnyte: number;
  totalFoldersDB: number;
  missingFiles: Array<{ path: string; name: string; size?: number } | string>;
  missingFolders: Array<{ path: string; name: string } | string>;
  orphanedDBItems: string[];
  isComplete: boolean;
  completenessPercent: number;
  timestamp: string;
  lastFullSyncAt?: string | null;
  lastDeltaSyncAt?: string | null;
  lastError?: string | null;
}

interface RootPath {
  id: string;
  path: string;
  enabled: boolean;
  lastSyncAt?: string;
  lastSyncStatus?: string;
}

export default function EgnyteSyncMonitor() {
  const { toast } = useToast();
  const [isReconciling, setIsReconciling] = useState(false);

  const statusQuery = useQuery<SyncStatus>({
    queryKey: ["/api/egnyte/sync/status"],
    refetchInterval: 3000,
  });

  const liveProgressQuery = useQuery<LiveProgressResponse>({
    queryKey: ["/api/egnyte/sync/live"],
    refetchInterval: 2000,
    enabled: statusQuery.data?.status === "syncing",
  });

  const rootPathsQuery = useQuery<RootPath[]>({
    queryKey: ["/api/egnyte/sync/root-paths"],
  });

  const [reconcileData, setReconcileData] = useState<ReconcileResult | null>(null);

  const reconcileMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/egnyte/reconcile");
      return response.json();
    },
    onSuccess: (data: ReconcileResult) => {
      setReconcileData(data);
      toast({ title: "Reconciliation Complete" });
    },
    onError: (error: Error) => {
      toast({ title: "Reconciliation Failed", description: error.message, variant: "destructive" });
    },
  });

  const startFullSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/egnyte/sync/full");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.syncId) {
        toast({ title: "Full Sync Started", description: data.message || `Sync ID: ${data.syncId}` });
        queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
      } else {
        toast({ title: "Sync Failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const pauseSyncMutation = useMutation({
    mutationFn: async (syncId: string) => {
      const response = await apiRequest("POST", `/api/egnyte/sync/${syncId}/pause`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Sync Paused" });
      queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
    },
    onError: (error: Error) => {
      toast({ title: "Pause Failed", description: error.message, variant: "destructive" });
    },
  });

  const triggerDeltaSyncMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/egnyte/sync/delta");
      return response.json();
    },
    onSuccess: (data) => {
      if (data.triggered) {
        toast({ title: "Delta Sync Triggered", description: `Sync ID: ${data.syncId}` });
        queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
      } else {
        toast({ title: "Delta Sync Failed", description: data.error, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Delta Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      await reconcileMutation.mutateAsync();
    } finally {
      setIsReconciling(false);
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/live"] });
    queryClient.invalidateQueries({ queryKey: ["/api/egnyte/sync/root-paths"] });
  };

  const status = statusQuery.data;
  const liveProgressData = liveProgressQuery.data;
  const progress = liveProgressData?.currentProgress;
  const rootPaths = rootPathsQuery.data || [];
  const reconcile = reconcileData;

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hours}h ${remainMins}m`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/integrations">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Egnyte Sync Monitor</h1>
            <p className="text-muted-foreground">Real-time sync progress and reconciliation</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={handleRefresh}
            data-testid="button-refresh"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Link href="/egnyte-diagnostics">
            <Button variant="outline" data-testid="link-diagnostics">
              Diagnostics
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                <div className="flex items-center gap-2 mt-1">
                  {status?.status === "syncing" ? (
                    <Badge className="bg-blue-500 text-white">
                      <Activity className="h-3 w-3 mr-1 animate-pulse" />
                      Syncing
                    </Badge>
                  ) : status?.status === "paused" ? (
                    <Badge variant="secondary">
                      <Pause className="h-3 w-3 mr-1" />
                      Paused
                    </Badge>
                  ) : status?.status === "error" ? (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Error
                    </Badge>
                  ) : status?.status === "completed" ? (
                    <Badge className="bg-green-500 text-white">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Complete
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" />
                      Idle
                    </Badge>
                  )}
                </div>
              </div>
              <FolderSync className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Folders Processed</p>
                <p className="text-2xl font-bold">{progress?.foldersProcessed ?? status?.foldersProcessed ?? 0}</p>
                {progress?.totalFoldersQueued && progress.totalFoldersQueued > 0 && (
                  <p className="text-xs text-muted-foreground">of {progress.totalFoldersQueued} queued</p>
                )}
              </div>
              <Folder className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Files Processed</p>
                <p className="text-2xl font-bold">{progress?.filesProcessed ?? status?.filesProcessed ?? 0}</p>
                {progress?.bytesProcessed && progress.bytesProcessed > 0 && (
                  <p className="text-xs text-muted-foreground">{formatBytes(progress.bytesProcessed)}</p>
                )}
              </div>
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Elapsed Time</p>
                <p className="text-2xl font-bold">
                  {progress?.elapsedSeconds ? formatDuration(progress.elapsedSeconds) : "--"}
                </p>
                {progress?.errorsCount && progress.errorsCount > 0 && (
                  <p className="text-xs text-destructive">{progress.errorsCount} errors</p>
                )}
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {status?.status === "syncing" && progress?.currentPath && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Path:</span>
                <span className="font-mono text-xs truncate max-w-[60%]">{progress.currentPath}</span>
              </div>
              {progress.totalFoldersQueued > 0 && (
                <Progress 
                  value={(progress.foldersProcessed / progress.totalFoldersQueued) * 100} 
                  className="h-2"
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Sync Controls
            </CardTitle>
            <CardDescription>Start, pause, or trigger delta sync</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => startFullSyncMutation.mutate()}
                disabled={status?.status === "syncing" || startFullSyncMutation.isPending}
                data-testid="button-full-sync"
              >
                <FolderSync className="h-4 w-4 mr-2" />
                Run Full Sync
              </Button>
              <Button
                variant="outline"
                onClick={() => triggerDeltaSyncMutation.mutate()}
                disabled={status?.status === "syncing" || triggerDeltaSyncMutation.isPending}
                data-testid="button-delta-sync"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Delta Sync
              </Button>
              {status?.status === "syncing" && status.syncId && (
                <Button
                  variant="secondary"
                  onClick={() => pauseSyncMutation.mutate(status.syncId!)}
                  disabled={pauseSyncMutation.isPending}
                  data-testid="button-pause-sync"
                >
                  <Pause className="h-4 w-4 mr-2" />
                  Pause
                </Button>
              )}
            </div>
            <Separator />
            <div>
              <Button
                variant="outline"
                onClick={handleReconcile}
                disabled={isReconciling}
                data-testid="button-reconcile"
              >
                <Database className="h-4 w-4 mr-2" />
                {isReconciling ? "Reconciling..." : "Run Reconciliation"}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Compare Egnyte totals with database to verify completeness
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Reconciliation Results
            </CardTitle>
            <CardDescription>
              {reconcile?.timestamp 
                ? `Last run: ${new Date(reconcile.timestamp).toLocaleString()}`
                : "Click 'Run Reconciliation' to compare"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reconcile ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Cloud className="h-4 w-4 text-blue-500" />
                      <span className="text-sm font-medium">Egnyte</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div>Files: {reconcile.totalFilesEgnyte.toLocaleString()}</div>
                      <div>Folders: {reconcile.totalFoldersEgnyte.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-green-500" />
                      <span className="text-sm font-medium">Database</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <div>Files: {reconcile.totalFilesDB.toLocaleString()}</div>
                      <div>Folders: {reconcile.totalFoldersDB.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Overall Completeness</span>
                    <Badge variant={(reconcile.completenessPercent ?? 0) === 100 ? "default" : "secondary"}>
                      {(reconcile.completenessPercent ?? 0).toFixed(1)}%
                    </Badge>
                  </div>
                  <Progress value={reconcile.completenessPercent ?? 0} className="h-2" />
                </div>
                {reconcile.isComplete ? (
                  <div className="flex items-center gap-2 p-3 bg-green-500/10 rounded-md">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <span className="text-sm text-green-700 dark:text-green-300">100% Sync Complete</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-3 bg-yellow-500/10 rounded-md">
                    <AlertCircle className="h-5 w-5 text-yellow-500" />
                    <span className="text-sm text-yellow-700 dark:text-yellow-300">
                      Missing {reconcile.missingFiles?.length ?? 0} files, {reconcile.missingFolders?.length ?? 0} folders
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No reconciliation data</p>
                <p className="text-xs">Run reconciliation to compare sync status</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Root Sync Paths</CardTitle>
          <CardDescription>Configured paths to sync from Egnyte</CardDescription>
        </CardHeader>
        <CardContent>
          {rootPaths.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Path</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead>Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rootPaths.map((rp) => (
                  <TableRow key={rp.id}>
                    <TableCell className="font-mono text-sm">{rp.path}</TableCell>
                    <TableCell>
                      {rp.lastSyncStatus === "completed" ? (
                        <Badge className="bg-green-500 text-white">Complete</Badge>
                      ) : rp.lastSyncStatus === "error" ? (
                        <Badge variant="destructive">Error</Badge>
                      ) : rp.lastSyncStatus === "in_progress" ? (
                        <Badge className="bg-blue-500 text-white">Syncing</Badge>
                      ) : (
                        <Badge variant="outline">Never Synced</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rp.lastSyncAt ? new Date(rp.lastSyncAt).toLocaleString() : "--"}
                    </TableCell>
                    <TableCell>
                      {rp.enabled ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Folder className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No root paths configured</p>
              <p className="text-xs">Add paths in Integrations settings</p>
            </div>
          )}
        </CardContent>
      </Card>

      {status?.errors && status.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Sync Errors
            </CardTitle>
            <CardDescription>{status.errors.length} errors encountered</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-2">
                {status.errors.map((err, i) => (
                  <div key={i} className="p-2 bg-destructive/10 rounded-md text-sm">
                    <div className="font-mono text-xs truncate">{err.path}</div>
                    <div className="text-destructive">{err.error}</div>
                    <div className="text-xs text-muted-foreground">{new Date(err.timestamp).toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {reconcile && (reconcile.missingFiles.length > 0 || reconcile.missingFolders.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600">
              <AlertCircle className="h-5 w-5" />
              Missing Items
            </CardTitle>
            <CardDescription>Items in Egnyte but not in database</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              {reconcile.missingFiles.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium mb-2">Missing Files ({reconcile.missingFiles.length})</h4>
                  <div className="space-y-1">
                    {reconcile.missingFiles.slice(0, 50).map((f, i) => (
                      <div key={i} className="text-sm font-mono text-muted-foreground truncate">
                        {typeof f === 'string' ? f : `${f.path}/${f.name}${f.size ? ` (${formatBytes(f.size)})` : ''}`}
                      </div>
                    ))}
                    {reconcile.missingFiles.length > 50 && (
                      <div className="text-sm text-muted-foreground">
                        ... and {reconcile.missingFiles.length - 50} more
                      </div>
                    )}
                  </div>
                </div>
              )}
              {reconcile.missingFolders.length > 0 && (
                <div>
                  <h4 className="font-medium mb-2">Missing Folders ({reconcile.missingFolders.length})</h4>
                  <div className="space-y-1">
                    {reconcile.missingFolders.slice(0, 50).map((f, i) => (
                      <div key={i} className="text-sm font-mono text-muted-foreground truncate">
                        {typeof f === 'string' ? f : `${f.path}/${f.name}`}
                      </div>
                    ))}
                    {reconcile.missingFolders.length > 50 && (
                      <div className="text-sm text-muted-foreground">
                        ... and {reconcile.missingFolders.length - 50} more
                      </div>
                    )}
                  </div>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
