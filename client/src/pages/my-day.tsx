import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sun,
  Moon,
  Cloud,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileQuestion,
  FileCheck,
  ChevronRight,
  ArrowRight,
  Timer,
  ListChecks,
  MapPin,
  Users,
  Zap,
  TriangleAlert,
} from "lucide-react";

interface MyDayData {
  greeting: string;
  date: string;
  todayEvents: any[];
  weekEvents: any[];
  todayTasks: any[];
  overdueTasks: any[];
  yesterdayIncomplete: any[];
  dueRfis: any[];
  dueSubmittals: any[];
  nextEvent: any | null;
  conflicts: { event1: string; event2: string }[];
  summary: {
    totalTodayEvents: number;
    totalOverdueTasks: number;
    totalDueTodayTasks: number;
    totalDueRfis: number;
    totalDueSubmittals: number;
    hasConflicts: boolean;
  };
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: "bg-blue-500",
  site_visit: "bg-green-500",
  deadline: "bg-red-500",
  work_package: "bg-purple-500",
  personal: "bg-amber-500",
  submission: "bg-orange-500",
  reminder: "bg-muted-foreground",
};

function getGreetingIcon() {
  const hour = new Date().getHours();
  if (hour < 12) return <Sun className="h-6 w-6 text-amber-500" />;
  if (hour < 17) return <Cloud className="h-6 w-6 text-blue-400" />;
  return <Moon className="h-6 w-6 text-indigo-400" />;
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function getTimeUntil(dateStr: string) {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return "Now";
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `in ${hrs}h ${mins % 60}m`;
  return `in ${Math.floor(hrs / 24)}d`;
}

export default function MyDayPage() {
  const [, navigate] = useLocation();

  const { data, isLoading } = useQuery<MyDayData>({
    queryKey: ["/api/my-day"],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-6 space-y-6 overflow-auto" data-testid="myday-loading">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded-md w-1/3" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-24 bg-muted rounded-md" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-muted rounded-md" />
            <div className="h-64 bg-muted rounded-md" />
          </div>
        </div>
      </div>
    );
  }

  const d = data || {
    greeting: "Good morning",
    date: new Date().toISOString(),
    todayEvents: [],
    weekEvents: [],
    todayTasks: [],
    overdueTasks: [],
    yesterdayIncomplete: [],
    dueRfis: [],
    dueSubmittals: [],
    nextEvent: null,
    conflicts: [],
    summary: { totalTodayEvents: 0, totalOverdueTasks: 0, totalDueTodayTasks: 0, totalDueRfis: 0, totalDueSubmittals: 0, hasConflicts: false },
  };

  const totalActionItems = d.summary.totalOverdueTasks + d.summary.totalDueTodayTasks + d.summary.totalDueRfis + d.summary.totalDueSubmittals;

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto" data-testid="myday-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          {getGreetingIcon()}
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-greeting">{d.greeting}</h1>
            <p className="text-sm text-muted-foreground" data-testid="text-date">{formatDate(d.date)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate("/calendar")} data-testid="button-open-calendar">
            <Calendar className="mr-2 h-4 w-4" />
            Open Calendar
          </Button>
        </div>
      </div>

      {d.summary.hasConflicts && (
        <Card className="border-destructive/50 bg-destructive/5" data-testid="card-conflicts">
          <CardContent className="flex items-center gap-3 py-3">
            <TriangleAlert className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium text-destructive">Schedule Conflict Detected</p>
              <p className="text-sm text-muted-foreground">
                {d.conflicts.map((c, i) => (
                  <span key={i}>
                    {i > 0 && " | "}
                    "{c.event1}" overlaps with "{c.event2}"
                  </span>
                ))}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover-elevate" data-testid="card-stat-events">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-2 rounded-md bg-blue-500/10">
              <Calendar className="h-5 w-5 text-blue-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.summary.totalTodayEvents}</p>
              <p className="text-xs text-muted-foreground">Today's Events</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate" data-testid="card-stat-tasks">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-2 rounded-md bg-amber-500/10">
              <ListChecks className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.summary.totalDueTodayTasks}</p>
              <p className="text-xs text-muted-foreground">Tasks Due Today</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate" data-testid="card-stat-overdue">
          <CardContent className="flex items-center gap-4 py-4">
            <div className={`p-2 rounded-md ${d.summary.totalOverdueTasks > 0 ? "bg-red-500/10" : "bg-green-500/10"}`}>
              <AlertTriangle className={`h-5 w-5 ${d.summary.totalOverdueTasks > 0 ? "text-red-500" : "text-green-500"}`} />
            </div>
            <div>
              <p className="text-2xl font-bold">{d.summary.totalOverdueTasks}</p>
              <p className="text-xs text-muted-foreground">Overdue Items</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate" data-testid="card-stat-action">
          <CardContent className="flex items-center gap-4 py-4">
            <div className="p-2 rounded-md bg-purple-500/10">
              <Zap className="h-5 w-5 text-purple-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{totalActionItems}</p>
              <p className="text-xs text-muted-foreground">Action Items</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {d.nextEvent && (
        <Card className="border-primary/30 bg-primary/5" data-testid="card-next-event">
          <CardContent className="flex items-center justify-between gap-4 py-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-md bg-primary/10">
                <Timer className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Up Next</p>
                <p className="font-semibold" data-testid="text-next-event-title">{d.nextEvent.title}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{formatTime(d.nextEvent.start_at || d.nextEvent.startAt)}</span>
                  {(d.nextEvent.end_at || d.nextEvent.endAt) && <span>- {formatTime(d.nextEvent.end_at || d.nextEvent.endAt)}</span>}
                  <Badge variant="secondary" className="text-xs">{getTimeUntil(d.nextEvent.start_at || d.nextEvent.startAt)}</Badge>
                </div>
              </div>
            </div>
            {d.nextEvent.location && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3 w-3" />
                <span>{d.nextEvent.location}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-timeline">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">Today's Timeline</CardTitle>
            <Badge variant="secondary">{d.todayEvents.length} events</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.todayEvents.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground" data-testid="text-no-events">
                <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No events scheduled for today</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => navigate("/calendar")} data-testid="button-schedule-event">
                  Schedule something
                </Button>
              </div>
            ) : (
              d.todayEvents.map((evt: any) => (
                <div
                  key={evt.id}
                  className="flex items-start gap-3 p-3 rounded-md hover-elevate cursor-pointer"
                  onClick={() => navigate("/calendar")}
                  data-testid={`timeline-event-${evt.id}`}
                >
                  <div className={`w-1 h-full min-h-[2.5rem] rounded-full ${EVENT_TYPE_COLORS[evt.event_type || evt.eventType] || "bg-muted-foreground"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{evt.title}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 shrink-0" />
                      <span>{(evt.all_day || evt.allDay) ? "All Day" : `${formatTime(evt.start_at || evt.startAt)}${(evt.end_at || evt.endAt) ? ` - ${formatTime(evt.end_at || evt.endAt)}` : ""}`}</span>
                    </div>
                    {evt.location && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{evt.location}</span>
                      </div>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">{(evt.event_type || evt.eventType)?.replace("_", " ")}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card data-testid="card-overdue-tasks">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">Overdue Tasks</CardTitle>
              <Badge variant={d.overdueTasks.length > 0 ? "destructive" : "secondary"}>
                {d.overdueTasks.length}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.overdueTasks.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground" data-testid="text-no-overdue">
                  <CheckCircle2 className="h-6 w-6 mx-auto mb-1 text-green-500 opacity-70" />
                  <p className="text-sm">All caught up</p>
                </div>
              ) : (
                d.overdueTasks.slice(0, 5).map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                    onClick={() => navigate("/execution/tasks")}
                    data-testid={`overdue-task-${task.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      <span className="text-sm truncate">{task.name}</span>
                    </div>
                    <span className="text-xs text-red-500 shrink-0">
                      {(task.due_date || task.dueDate) ? new Date(task.due_date || task.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                    </span>
                  </div>
                ))
              )}
              {d.overdueTasks.length > 5 && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate("/execution/tasks")} data-testid="button-view-all-overdue">
                  View all {d.overdueTasks.length} overdue tasks
                  <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              )}
            </CardContent>
          </Card>

          <Card data-testid="card-today-tasks">
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <CardTitle className="text-base">Due Today</CardTitle>
              <Badge variant="secondary">{d.todayTasks.length}</Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.todayTasks.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground" data-testid="text-no-today-tasks">
                  <ListChecks className="h-6 w-6 mx-auto mb-1 opacity-50" />
                  <p className="text-sm">Nothing due today</p>
                </div>
              ) : (
                d.todayTasks.slice(0, 5).map((task: any) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                    onClick={() => navigate("/execution/tasks")}
                    data-testid={`today-task-${task.id}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{task.name}</span>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{task.priority || "medium"}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card data-testid="card-rfis">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileQuestion className="h-4 w-4" />
              Open RFIs
            </CardTitle>
            <Badge variant="secondary">{d.dueRfis.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.dueRfis.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-rfis">No pending RFIs this week</p>
            ) : (
              d.dueRfis.slice(0, 5).map((rfi: any) => (
                <div
                  key={rfi.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                  onClick={() => navigate("/execution/rfis")}
                  data-testid={`rfi-item-${rfi.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileQuestion className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="text-sm truncate">{rfi.subject || `RFI-${rfi.rfi_number || rfi.rfiNumber}`}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">{rfi.status}</Badge>
                    {(rfi.due_date || rfi.dueDate) && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(rfi.due_date || rfi.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-submittals">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="h-4 w-4" />
              Pending Submittals
            </CardTitle>
            <Badge variant="secondary">{d.dueSubmittals.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {d.dueSubmittals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4" data-testid="text-no-submittals">No pending submittals this week</p>
            ) : (
              d.dueSubmittals.slice(0, 5).map((sub: any) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-2 p-2 rounded-md hover-elevate cursor-pointer"
                  onClick={() => navigate("/execution/submittals")}
                  data-testid={`submittal-item-${sub.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileCheck className="h-4 w-4 text-orange-500 shrink-0" />
                    <span className="text-sm truncate">{sub.name || `Sub-${sub.submittal_number || sub.submittalNumber}`}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="outline" className="text-xs">{sub.status}</Badge>
                    {(sub.submitted_at || sub.submittedAt) && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(sub.submitted_at || sub.submittedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {d.weekEvents.length > 0 && (
        <Card data-testid="card-week-ahead">
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
            <CardTitle className="text-base">Week Ahead</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate("/calendar")} data-testid="button-full-calendar">
              Full Calendar
              <ChevronRight className="ml-1 h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {d.weekEvents.slice(0, 8).map((evt: any) => (
                <div
                  key={evt.id}
                  className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                  onClick={() => navigate("/calendar")}
                  data-testid={`week-event-${evt.id}`}
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_COLORS[evt.event_type || evt.eventType] || "bg-muted-foreground"}`} />
                  <span className="text-sm text-muted-foreground shrink-0 w-20">
                    {new Date(evt.start_at || evt.startAt).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  </span>
                  <span className="text-sm truncate flex-1">{evt.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0">{(evt.all_day || evt.allDay) ? "All Day" : formatTime(evt.start_at || evt.startAt)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
