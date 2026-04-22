import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import type { MyDayResponse } from "@/pages/home/my-day";

interface TopBarProps {
  userName: string;
  nowIso?: string;
  kpis?: MyDayResponse["kpis"];
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export default function TopBar({ userName, kpis, onRefresh, isRefreshing }: TopBarProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-background/95 backdrop-blur sticky top-0 z-50 flex-wrap" data-testid="myday-topbar">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold leading-tight" data-testid="text-myday-greeting">
          {greeting}, {userName}
        </h1>
        <p className="text-xs text-muted-foreground" data-testid="text-myday-date">{dateStr}</p>
      </div>

      {kpis && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="text-[11px]" data-testid="badge-events-count">
            {kpis.todaysEvents} events
          </Badge>
          <Badge variant="secondary" className="text-[11px]" data-testid="badge-due-today">
            {kpis.dueToday} due today
          </Badge>
          {kpis.overdue > 0 && (
            <Badge variant="destructive" className="text-[11px]" data-testid="badge-overdue-count">
              {kpis.overdue} overdue
            </Badge>
          )}
          {kpis.atRisk > 0 && (
            <Badge variant="destructive" className="text-[11px]" data-testid="badge-at-risk">
              {kpis.atRisk} at risk
            </Badge>
          )}
        </div>
      )}

      <Button size="icon" variant="ghost" onClick={onRefresh} disabled={isRefreshing} data-testid="button-refresh">
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
      </Button>
    </div>
  );
}
