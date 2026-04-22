import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Loader2, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface EventLogEntry {
  id?: string | number;
  eventType?: string;
  entityType?: string;
  entityId?: string;
  triggeredBy?: string;
  status?: string;
  createdAt?: string;
  [key: string]: unknown;
}

export default function EventLog() {
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ events?: EventLogEntry[]; data?: EventLogEntry[] }>({
    queryKey: ["/api/events"],
    queryFn: () => fetch("/api/events?limit=100").then(r => r.json()),
  });

  const events: EventLogEntry[] = data?.events || data?.data || (Array.isArray(data) ? data : []);

  const retryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/events/retry-failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: "Retry Initiated", description: "Failed events are being retried." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to retry events.", variant: "destructive" });
    },
  });

  const eventTypes = Array.from(new Set(events.map(e => e.eventType).filter(Boolean)));

  const filtered = typeFilter === "all"
    ? events
    : events.filter(e => e.eventType === typeFilter);

  const formatDate = (d: string | undefined) => {
    if (!d) return "--";
    return new Date(d).toLocaleString();
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Event Log</h1>
          <p className="text-sm text-muted-foreground">
            <span data-testid="text-event-count">{events.length} events</span> tracked
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => retryMutation.mutate()}
          disabled={retryMutation.isPending}
          data-testid="button-retry-failed"
        >
          {retryMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          {retryMutation.isPending ? "Retrying..." : "Retry Failed"}
        </Button>
      </div>

      {eventTypes.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={typeFilter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setTypeFilter("all")}
            data-testid="filter-all"
          >
            All
          </Button>
          {eventTypes.map(type => (
            <Button
              key={type}
              variant={typeFilter === type ? "default" : "outline"}
              size="sm"
              onClick={() => setTypeFilter(type!)}
              data-testid={`filter-${type}`}
            >
              {type}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading events...</p>
      ) : (
        <Table data-testid="table-event-log">
          <TableHeader>
            <TableRow>
              <TableHead>Event Type</TableHead>
              <TableHead>Entity Type</TableHead>
              <TableHead>Entity ID</TableHead>
              <TableHead>Triggered By</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created At</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  No events found
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((evt, i) => (
                <TableRow key={evt.id || i} data-testid={`row-event-${i}`}>
                  <TableCell>
                    <Badge variant="outline">{evt.eventType || "--"}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{evt.entityType || "--"}</TableCell>
                  <TableCell className="text-sm font-mono text-muted-foreground">
                    {evt.entityId ? (evt.entityId.length > 12 ? evt.entityId.substring(0, 12) + "..." : evt.entityId) : "--"}
                  </TableCell>
                  <TableCell className="text-sm">{evt.triggeredBy || "--"}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        evt.status === "processed"
                          ? "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20"
                          : evt.status === "pending"
                          ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20"
                          : ""
                      }
                      variant={evt.status === "processed" || evt.status === "pending" ? "outline" : "secondary"}
                    >
                      {evt.status || "--"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(evt.createdAt)}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
