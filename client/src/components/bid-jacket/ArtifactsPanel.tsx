import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  FileText,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Upload,
  Eye,
} from "lucide-react";

interface Artifact {
  id: string;
  tenantId: string;
  bidProjectId: string;
  templateCode: string | null;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  documentId: string | null;
  status: string;
  notes: string | null;
  verifiedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ArtifactSummary {
  missing: number;
  ready: number;
  needsReview: number;
  approved: number;
  total: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  missing: { label: "Missing", color: "destructive", icon: AlertTriangle },
  ready: { label: "Ready", color: "secondary", icon: Clock },
  needs_review: { label: "Needs Review", color: "default", icon: Eye },
  approved: { label: "Approved", color: "default", icon: CheckCircle2 },
};

const CATEGORY_COLORS: Record<string, string> = {
  SAM: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  Estimating: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  Proposal: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  Compliance: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Subs: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  Closeout: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function getCategoryFromCode(code: string | null): string {
  if (!code) return "Other";
  if (code.startsWith("SAM_")) return "SAM";
  if (code === "PRICING_SHEET") return "Estimating";
  if (code === "SUBCONTRACTOR_QUOTES") return "Subs";
  if (code.startsWith("BID_") || code === "SCOPE_NARRATIVE") return "Proposal";
  if (code.includes("BONDING") || code.includes("INSURANCE") || code.includes("SAFETY")) return "Compliance";
  if (code.includes("RFI") || code.includes("SUBMITTAL")) return "Closeout";
  return "Other";
}

export function ArtifactsPanel({ bidProjectId }: { bidProjectId: string }) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);

  const { data: artifacts = [], isLoading } = useQuery<Artifact[]>({
    queryKey: ["/api/bid-projects", bidProjectId, "artifacts"],
    queryFn: () => fetch(`/api/bid-projects/${bidProjectId}/artifacts`).then(r => r.json()),
  });

