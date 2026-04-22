import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventDropArg, DatesSetArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Users,
  Plus,
  FileText,
  Download,
  Copy,
  Edit2,
  XCircle,
  CopyPlus,
  Filter,
  Globe,
  ExternalLink,
  UsersRound,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  eventType: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  timezone: string | null;
  location: string | null;
  status: string;
  source: string;
  projectId: number | null;
  ownerUserId: number | null;
  attendeesJson: string | null;
  isOverlay: boolean;
}

interface Project {
  id: number;
  name: string;
}

const EVENT_TYPE_COLORS: Record<string, string> = {
  meeting: "#3b82f6",
  site_visit: "#22c55e",
  deadline: "#ef4444",
  work_package: "#a855f7",
  personal: "#f59e0b",
  submission: "#f97316",
  reminder: "#6b7280",
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  meeting: "Meeting",
  site_visit: "Site Visit",
  deadline: "Deadline",
  work_package: "Work Package",
  personal: "Personal",
  submission: "Submission",
  reminder: "Reminder",
};

const US_TIMEZONES = [
  { value: "America/New_York", label: "Eastern (ET)" },
  { value: "America/Chicago", label: "Central (CT)" },
  { value: "America/Denver", label: "Mountain (MT)" },
  { value: "America/Los_Angeles", label: "Pacific (PT)" },
  { value: "America/Anchorage", label: "Alaska (AKT)" },
  { value: "Pacific/Honolulu", label: "Hawaii (HT)" },
];

const INITIAL_FORM = {
  title: "",
  description: "",
  eventType: "meeting",
  startAt: "",
  startTime: "09:00",
  endAt: "",
  endTime: "10:00",
  allDay: false,
  timezone: "America/Chicago",
  location: "",
  projectId: "",
  status: "confirmed",
  attendeesJson: "",
};

