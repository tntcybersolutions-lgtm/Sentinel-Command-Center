import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileText, CheckCircle, Clock, XCircle, Upload, RefreshCw, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LienWaiver {
  id: number;
  projectId: number;
  tenantId: string;
  stateCode: string;
  waiverType: "conditional_progress" | "unconditional_progress" | "conditional_final" | "unconditional_final";
  status: "pending" | "sent" | "received" | "approved" | "rejected" | "waived";
  recipientName: string | null;
  recipientEmail: string | null;
  amount: string | null;
  throughDate: string | null;
  fileUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface LienWaiversPanelProps {
  projectId: number;
  stateCode?: string;
}

const WAIVER_TYPE_LABELS: Record<string, string> = {
  conditional_progress: "Conditional Progress",
  unconditional_progress: "Unconditional Progress",
  conditional_final: "Conditional Final",
  unconditional_final: "Unconditional Final",
};

const STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ElementType }
> = {
  pending: { label: "Pending", variant: "secondary", icon: Clock },
  sent: { label: "Sent", variant: "default", icon: FileText },
  received: { label: "Received", variant: "default", icon: CheckCircle },
  approved: { label: "Approved", variant: "default", icon: CheckCircle },
  rejected: { label: "Rejected", variant: "destructive", icon: XCircle },
  waived: { label: "Waived", variant: "outline", icon: AlertCircle },
};

async function apiRequest(method: string, path: string, body?: unknown) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

export function LienWaiversPanel({ projectId, stateCode }: LienWaiversPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: waivers, isLoading, error } = useQuery<LienWaiver[]>({
    queryKey: ["/api/lien-waivers/projects", projectId],
    queryFn: () => apiRequest("GET", `/api/lien-waivers/projects/${projectId}`),
  });

  const initializeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/lien-waivers/projects/${projectId}/initialize`, {
        stateCode: stateCode || "TX",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lien-waivers/projects", projectId] });
      toast({ title: "Lien waivers initialized", description: "4 waiver slots created for this project." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to initialize waivers", description: err.message, variant: "destructive" });
    },
  });

  const regenerateMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/lien-waivers/projects/${projectId}/regenerate`, {
        stateCode: stateCode || "TX",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lien-waivers/projects", projectId] });
      toast({ title: "Lien waivers regenerated", description: "All 4 waiver slots have been reset." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to regenerate waivers", description: err.message, variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ waiverId, status }: { waiverId: number; status: string }) =>
      apiRequest("PATCH", `/api/lien-waivers/${waiverId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lien-waivers/projects", projectId] });
      setEditingId(null);
      toast({ title: "Status updated", description: "Lien waiver status has been updated." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update status", description: err.message, variant: "destructive" });
    },
  });

  // Auto-initialize waivers if none exist
  useEffect(() => {
    if (!isLoading && !error && waivers && waivers.length === 0) {
      initializeMutation.mutate();
    }
  }, [isLoading, error, waivers]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Lien Waivers
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Lien Waivers
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">Failed to load lien waivers. Please try again.</p>
        </CardContent>
      </Card>
    );
  }

  const displayWaivers = waivers || [];
  const stateDisplay = stateCode || (displayWaivers[0]?.stateCode ?? "—");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Lien Waivers
            {stateDisplay && stateDisplay !== "—" && (
              <Badge variant="outline" className="ml-2 text-xs">
                {stateDisplay}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-2">
            {displayWaivers.length === 0 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => initializeMutation.mutate()}
                disabled={initializeMutation.isPending}
              >
                {initializeMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <FileText className="h-4 w-4 mr-1" />
                )}
                Initialize
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => regenerateMutation.mutate()}
                disabled={regenerateMutation.isPending}
                title="Regenerate all waiver slots"
              >
                {regenerateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          4 waiver types auto-generated per project based on state ({stateDisplay})
        </p>
      </CardHeader>
      <CardContent>
        {displayWaivers.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No lien waivers yet. Click Initialize to create them.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {displayWaivers.map((waiver) => {
              const statusCfg = STATUS_CONFIG[waiver.status] ?? STATUS_CONFIG.pending;
              const StatusIcon = statusCfg.icon;
              const isEditing = editingId === waiver.id;

              return (
                <div
                  key={waiver.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <StatusIcon className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {WAIVER_TYPE_LABELS[waiver.waiverType] ?? waiver.waiverType}
                      </p>
                      {waiver.recipientName && (
                        <p className="text-xs text-muted-foreground truncate">{waiver.recipientName}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isEditing ? (
                      <Select
                        defaultValue={waiver.status}
                        onValueChange={(val) => updateStatusMutation.mutate({ waiverId: waiver.id, status: val })}
                        disabled={updateStatusMutation.isPending}
                      >
                        <SelectTrigger className="w-36 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                            <SelectItem key={key} value={key} className="text-xs">
                              {cfg.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge
                        variant={statusCfg.variant}
                        className="cursor-pointer text-xs"
                        onClick={() => setEditingId(waiver.id)}
                        title="Click to change status"
                      >
                        {statusCfg.label}
                      </Badge>
                    )}

                    {waiver.fileUrl ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        asChild
                        title="View document"
                      >
                        <a href={waiver.fileUrl} target="_blank" rel="noopener noreferrer">
                          <FileText className="h-3.5 w-3.5" />
                        </a>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 opacity-40"
                        title="No document uploaded"
                        disabled
                      >
                        <Upload className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="pt-2 flex items-center justify-between text-xs text-muted-foreground border-t">
              <span>{displayWaivers.length} of 4 waiver types</span>
              <span>
                {displayWaivers.filter((w) => w.status === "approved").length} approved •{" "}
                {displayWaivers.filter((w) => w.status === "pending").length} pending
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default LienWaiversPanel;
