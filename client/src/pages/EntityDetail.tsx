import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, Activity } from "lucide-react";
import { entityDetailConfig, type FieldDef } from "@/pages/entity-detail-config";

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function formatValue(v: any, format?: FieldDef["format"]): string {
  if (v === null || v === undefined || v === "") return "-";
  if (format === "currency") {
    const num = Number(v);
    if (isNaN(num)) return String(v);
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(num);
  }
  if (format === "date") {
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }
  if (format === "percentage") {
    return `${v}%`;
  }
  if (Array.isArray(v)) return v.length ? v.join(", ") : "-";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function Field({ label, value, format }: { label: string; value: any; format?: FieldDef["format"] }) {
  return (
    <div className="space-y-1" data-testid={`field-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{formatValue(value, format)}</div>
    </div>
  );
}

interface EntityDetailProps {
  entityType: string;
  id: string;
}

export default function EntityDetail({ entityType, id }: EntityDetailProps) {
  const [, setLocation] = useLocation();

  const config = entityDetailConfig[entityType];

  if (!config) {
    return (
      <div className="p-6" data-testid="entity-detail-unknown">
        <Card className="p-6">
          <div className="font-medium">Unknown entity type: {entityType}</div>
          <Button variant="ghost" className="mt-4" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  const q = useQuery({
    queryKey: [config.apiPath, id],
    enabled: Boolean(id),
    queryFn: () => fetchJson(`${config.apiPath}/${encodeURIComponent(id)}`),
  });

  const data = q.data;
  const entityName = data ? formatValue(data[config.nameField]) : config.displayName;
  const entityStatus = data ? data[config.statusField] : null;

  const auditQ = useQuery({
    queryKey: ["/api/audit", entityType, id],
    enabled: Boolean(id) && Boolean(data),
    queryFn: () => fetchJson(`/api/audit/${encodeURIComponent(entityType)}/${encodeURIComponent(id)}`).catch(() => []),
  });

  return (
    <div className="p-6 space-y-4" data-testid="entity-detail-page">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => setLocation(config.listPath)} data-testid="button-back-to-list">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to {config.displayName}s
        </Button>
      </div>

      {q.isLoading ? (
        <Card className="p-6 space-y-4">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : q.isError ? (
        <Card className="p-6 space-y-2" data-testid="entity-detail-error">
          <div className="font-medium">Failed to load {config.displayName.toLowerCase()}</div>
          <div className="text-sm text-muted-foreground">
            {(q.error as any)?.message ?? "Unknown error"}
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-xl font-semibold" data-testid="entity-detail-name">{entityName}</div>
                <div className="text-sm text-muted-foreground">{config.displayName}</div>
              </div>
              {entityStatus ? <Badge data-testid="entity-detail-status">{formatValue(entityStatus)}</Badge> : null}
            </div>
          </Card>

          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <Card className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {config.fields.map((field) => (
                    <Field key={field.key} label={field.label} value={data?.[field.key]} format={field.format} />
                  ))}
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="activity">
              <Card className="p-4">
                {auditQ.isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : (auditQ.data as any[])?.length ? (
                  <div className="space-y-3">
                    {(auditQ.data as any[]).slice(0, 20).map((entry: any, i: number) => (
                      <div key={entry.id || i} className="flex items-start gap-3 text-sm border-b pb-2 last:border-0">
                        <Activity className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{entry.eventTitle || entry.action || entry.eventType || "Event"}</div>
                          {entry.eventDescription && <div className="text-muted-foreground text-xs mt-0.5">{entry.eventDescription}</div>}
                          {entry.createdAt && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {new Date(entry.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No activity recorded yet</p>
                  </div>
                )}
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