function generateICS(event: CalendarEvent): string {
  const formatDate = (d: string) =>
    new Date(d)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const start = formatDate(event.startAt);
  const end = event.endAt
    ? formatDate(event.endAt)
    : formatDate(
        new Date(
          new Date(event.startAt).getTime() + 60 * 60 * 1000
        ).toISOString()
      );
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Blackhawk//Calendar//EN",
    "BEGIN:VEVENT",
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description || ""}`,
    `LOCATION:${event.location || ""}`,
    `UID:${event.id}@blackhawk-calendar`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadICS(event: CalendarEvent) {
  const ics = generateICS(event);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${event.title.replace(/\s+/g, "_")}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CalendarPage() {
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: new Date().toISOString(),
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [filterProjectId, setFilterProjectId] = useState<string>("");
  const [filterEventTypes, setFilterEventTypes] = useState<Set<string>>(
    new Set(Object.keys(EVENT_TYPE_COLORS))
  );
  const [filterStatuses, setFilterStatuses] = useState<Set<string>>(
    new Set(["confirmed", "tentative", "cancelled"])
  );
  const [showFilters, setShowFilters] = useState(false);
  const [teamView, setTeamView] = useState(false);
  const [currentView, setCurrentView] = useState("dayGridMonth");

  const calendarRef = useRef<FullCalendar>(null);
  const { toast } = useToast();

  const queryParams = new URLSearchParams();
  queryParams.set("start", dateRange.start);
  queryParams.set("end", dateRange.end);
  if (filterProjectId) queryParams.set("projectId", filterProjectId);

  const { data: events = [], isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar/events", `?${queryParams.toString()}`],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const filteredEvents = events.filter((e) => {
    if (!filterEventTypes.has(e.eventType)) return false;
    if (!filterStatuses.has(e.status)) return false;
    return true;
  });

  const calendarEvents = filteredEvents.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.startAt,
    end: e.endAt || undefined,
    allDay: e.allDay,
    backgroundColor: EVENT_TYPE_COLORS[e.eventType] || "#6b7280",
    borderColor: EVENT_TYPE_COLORS[e.eventType] || "#6b7280",
    textColor: "#ffffff",
    extendedProps: e,
  }));

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      return apiRequest("POST", "/api/calendar/events", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Event Created", description: "Calendar event added." });
      setDialogOpen(false);
      setFormData(INITIAL_FORM);
      setEditingEvent(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      return apiRequest("PATCH", `/api/calendar/events/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Event Updated", description: "Calendar event updated." });
      setDialogOpen(false);
      setFormData(INITIAL_FORM);
      setEditingEvent(null);
      setSheetOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/calendar/events/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar/events"] });
      toast({ title: "Event Cancelled", description: "Calendar event cancelled." });
      setSheetOpen(false);
      setSelectedEvent(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleDatesSet = useCallback((dateInfo: DatesSetArg) => {
    setDateRange({
      start: dateInfo.startStr,
      end: dateInfo.endStr,
    });
    setCurrentView(dateInfo.view.type);
  }, []);

  const handleEventClick = useCallback((clickInfo: EventClickArg) => {
    const evt = clickInfo.event.extendedProps as CalendarEvent;
    setSelectedEvent(evt);
    setSheetOpen(true);
  }, []);

  const handleDateClick = useCallback((dateInfo: DateClickArg) => {
    const dateStr = dateInfo.dateStr.includes("T")
      ? dateInfo.dateStr.substring(0, 10)
      : dateInfo.dateStr;
    const timeStr = dateInfo.dateStr.includes("T")
      ? dateInfo.dateStr.substring(11, 16)
      : "09:00";
    const endHour = parseInt(timeStr.split(":")[0]) + 1;
    const endTime = `${String(endHour).padStart(2, "0")}:${timeStr.split(":")[1]}`;

    setFormData({
      ...INITIAL_FORM,
      startAt: dateStr,
      startTime: timeStr,
      endAt: dateStr,
      endTime: endTime,
    });
    setEditingEvent(null);
    setDialogOpen(true);
  }, []);

  const handleEventDrop = useCallback(
    (dropInfo: EventDropArg) => {
      const evt = dropInfo.event.extendedProps as CalendarEvent;
      const newStart = dropInfo.event.start?.toISOString();
      const newEnd = dropInfo.event.end?.toISOString();
      if (!newStart) return;
      updateMutation.mutate({
        id: evt.id,
        data: {
          startAt: newStart,
          endAt: newEnd || null,
        },
      });
    },
    [updateMutation]
  );

  const handleSaveEvent = () => {
    if (!formData.title) {
      toast({ title: "Validation Error", description: "Title is required.", variant: "destructive" });
      return;
    }
    if (!formData.startAt) {
      toast({ title: "Validation Error", description: "Start date is required.", variant: "destructive" });
      return;
    }

    const startAt = formData.allDay
      ? new Date(`${formData.startAt}T00:00:00`).toISOString()
      : new Date(`${formData.startAt}T${formData.startTime || "09:00"}`).toISOString();
    const endAt =
      formData.endAt && (formData.endTime || formData.allDay)
        ? formData.allDay
          ? new Date(`${formData.endAt}T23:59:59`).toISOString()
          : new Date(`${formData.endAt}T${formData.endTime || "10:00"}`).toISOString()
        : null;

    const payload: Record<string, unknown> = {
      title: formData.title,
      description: formData.description || null,
      eventType: formData.eventType,
      startAt,
      endAt,
      allDay: formData.allDay,
      timezone: formData.timezone,
      location: formData.location || null,
      projectId: formData.projectId ? Number(formData.projectId) : null,
      status: formData.status,
      attendeesJson: formData.attendeesJson || null,
    };

    if (editingEvent) {
      updateMutation.mutate({ id: editingEvent.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const openEditDialog = (event: CalendarEvent) => {
    const start = new Date(event.startAt);
    const end = event.endAt ? new Date(event.endAt) : null;
    setFormData({
      title: event.title,
      description: event.description || "",
      eventType: event.eventType,
      startAt: start.toISOString().substring(0, 10),
      startTime: start.toISOString().substring(11, 16),
      endAt: end ? end.toISOString().substring(0, 10) : "",
      endTime: end ? end.toISOString().substring(11, 16) : "",
      allDay: event.allDay,
      timezone: event.timezone || "America/Chicago",
      location: event.location || "",
      projectId: event.projectId ? String(event.projectId) : "",
      status: event.status,
      attendeesJson: event.attendeesJson || "",
    });
    setEditingEvent(event);
    setSheetOpen(false);
    setDialogOpen(true);
  };

  const handleDuplicate = (event: CalendarEvent) => {
    setFormData({
      title: `${event.title} - Duplicate`,
      description: event.description || "",
      eventType: event.eventType,
      startAt: new Date(event.startAt).toISOString().substring(0, 10),
      startTime: new Date(event.startAt).toISOString().substring(11, 16),
      endAt: event.endAt ? new Date(event.endAt).toISOString().substring(0, 10) : "",
      endTime: event.endAt ? new Date(event.endAt).toISOString().substring(11, 16) : "",
      allDay: event.allDay,
      timezone: event.timezone || "America/Chicago",
      location: event.location || "",
      projectId: event.projectId ? String(event.projectId) : "",
      status: event.status,
      attendeesJson: event.attendeesJson || "",
    });
    setEditingEvent(null);
    setSheetOpen(false);
    setDialogOpen(true);
  };

  const applySiteVisitTemplate = () => {
    const startTime = formData.startTime || "09:00";
    const startHour = parseInt(startTime.split(":")[0]);
    const endHour = startHour + 2;
    setFormData({
      ...formData,
      eventType: "site_visit",
      endAt: formData.startAt || formData.endAt,
      endTime: `${String(endHour).padStart(2, "0")}:${startTime.split(":")[1]}`,
    });
  };

  const handleCopyLink = (event: CalendarEvent) => {
    const link = `${window.location.origin}/calendar?event=${event.id}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link Copied", description: "Event link copied to clipboard." });
  };

  const toggleEventType = (type: string) => {
    setFilterEventTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const toggleStatus = (status: string) => {
    setFilterStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const changeView = (view: string) => {
    const api = calendarRef.current?.getApi();
    if (api) {
      api.changeView(view);
      setCurrentView(view);
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case "google":
        return <Badge variant="secondary" data-testid="badge-source-google">Google</Badge>;
      case "microsoft":
        return <Badge variant="secondary" data-testid="badge-source-microsoft">Microsoft</Badge>;
      default:
        return <Badge variant="outline" data-testid="badge-source-local">Local</Badge>;
    }
  };

  const getProjectName = (projectId: number | null) => {
    if (!projectId) return null;
    const project = projects.find((p) => p.id === projectId);
    return project?.name || `Project #${projectId}`;
  };

  const parseAttendees = (json: string | null): string[] => {
    if (!json) return [];
    try {
      const parsed = JSON.parse(json);
      return Array.isArray(parsed) ? parsed : [json];
    } catch {
      return json.split(",").map((s) => s.trim()).filter(Boolean);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden" data-testid="calendar-page">
      <style>{`
        .fc {
          --fc-border-color: hsl(var(--border));
          --fc-button-bg-color: hsl(var(--primary));
          --fc-button-border-color: hsl(var(--primary));
          --fc-button-hover-bg-color: hsl(var(--primary) / 0.9);
          --fc-button-hover-border-color: hsl(var(--primary) / 0.9);
          --fc-button-active-bg-color: hsl(var(--primary) / 0.8);
          --fc-button-active-border-color: hsl(var(--primary) / 0.8);
          --fc-event-border-color: transparent;
          --fc-today-bg-color: hsl(var(--primary) / 0.05);
          --fc-page-bg-color: hsl(var(--background));
          --fc-neutral-bg-color: hsl(var(--muted));
          --fc-list-event-hover-bg-color: hsl(var(--accent));
          --fc-highlight-color: hsl(var(--primary) / 0.1);
          font-family: inherit;
        }
        .fc .fc-toolbar-title {
          font-size: 1.25rem;
          font-weight: 600;
          color: hsl(var(--foreground));
        }
        .fc .fc-col-header-cell {
          background: hsl(var(--muted));
          color: hsl(var(--muted-foreground));
          font-weight: 500;
          font-size: 0.8125rem;
          padding: 8px 0;
        }
        .fc .fc-daygrid-day-number {
          color: hsl(var(--foreground));
          font-size: 0.8125rem;
          padding: 4px 8px;
        }
        .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
          background: hsl(var(--primary));
          color: hsl(var(--primary-foreground));
          border-radius: 9999px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .fc .fc-event {
          border-radius: 4px;
          font-size: 0.75rem;
          padding: 1px 4px;
          cursor: pointer;
        }
        .fc .fc-event:hover {
          opacity: 0.85;
        }
        .fc .fc-button {
          font-size: 0.8125rem;
          padding: 4px 12px;
          border-radius: 6px;
          font-weight: 500;
        }
        .fc .fc-button-primary:not(:disabled).fc-button-active {
          background-color: hsl(var(--primary) / 0.8);
        }
        .fc .fc-scrollgrid {
          border-color: hsl(var(--border));
        }
        .fc td, .fc th {
          border-color: hsl(var(--border));
        }
        .fc .fc-timegrid-slot {
          height: 3em;
        }
        .fc .fc-timegrid-slot-label {
          color: hsl(var(--muted-foreground));
          font-size: 0.75rem;
        }
        .fc .fc-list-event td {
          border-color: hsl(var(--border));
        }
        .fc .fc-list-day-cushion {
          background: hsl(var(--muted));
          color: hsl(var(--foreground));
        }
        .fc .fc-daygrid-day-frame {
          min-height: 80px;
        }
        .fc .fc-toolbar {
          display: none !important;
        }
      `}</style>

      <div className="p-4 md:p-6 pb-0 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-calendar-title">Calendar</h1>
          <p className="text-muted-foreground">Track deadlines, meetings, and bid events</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {teamView && (
            <Badge variant="secondary" data-testid="badge-team-view">
              <UsersRound className="h-3 w-3 mr-1" />
              Team View Active
            </Badge>
          )}
          <Button
            variant={teamView ? "default" : "outline"}
            size="sm"
            onClick={() => setTeamView(!teamView)}
            data-testid="button-team-view"
            className="toggle-elevate"
          >
            <UsersRound className="h-4 w-4 mr-1" />
            Team View
          </Button>
          <Button
            variant={showFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            data-testid="button-toggle-filters"
            className="toggle-elevate"
          >
            <Filter className="h-4 w-4 mr-1" />
            Filters
          </Button>
          <Button
            onClick={() => {
              setFormData(INITIAL_FORM);
              setEditingEvent(null);
              setDialogOpen(true);
            }}
            data-testid="button-new-event"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Event
          </Button>
        </div>
      </div>

      <div className="p-4 md:px-6 pb-2 flex items-center gap-2 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={() => calendarRef.current?.getApi()?.today()}
          data-testid="button-today"
        >
          Today
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => calendarRef.current?.getApi()?.prev()}
          data-testid="button-prev"
        >
          <CalendarIcon className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => calendarRef.current?.getApi()?.next()}
          data-testid="button-next"
        >
          <CalendarIcon className="h-4 w-4" />
        </Button>
        <span className="text-lg font-semibold ml-2" data-testid="text-calendar-date-range">
          {calendarRef.current?.getApi()?.view.title || ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant={currentView === "dayGridMonth" ? "default" : "outline"}
            size="sm"
            onClick={() => changeView("dayGridMonth")}
            data-testid="button-view-month"
          >
            Month
          </Button>
          <Button
            variant={currentView === "timeGridWeek" ? "default" : "outline"}
            size="sm"
            onClick={() => changeView("timeGridWeek")}
            data-testid="button-view-week"
          >
            Week
          </Button>
          <Button
            variant={currentView === "timeGridDay" ? "default" : "outline"}
            size="sm"
            onClick={() => changeView("timeGridDay")}
            data-testid="button-view-day"
          >
            Day
          </Button>
          <Button
            variant={currentView === "listWeek" ? "default" : "outline"}
            size="sm"
            onClick={() => changeView("listWeek")}
            data-testid="button-view-agenda"
          >
            Agenda
          </Button>
        </div>
      </div>

      {teamView && (
        <div className="px-4 md:px-6 pb-2">
          <Card>
            <CardContent className="p-3 flex items-center gap-2">
              <UsersRound className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Team View: Showing all team members' events. Resource timeline requires additional configuration.
              </span>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex-1 flex overflow-hidden px-4 md:px-6 pb-4 md:pb-6 gap-4">
        {showFilters && (
          <Card className="w-64 shrink-0 overflow-auto" data-testid="panel-filters">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Project</Label>
                <Select
                  value={filterProjectId}
                  onValueChange={setFilterProjectId}
                >
                  <SelectTrigger data-testid="select-filter-project">
                    <SelectValue placeholder="All Projects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Projects</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Event Type</Label>
                <div className="space-y-2">
                  {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                    <div key={key} className="flex items-center gap-2">
                      <Checkbox
                        id={`filter-type-${key}`}
                        checked={filterEventTypes.has(key)}
                        onCheckedChange={() => toggleEventType(key)}
                        data-testid={`checkbox-filter-type-${key}`}
                      />
                      <label
                        htmlFor={`filter-type-${key}`}
                        className="text-sm flex items-center gap-2 cursor-pointer"
                      >
                        <span
                          className="w-3 h-3 rounded-full inline-block"
                          style={{ backgroundColor: EVENT_TYPE_COLORS[key] }}
                        />
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Status</Label>
                <div className="space-y-2">
                  {["confirmed", "tentative", "cancelled"].map((status) => (
                    <div key={status} className="flex items-center gap-2">
                      <Checkbox
                        id={`filter-status-${status}`}
                        checked={filterStatuses.has(status)}
                        onCheckedChange={() => toggleStatus(status)}
                        data-testid={`checkbox-filter-status-${status}`}
                      />
                      <label
                        htmlFor={`filter-status-${status}`}
                        className="text-sm capitalize cursor-pointer"
                      >
                        {status}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="space-y-4 p-4">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-[500px] w-full" />
            </div>
          ) : (
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              headerToolbar={false}
              events={calendarEvents}
              editable={true}
              selectable={true}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              eventDrop={handleEventDrop}
              datesSet={handleDatesSet}
              height="100%"
              dayMaxEventRows={3}
              nowIndicator={true}
              eventDisplay="block"
            />
          )}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="overflow-auto sm:max-w-md" data-testid="sheet-event-detail">
          {selectedEvent && (
            <>
              <SheetHeader>
                <SheetTitle data-testid="text-event-title">{selectedEvent.title}</SheetTitle>
                <SheetDescription>
                  <Badge
                    className="no-default-hover-elevate"
                    style={{
                      backgroundColor: `${EVENT_TYPE_COLORS[selectedEvent.eventType]}20`,
                      color: EVENT_TYPE_COLORS[selectedEvent.eventType],
                      borderColor: `${EVENT_TYPE_COLORS[selectedEvent.eventType]}40`,
                    }}
                    data-testid="badge-event-type"
                  >
                    {EVENT_TYPE_LABELS[selectedEvent.eventType] || selectedEvent.eventType}
                  </Badge>
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium" data-testid="text-event-start">{formatDateTime(selectedEvent.startAt)}</p>
                    {selectedEvent.endAt && (
                      <p className="text-sm text-muted-foreground" data-testid="text-event-end">
                        to {formatDateTime(selectedEvent.endAt)}
                      </p>
                    )}
                    {selectedEvent.timezone && (
                      <p className="text-xs text-muted-foreground mt-1" data-testid="text-event-timezone">
                        <Globe className="h-3 w-3 inline mr-1" />
                        {selectedEvent.timezone}
                      </p>
                    )}
                  </div>
                </div>

                {selectedEvent.location && (
                  <div className="flex items-start gap-3">
                    <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <p className="text-sm" data-testid="text-event-location">{selectedEvent.location}</p>
                  </div>
                )}

                {selectedEvent.projectId && (
                  <div className="flex items-start gap-3">
                    <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <p className="text-sm" data-testid="text-event-project">
                      {getProjectName(selectedEvent.projectId)}
                    </p>
                  </div>
                )}

                {parseAttendees(selectedEvent.attendeesJson).length > 0 && (
                  <div className="flex items-start gap-3">
                    <Users className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="space-y-1" data-testid="list-event-attendees">
                      {parseAttendees(selectedEvent.attendeesJson).map((a, i) => (
                        <p key={i} className="text-sm">{a}</p>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEvent.description && (
                  <div className="border-t pt-4">
                    <Label className="text-sm font-medium">Notes</Label>
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap" data-testid="text-event-description">
                      {selectedEvent.description}
                    </p>
                  </div>
                )}

                <div className="border-t pt-4 flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-muted-foreground mr-1">Sync:</span>
                  {getSourceBadge(selectedEvent.source)}
                  <Badge
                    variant={selectedEvent.status === "cancelled" ? "destructive" : "outline"}
                    data-testid="badge-event-status"
                  >
                    {selectedEvent.status}
                  </Badge>
                </div>

                {selectedEvent.isOverlay ? (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      This is an overlay event from another source.
                    </p>
                    <Button variant="outline" size="sm" data-testid="button-view-entity">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      View Original
                    </Button>
                  </div>
                ) : (
                  <div className="border-t pt-4 grid grid-cols-2 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openEditDialog(selectedEvent)}
                      data-testid="button-edit-event"
                    >
                      <Edit2 className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteMutation.mutate(selectedEvent.id)}
                      disabled={deleteMutation.isPending}
                      data-testid="button-cancel-event"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Cancel
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDuplicate(selectedEvent)}
                      data-testid="button-duplicate-event"
                    >
                      <CopyPlus className="h-4 w-4 mr-1" />
                      Duplicate
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(selectedEvent)}
                      data-testid="button-copy-link"
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Copy Link
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadICS(selectedEvent)}
                      className="col-span-2"
                      data-testid="button-export-ics"
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Export ICS
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-lg" data-testid="dialog-event-form">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "Create New Event"}</DialogTitle>
            <DialogDescription>
              {editingEvent ? "Update event details" : "Add a new event to your calendar"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={applySiteVisitTemplate}
                data-testid="button-site-visit-template"
              >
                <MapPin className="h-4 w-4 mr-1" />
                Site Visit Template
              </Button>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="evt-title">Title</Label>
              <Input
                id="evt-title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Event title"
                data-testid="input-event-title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Event Type</Label>
                <Select
                  value={formData.eventType}
                  onValueChange={(v) => setFormData({ ...formData, eventType: v })}
                >
                  <SelectTrigger data-testid="select-event-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(v) => setFormData({ ...formData, status: v })}
                >
                  <SelectTrigger data-testid="select-event-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="tentative">Tentative</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="all-day"
                checked={formData.allDay}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, allDay: checked === true })
                }
                data-testid="checkbox-all-day"
              />
              <label htmlFor="all-day" className="text-sm cursor-pointer">
                All Day Event
              </label>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={formData.startAt}
                  onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
                  data-testid="input-event-start-date"
                />
              </div>
              {!formData.allDay && (
                <div className="grid gap-2">
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={formData.startTime}
                    onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                    data-testid="input-event-start-time"
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={formData.endAt}
                  onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
                  data-testid="input-event-end-date"
                />
              </div>
              {!formData.allDay && (
                <div className="grid gap-2">
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={formData.endTime}
                    onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                    data-testid="input-event-end-time"
                  />
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label>Timezone</Label>
              <Select
                value={formData.timezone}
                onValueChange={(v) => setFormData({ ...formData, timezone: v })}
              >
                <SelectTrigger data-testid="select-event-timezone">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {US_TIMEZONES.map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Location</Label>
              <Input
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="Event location"
                data-testid="input-event-location"
              />
            </div>

            <div className="grid gap-2">
              <Label>Project</Label>
              <Select
                value={formData.projectId}
                onValueChange={(v) => setFormData({ ...formData, projectId: v === "none" ? "" : v })}
              >
                <SelectTrigger data-testid="select-event-project">
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No project</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Attendees</Label>
              <Input
                value={formData.attendeesJson}
                onChange={(e) => setFormData({ ...formData, attendeesJson: e.target.value })}
                placeholder="email1@example.com, email2@example.com"
                data-testid="input-event-attendees"
              />
            </div>

            <div className="grid gap-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Event description or notes"
                data-testid="input-event-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-dialog">
              Cancel
            </Button>
            <Button
              onClick={handleSaveEvent}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-event"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "Saving..."
                : editingEvent
                ? "Update Event"
                : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
