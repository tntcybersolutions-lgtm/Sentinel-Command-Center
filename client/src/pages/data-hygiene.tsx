import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Link2,
  Unlink,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Database,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface UnlinkedCounts {
  counts: Record<string, number>;
}

interface UnlinkedRecords {
  entityType: string;
  records: Array<{
    id: string;
    name: string;
    status: string;
    created_at: string;
  }>;
}

interface ProjectOption {
  id: string;
  name: string;
  projectNumber: string;
}

const ENTITY_LABELS: Record<string, string> = {
  task: "Tasks",
  submittal: "Submittals",
  rfi: "RFIs",
  purchaseOrder: "Purchase Orders",
  changeOrder: "Change Orders",
  invoice: "Invoices",
};

export default function DataHygienePage() {
  const { toast } = useToast();
  const [selectedEntityType, setSelectedEntityType] = useState<string | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [linkProjectId, setLinkProjectId] = useState<string>("");

  const { data: counts, isLoading: countsLoading } = useQuery<UnlinkedCounts>({
    queryKey: ["/api/data-hygiene/unlinked"],
  });

  const { data: records, isLoading: recordsLoading } = useQuery<UnlinkedRecords>({
    queryKey: ["/api/data-hygiene/unlinked", { entityType: selectedEntityType }],
    queryFn: async () => {
      const res = await fetch(`/api/data-hygiene/unlinked?entityType=${selectedEntityType}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!selectedEntityType,
  });

  const { data: projects } = useQuery<ProjectOption[]>({
    queryKey: ["/api/projects"],
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/data-hygiene/link", {
        entityType: selectedEntityType,
        entityIds: Array.from(selectedRecords),
        projectId: linkProjectId,
      });
    },
    onSuccess: () => {
      toast({ title: "Records linked successfully", description: `${selectedRecords.size} records linked to project.` });
      setSelectedRecords(new Set());
      setLinkProjectId("");
      queryClient.invalidateQueries({ queryKey: ["/api/data-hygiene/unlinked"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/portfolio"] });
    },
    onError: () => {
      toast({ title: "Failed to link records", variant: "destructive" });
    },
  });

  const totalOrphaned = counts?.counts
    ? Object.values(counts.counts).reduce((a, b) => a + b, 0)
    : 0;

  const toggleRecord = (id: string) => {
    setSelectedRecords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!records?.records) return;
    if (selectedRecords.size === records.records.length) {
      setSelectedRecords(new Set());
    } else {
      setSelectedRecords(new Set(records.records.map(r => r.id)));
    }
  };

  return (
    <div className="flex-1 space-y-6 p-4 md:p-6 overflow-auto">
      <div>
        <h1 className="page-heading tracking-tight" data-testid="heading-data-hygiene">Data Hygiene</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Find and fix orphaned records that aren't linked to any project.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3" data-testid="orphan-summary">
        {countsLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : (
          Object.entries(ENTITY_LABELS).map(([key, label]) => {
            const count = counts?.counts?.[key] ?? 0;
            return (
              <Card
                key={key}
                className={`cursor-pointer hover-elevate ${selectedEntityType === key ? "ring-2 ring-primary" : ""}`}
                onClick={() => {
                  setSelectedEntityType(key);
                  setSelectedRecords(new Set());
                }}
                data-testid={`orphan-card-${key}`}
              >
                <CardContent className="p-4 text-center">
                  <div className={`text-2xl font-bold ${count > 0 ? "text-orange-500" : "text-green-600 dark:text-green-400"}`} data-testid={`orphan-count-${key}`}>
                    {count}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{label}</div>
                  {count > 0 ? (
                    <Unlink className="h-3 w-3 mx-auto mt-1.5 text-orange-500" />
                  ) : (
                    <CheckCircle className="h-3 w-3 mx-auto mt-1.5 text-green-500" />
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      <Card data-testid="card-total-orphans">
        <CardContent className="flex items-center gap-3 p-4">
          <Database className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <span className="text-sm font-medium">
              {totalOrphaned === 0 ? "All records are linked to projects" : `${totalOrphaned} orphaned records found`}
            </span>
          </div>
          {totalOrphaned === 0 ? (
            <Badge variant="default" className="bg-green-600">Healthy</Badge>
          ) : (
            <Badge variant="secondary">
              <AlertTriangle className="h-3 w-3 mr-1" />
              Needs Attention
            </Badge>
          )}
        </CardContent>
      </Card>

      {selectedEntityType && (
        <Card data-testid="card-orphaned-records">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                Orphaned {ENTITY_LABELS[selectedEntityType] || selectedEntityType}
              </CardTitle>
              <CardDescription>
                {records?.records?.length ?? 0} records without a project assignment
              </CardDescription>
            </div>
            {selectedRecords.size > 0 && (
              <div className="flex items-center gap-2" data-testid="bulk-link-controls">
                <Select value={linkProjectId} onValueChange={setLinkProjectId}>
                  <SelectTrigger className="w-64" data-testid="select-link-project">
                    <SelectValue placeholder="Select project to link..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(projects || []).map((p) => (
                      <SelectItem key={p.id} value={p.id} data-testid={`project-option-${p.id}`}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!linkProjectId || linkMutation.isPending}
                  onClick={() => linkMutation.mutate()}
                  data-testid="button-link-records"
                >
                  {linkMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Link2 className="h-3 w-3 mr-1" />
                  )}
                  Link {selectedRecords.size} Records
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {recordsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : !records?.records || records.records.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                <p className="text-sm">No orphaned {ENTITY_LABELS[selectedEntityType]?.toLowerCase()} found.</p>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center gap-3 p-2 border-b text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={selectedRecords.size === records.records.length}
                    onChange={toggleAll}
                    className="rounded"
                    data-testid="checkbox-select-all"
                  />
                  <span className="flex-1">Name</span>
                  <span className="w-24 text-center">Status</span>
                  <span className="w-32 text-right">Created</span>
                </div>
                {records.records.map((record) => (
                  <div
                    key={record.id}
                    className={`flex items-center gap-3 p-2 rounded-md border ${selectedRecords.has(record.id) ? "bg-primary/5 border-primary/20" : ""}`}
                    data-testid={`orphan-record-${record.id}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRecords.has(record.id)}
                      onChange={() => toggleRecord(record.id)}
                      className="rounded"
                      data-testid={`checkbox-record-${record.id}`}
                    />
                    <span className="flex-1 text-sm truncate" data-testid="text-record-name">{record.name || "(unnamed)"}</span>
                    <Badge variant="outline" className="w-24 justify-center text-xs" data-testid="text-record-status">{record.status}</Badge>
                    <span className="w-32 text-right text-xs text-muted-foreground" data-testid="text-record-date">
                      {record.created_at ? new Date(record.created_at).toLocaleDateString() : "--"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