  const { data: summary } = useQuery<ArtifactSummary>({
    queryKey: ["/api/bid-projects", bidProjectId, "artifacts", "summary"],
    queryFn: () => fetch(`/api/bid-projects/${bidProjectId}/artifacts/summary`).then(r => r.json()),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ artifactId, updates }: { artifactId: string; updates: Record<string, any> }) => {
      const res = await apiRequest("PATCH", `/api/bid-projects/${bidProjectId}/artifacts/${artifactId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-projects", bidProjectId, "artifacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] });
      toast({ title: "Artifact updated" });
      setEditingArtifact(null);
    },
    onError: () => {
      toast({ title: "Failed to update artifact", variant: "destructive" });
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bid-projects/${bidProjectId}/seed-jacket`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-projects", bidProjectId] });
      toast({ title: `Seeded ${data.artifactsCreated} artifacts, ${data.checklistItemsCreated} checklist items` });
    },
  });

  const samSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bid-projects/${bidProjectId}/artifacts/sync-sam`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-projects", bidProjectId, "artifacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] });
      if (data.message) {
        toast({ title: data.message });
      } else {
        toast({ title: `SAM.gov sync complete: ${data.inserted} new, ${data.total} total` });
      }
    },
    onError: () => {
      toast({ title: "Failed to sync SAM.gov artifacts", variant: "destructive" });
    },
  });

  const filtered = artifacts.filter(a => {
    if (filter !== "all" && a.status !== filter) return false;
    if (search && !a.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = filtered.reduce<Record<string, Artifact[]>>((acc, a) => {
    const cat = getCategoryFromCode(a.templateCode);
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(a);
    return acc;
  }, {});

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading artifacts...</div>;
  }

  return (
    <div className="space-y-4" data-testid="artifacts-panel">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-lg font-semibold">Bid Jacket Artifacts</h2>
        <div className="flex items-center gap-2">
          {artifacts.length === 0 && (
            <Button
              size="sm"
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              data-testid="btn-seed-artifacts"
            >
              Initialize Artifacts
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => samSyncMutation.mutate()}
            disabled={samSyncMutation.isPending}
            data-testid="btn-sync-sam"
          >
            {samSyncMutation.isPending ? "Syncing..." : "Sync SAM.gov"}
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold">{summary.total}</div>
              <div className="text-xs text-muted-foreground">Total</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-500">{summary.missing}</div>
              <div className="text-xs text-muted-foreground">Missing</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-yellow-500">{summary.ready}</div>
              <div className="text-xs text-muted-foreground">Ready</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-500">{summary.needsReview}</div>
              <div className="text-xs text-muted-foreground">Needs Review</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-500">{summary.approved}</div>
              <div className="text-xs text-muted-foreground">Approved</div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search artifacts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-search-artifacts"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-artifact-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="missing">Missing</SelectItem>
            <SelectItem value="ready">Ready</SelectItem>
            <SelectItem value="needs_review">Needs Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {Object.entries(grouped).map(([category, items]) => (
        <div key={category} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[category] || "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"}`}>
              {category}
            </span>
            <span className="text-xs text-muted-foreground">({items.length})</span>
          </div>
          <div className="space-y-1">
            {items.map(artifact => {
              const statusCfg = STATUS_CONFIG[artifact.status] || STATUS_CONFIG.missing;
              const StatusIcon = statusCfg.icon;
              return (
                <div
                  key={artifact.id}
                  className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                  data-testid={`artifact-row-${artifact.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <StatusIcon className={`h-4 w-4 flex-shrink-0 ${artifact.status === "missing" ? "text-red-500" : artifact.status === "verified" ? "text-green-500" : "text-muted-foreground"}`} />
                    <span className="text-sm truncate">{artifact.title}</span>
                    {artifact.templateCode && (
                      <span className="text-xs text-muted-foreground font-mono hidden md:inline">{artifact.templateCode}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Badge variant={statusCfg.color as any} className="text-xs">
                      {statusCfg.label}
                    </Badge>
                    {artifact.sourceUrl && (
                      <a href={artifact.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" data-testid={`btn-view-source-${artifact.id}`}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </a>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setEditingArtifact(artifact)}
                      data-testid={`btn-edit-artifact-${artifact.id}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {filtered.length === 0 && artifacts.length > 0 && (
        <div className="text-center text-muted-foreground py-8">
          No artifacts match your filter.
        </div>
      )}

      {editingArtifact && (
        <ArtifactEditDialog
          artifact={editingArtifact}
          onClose={() => setEditingArtifact(null)}
          onSave={(updates) => updateMutation.mutate({ artifactId: editingArtifact.id, updates })}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

function ArtifactEditDialog({
  artifact,
  onClose,
  onSave,
  isPending,
}: {
  artifact: Artifact;
  onClose: () => void;
  onSave: (updates: Record<string, any>) => void;
  isPending: boolean;
}) {
  const [status, setStatus] = useState(artifact.status);
  const [notes, setNotes] = useState(artifact.notes || "");
  const [sourceUrl, setSourceUrl] = useState(artifact.sourceUrl || "");
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    setError(null);
    if (status === "approved" && !sourceUrl && !artifact.documentId) {
      setError("Cannot approve without a source URL or linked document.");
      return;
    }
    const PLACEHOLDER_REGEX = /\b(placeholder|tbd|lorem|ipsum|fake|test|sample|xxx|todo)\b/i;
    if (notes && PLACEHOLDER_REGEX.test(notes)) {
      setError("Notes contain placeholder content. Please provide real data.");
      return;
    }
    if (sourceUrl && PLACEHOLDER_REGEX.test(sourceUrl)) {
      setError("Source URL contains placeholder content.");
      return;
    }
    onSave({ status, notes: notes || null, sourceUrl: sourceUrl || null });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="dialog-edit-artifact">
        <DialogHeader>
          <DialogTitle>{artifact.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded" data-testid="artifact-edit-error">
              {error}
            </div>
          )}
          <div>
            <label className="text-sm font-medium">Status</label>
            <Select value={status} onValueChange={(v) => { setStatus(v); setError(null); }}>
              <SelectTrigger data-testid="select-artifact-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="missing">Missing</SelectItem>
                <SelectItem value="ready">Ready</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
              </SelectContent>
            </Select>
            {status === "approved" && !sourceUrl && !artifact.documentId && (
              <p className="text-xs text-amber-600 mt-1">A source URL or linked document is required for approval.</p>
            )}
          </div>
          <div>
            <label className="text-sm font-medium">Source URL</label>
            <Input
              value={sourceUrl}
              onChange={e => { setSourceUrl(e.target.value); setError(null); }}
              placeholder="https://..."
              data-testid="input-artifact-source-url"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Notes</label>
            <Textarea
              value={notes}
              onChange={e => { setNotes(e.target.value); setError(null); }}
              placeholder="Add notes..."
              data-testid="input-artifact-notes"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} data-testid="btn-cancel-artifact">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={isPending}
              data-testid="btn-save-artifact"
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
