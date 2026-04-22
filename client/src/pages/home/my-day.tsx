import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

import TopBar from "@/components/my-day/TopBar";
import ActionRail from "@/components/my-day/ActionRail";
import TodayTimeline from "@/components/my-day/TodayTimeline";
import InsightsRail from "@/components/my-day/InsightsRail";
import ItemDetailsSheet from "@/components/my-day/ItemDetailsSheet";
import EventDetailsSheet from "@/components/my-day/EventDetailsSheet";

export type MyDayResponse = {
  kpis: {
    todaysEvents: number;
    overdue: number;
    dueToday: number;
    carried: number;
    rfis: number;
    submittals: number;
    atRisk: number;
    riskIndex: number;
  };
  briefing: {
    nextEvent: CalendarEvent | null;
    primaryRisk: WorkItem | null;
    recommendedOrder: WorkItem[];
  };
  engine: {
    critical: WorkItem[];
    strategic: WorkItem[];
    routine: WorkItem[];
  };
  grid: {
    rfis: WorkItem[];
    submittals: WorkItem[];
    tasks?: WorkItem[];
  };
  events: CalendarEvent[];
  nowIso: string;
  user?: { name?: string };
};

export type WorkItem = {
  id: string;
  type: "task" | "submittal" | "rfi";
  title: string;
  status: string;
  project?: string | null;
  dueTs?: string | null;
  due_ts?: string | null;
  lastActivityTs?: string | null;
  last_activity_ts?: string | null;
  assignedTo?: string | null;
  assigned_to?: string | null;
  priority_score?: number;
  priority_band?: "routine" | "strategic" | "critical";
  score_components?: {
    urgency?: number;
    impact?: number;
    risk?: number;
    aging?: number;
    meeting?: number;
    behavioral?: number;
  };
};

export type CalendarEvent = {
  id: string;
  title: string;
  startTs?: string;
  endTs?: string;
  start_ts?: string;
  end_ts?: string;
  location?: string | null;
  requiresPrep?: boolean;
  requires_prep?: boolean;
  responseStatus?: "none" | "accepted" | "tentative" | "declined";
  response_status?: "none" | "accepted" | "tentative" | "declined";
};

async function fetchMyDay(): Promise<MyDayResponse> {
  const res = await fetch("/api/my-day", { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export default function MyDayPage() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["my-day"],
    queryFn: fetchMyDay,
    staleTime: 15_000,
  });

  const [, navigate] = useLocation();
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const allItems = useMemo(() => {
    if (!data) return [];
    return [...(data.engine.critical || []), ...(data.engine.strategic || []), ...(data.engine.routine || [])];
  }, [data]);

  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null;
    return allItems.find((x) => x.id === selectedItemId) || null;
  }, [allItems, selectedItemId]);

  const selectedEvent = useMemo(() => {
    if (!selectedEventId || !data?.events) return null;
    return data.events.find((e) => e.id === selectedEventId) || null;
  }, [data?.events, selectedEventId]);

  return (
    <div className="flex flex-col h-full" data-testid="my-day-page">
      <TopBar
        userName={data?.user?.name || "Operator"}
        nowIso={data?.nowIso}
        kpis={data?.kpis}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="flex-1 min-h-0 grid grid-cols-12 divide-x overflow-hidden">
        <div className="col-span-12 xl:col-span-5 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : (
            <ActionRail
              engine={data!.engine}
              onOpenItem={(id) => setSelectedItemId(id)}
            />
          )}
        </div>

        <div className="col-span-12 xl:col-span-4 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <TodayTimeline
              nowIso={data!.nowIso}
              events={data!.events}
              onOpenEvent={(id) => setSelectedEventId(id)}
            />
          )}
        </div>

        <div className="col-span-12 xl:col-span-3 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <InsightsRail
              kpis={data!.kpis}
              grid={data!.grid}
              onOpenQueue={(type) => {
                const routes: Record<string, string> = {
                  submittals: "/execution/submittals",
                  rfis: "/execution/rfis",
                  tasks: "/execution/tasks",
                };
                navigate(routes[type] || `/execution/${type}`);
              }}
            />
          )}
        </div>
      </div>

      <ItemDetailsSheet
        open={!!selectedItemId}
        item={selectedItem}
        onOpenChange={(o) => (!o ? setSelectedItemId(null) : null)}
        onChanged={() => refetch()}
      />

      <EventDetailsSheet
        open={!!selectedEventId}
        event={selectedEvent}
        onOpenChange={(o) => (!o ? setSelectedEventId(null) : null)}
        onChanged={() => refetch()}
      />
    </div>
  );
}
