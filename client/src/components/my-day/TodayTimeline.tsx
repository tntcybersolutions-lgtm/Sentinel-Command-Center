import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, AlertTriangle, Calendar, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import type { CalendarEvent, WorkItem } from "@/pages/home/my-day";

function getTs(e: CalendarEvent, key: "start" | "end") {
  return (key === "start" ? (e.startTs ?? e.start_ts) : (e.endTs ?? e.end_ts)) ?? "";
}

type Nudge = { type: string; message: string; severity: "info" | "warning" | "critical" };

export default function TodayTimeline({
  nowIso,
  events,
  onOpenEvent,
}: {
  nowIso: string;
  events: CalendarEvent[];
  onOpenEvent: (id: string) => void;
}) {
  const [briefingExpanded, setBriefingExpanded] = useState(true);

  const today = new Date(nowIso);
  const todaysEvents = [...events]
    .filter((e) => new Date(getTs(e, "start")).toDateString() === today.toDateString())
    .sort((a, b) => new Date(getTs(a, "start")).getTime() - new Date(getTs(b, "start")).getTime());

  const briefingQuery = useQuery({
    queryKey: ["my-day-briefing"],
    queryFn: async () => {
      const res = await fetch("/api/my-day/briefing", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ briefing: string; generatedAt: string }>;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const nudgesQuery = useQuery({
    queryKey: ["my-day-nudges"],
    queryFn: async () => {
      const res = await fetch("/api/my-day/nudges", { credentials: "include" });
      if (!res.ok) return { nudges: [] };
      return res.json() as Promise<{ nudges: Nudge[] }>;
    },
    staleTime: 60 * 1000,
    retry: 1,
  });

  const nudges = nudgesQuery.data?.nudges ?? [];

  return (
    <div className="h-full flex flex-col" data-testid="today-timeline">
      <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Today's Schedule</h2>
          <p className="text-xs text-muted-foreground">Calendar, briefing, and alerts</p>
        </div>
        {todaysEvents.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">{todaysEvents.length} event{todaysEvents.length !== 1 ? "s" : ""}</Badge>
        )}
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <button
            onClick={() => setBriefingExpanded(!briefingExpanded)}
            className="w-full text-left flex items-center justify-between gap-2 mb-2"
            data-testid="button-toggle-briefing"
          >
            <div className="flex items-center gap-1.5">
              <Bot className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold">HERBIE Daily Briefing</span>
            </div>
            {briefingExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>

          {briefingExpanded && (
            <div className="rounded-md border bg-muted/30 p-3 mb-3" data-testid="ai-briefing">
              {briefingQuery.isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
              ) : briefingQuery.isError ? (
                <p className="text-xs text-muted-foreground italic">Briefing unavailable. Refresh to retry.</p>
              ) : (
                <p className="text-xs leading-relaxed text-foreground/90" data-testid="text-briefing-content">
                  {briefingQuery.data?.briefing}
                </p>
              )}
            </div>
          )}
        </div>

        {nudges.length > 0 && (
          <>
            <Separator />
            <div className="p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-semibold">Proactive Nudges</span>
              </div>
              <div className="space-y-1.5">
                {nudges.map((n, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs ${
                      n.severity === "critical" ? "bg-destructive/10 text-destructive" :
                      n.severity === "warning" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                      "bg-muted/40 text-muted-foreground"
                    }`}
                    data-testid={`nudge-${i}`}
                  >
                    <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${
                      n.severity === "critical" ? "text-destructive" :
                      n.severity === "warning" ? "text-amber-500" : "text-muted-foreground"
                    }`} />
                    <span>{n.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold">Events</span>
          </div>
          {todaysEvents.length === 0 ? (
            <p className="text-xs text-muted-foreground italic" data-testid="text-no-events">No events scheduled for today.</p>
          ) : (
            <div className="space-y-1">
              {todaysEvents.map((e) => {
                const startTime = new Date(getTs(e, "start")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const endTime = new Date(getTs(e, "end")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const status = (e.responseStatus ?? e.response_status ?? "none");

                return (
                  <button
                    key={e.id}
                    onClick={() => onOpenEvent(e.id)}
                    data-testid={`event-row-${e.id}`}
                    className="w-full text-left rounded-md px-2 py-2 hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{e.title}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {startTime}–{endTime}
                          {e.location ? ` · ${e.location}` : ""}
                        </div>
                      </div>
                      {status !== "none" && (
                        <Badge
                          variant={status === "accepted" ? "default" : status === "declined" ? "destructive" : "secondary"}
                          className="text-[10px] shrink-0"
                        >
                          {status.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
