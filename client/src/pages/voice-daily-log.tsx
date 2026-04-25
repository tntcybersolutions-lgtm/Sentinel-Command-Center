import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Mic, CloudSun, Users, ListChecks, AlertTriangle, ShieldAlert,
  CheckCircle2, RefreshCcw, Clock, FolderOpen, Sparkles, Square,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useProjectContext } from "@/nav/project-context";

interface DailyLogRow {
  id: string;
  logDate: string;
  source: string;
  status: string;
  weatherJson?: { summary?: string; conditions?: string; description?: string; temperature?: string | number } | null;
  workPerformedJson?: string[] | null;
  laborJson?: Array<{ trade?: string; count?: number; hours?: number }> | null;
  issuesJson?: string[] | null;
  safetyNotesJson?: string[] | null;
  notes?: string | null;
  createdAt?: string;
}

interface ManualLogFormState {
  weather: string;
  crew_count: string;
  tasks_completed: string;
  issues: string;
  safety_notes: string;
}

const EMPTY_FORM: ManualLogFormState = {
  weather: "",
  crew_count: "",
  tasks_completed: "",
  issues: "",
  safety_notes: "",
};

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function relTime(d?: string) {
  if (!d) return "";
  const ms = Date.now() - new Date(d).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const day = Math.floor(h / 24);
  return `${day}d ago`;
}

function crewSum(labor?: DailyLogRow["laborJson"] | { crews?: number; totalHours?: number } | null): number {
  if (!labor) return 0;
  if (Array.isArray(labor)) return labor.reduce((s, l) => s + (Number(l?.count) || 0), 0);
  if (typeof (labor as any).crews === "number") return (labor as any).crews;
  return 0;
}

function weatherText(w?: DailyLogRow["weatherJson"]): string | null {
  if (!w) return null;
  const parts = [w.summary, w.conditions, w.description].filter(Boolean);
  if (parts.length === 0 && w.temperature == null) return null;
  const text = parts.join(" — ");
  if (w.temperature != null) {
    const t = String(w.temperature);
    return text ? `${text} (${t})` : t;
  }
  return text || null;
}

export default function VoiceDailyLogPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { selectedProjectId, selectedProjectName, selectProject } = useProjectContext();
  const urlProjectId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const sp = new URLSearchParams(window.location.search);
    return sp.get("projectId");
  }, []);
  const projectId = urlProjectId ?? selectedProjectId;

  const [voiceOpen, setVoiceOpen] = useState(false);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [form, setForm] = useState<ManualLogFormState>(EMPTY_FORM);

  const logsQuery = useQuery<DailyLogRow[]>({
    queryKey: ["/api/projects", projectId, "daily-logs"],
    enabled: !!projectId,
  });

  const hasGoodName = selectedProjectName && selectedProjectName !== "Project" && selectedProjectId === projectId;
  const needsProjectFetch = !!projectId && !hasGoodName;
  const projectQuery = useQuery<{ id: string; name: string; projectNumber?: string }>({
    queryKey: ["/api/projects", projectId],
    enabled: needsProjectFetch,
  });
  useEffect(() => {
    const fetched = projectQuery.data;
    if (fetched && fetched.id === projectId && fetched.name && fetched.name !== selectedProjectName) {
      selectProject(fetched.id, fetched.name);
    }
  }, [projectQuery.data, projectId, selectedProjectName, selectProject]);
  const displayProjectName =
    (selectedProjectId === projectId ? selectedProjectName : null) ??
    projectQuery.data?.name ??
    "Selected project";

  const submitMutation = useMutation({
    mutationFn: async (payload: ManualLogFormState) => {
      const res = await apiRequest(
        "POST",
        `/api/projects/${projectId}/daily-logs`,
        payload,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Daily log saved", description: "Today's entry was recorded." });
      setForm(EMPTY_FORM);
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "daily-logs"] });
    },
    onError: (e: Error) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    const hasContent =
      form.weather.trim() ||
      form.crew_count.trim() ||
      form.tasks_completed.trim() ||
      form.issues.trim() ||
      form.safety_notes.trim();
    if (!hasContent) {
      toast({ title: "Add at least one field", variant: "destructive" });
      return;
    }
    submitMutation.mutate(form);
  };

  const startMockVoice = () => {
    setVoiceRecording(true);
    setTimeout(() => setVoiceRecording(false), 2500);
  };

  const useMockTranscript = () => {
    setForm({
      weather: "Clear, 68°F",
      crew_count: "8",
      tasks_completed: "Framed 2nd floor partitions\nRoughed in HVAC trunk\nDelivered drywall to 3rd floor",
      issues: "Plumbing inspection rescheduled to Friday",
      safety_notes: "Toolbox talk on ladder safety completed",
    });
    setVoiceOpen(false);
    setVoiceRecording(false);
    toast({
      title: "Transcript loaded",
      description: "Edit the manual form below, then submit.",
    });
  };

  if (!projectId) {
    return (
      <div className="p-6 max-w-3xl mx-auto" data-testid="page-voice-daily-log">
        <div className="space-y-2 mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Voice Daily Log</h1>
          <p className="text-sm text-muted-foreground">
            Capture today's field activity by voice or manual entry.
          </p>
        </div>
        <Card data-testid="empty-no-project">
          <CardContent className="p-10 text-center space-y-3">
            <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium">No project selected</p>
            <p className="text-xs text-muted-foreground">
              Pick a project from the sidebar's <span className="font-semibold">Project Context</span> selector to log field activity.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const logs = logsQuery.data ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" data-testid="page-voice-daily-log">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Voice Daily Log</h1>
          <p className="text-sm text-muted-foreground mt-1" data-testid="text-project-name">
            {displayProjectName} — capture today's field activity.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1" data-testid="badge-today">
          <Clock className="h-3 w-3" />{fmtDate(new Date())}
        </Badge>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-6 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-semibold flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Hands-free capture
            </p>
            <p className="text-xs text-muted-foreground max-w-md">
              Tap to record a voice memo from the field — Herbie transcribes and pre-fills the form below.
            </p>
          </div>
          <Button
            size="lg"
            className="gap-2 h-14 px-6 text-base"
            onClick={() => setVoiceOpen(true)}
            data-testid="button-record-voice-memo"
          >
            <Mic className="h-5 w-5" />
            Record Voice Memo
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" data-testid="form-manual-entry">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="weather" className="flex items-center gap-1.5 text-xs">
                  <CloudSun className="h-3.5 w-3.5 text-sky-500" /> Weather
                </Label>
                <Input
                  id="weather"
                  placeholder="e.g., Clear, 68°F"
                  value={form.weather}
                  onChange={(e) => setForm({ ...form, weather: e.target.value })}
                  data-testid="input-weather"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="crew_count" className="flex items-center gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5 text-blue-500" /> Crew Count
                </Label>
                <Input
                  id="crew_count"
                  type="number"
                  min={0}
                  placeholder="e.g., 8"
                  value={form.crew_count}
                  onChange={(e) => setForm({ ...form, crew_count: e.target.value })}
                  data-testid="input-crew-count"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tasks_completed" className="flex items-center gap-1.5 text-xs">
                <ListChecks className="h-3.5 w-3.5 text-emerald-500" /> Tasks Completed
                <span className="text-muted-foreground">(one per line)</span>
              </Label>
              <Textarea
                id="tasks_completed"
                rows={3}
                placeholder={"Framed 2nd floor partitions\nDelivered drywall to 3rd floor"}
                value={form.tasks_completed}
                onChange={(e) => setForm({ ...form, tasks_completed: e.target.value })}
                data-testid="input-tasks-completed"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="issues" className="flex items-center gap-1.5 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" /> Issues
                </Label>
                <Textarea
                  id="issues"
                  rows={3}
                  placeholder="Anything blocking the schedule?"
                  value={form.issues}
                  onChange={(e) => setForm({ ...form, issues: e.target.value })}
                  data-testid="input-issues"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="safety_notes" className="flex items-center gap-1.5 text-xs">
                  <ShieldAlert className="h-3.5 w-3.5 text-yellow-500" /> Safety Notes
                </Label>
                <Textarea
                  id="safety_notes"
                  rows={3}
                  placeholder="Toolbox talks, near-misses, PPE checks..."
                  value={form.safety_notes}
                  onChange={(e) => setForm({ ...form, safety_notes: e.target.value })}
                  data-testid="input-safety-notes"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setForm(EMPTY_FORM)}
                disabled={submitMutation.isPending}
                data-testid="button-clear-form"
              >
                Clear
              </Button>
              <Button
                type="submit"
                size="sm"
                className="gap-2"
                disabled={submitMutation.isPending}
                data-testid="button-submit-log"
              >
                {submitMutation.isPending
                  ? <RefreshCcw className="h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="h-4 w-4" />}
                {submitMutation.isPending ? "Saving..." : "Save Daily Log"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Recent Logs</CardTitle>
          <Badge variant="outline" className="text-xs" data-testid="badge-log-count">
            {logs.length} {logs.length === 1 ? "entry" : "entries"}
          </Badge>
        </CardHeader>
        <CardContent>
          {logsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
              <RefreshCcw className="h-4 w-4 animate-spin" /> Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center" data-testid="empty-no-logs">
              No daily logs recorded yet for this project.
            </p>
          ) : (
            <ul className="divide-y" data-testid="list-recent-logs">
              {logs.map((log) => (
                <li
                  key={log.id}
                  className="py-3 first:pt-0 last:pb-0 space-y-1.5"
                  data-testid={`row-log-${log.id}`}
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold" data-testid={`text-log-date-${log.id}`}>
                        {fmtDate(log.logDate)}
                      </span>
                      <Badge
                        variant={log.source === "voice" ? "default" : "secondary"}
                        className="text-xs gap-1"
                      >
                        {log.source === "voice" && <Mic className="h-3 w-3" />}
                        {log.source}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{log.status}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">{relTime(log.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                    {weatherText(log.weatherJson) && (
                      <span className="flex items-center gap-1">
                        <CloudSun className="h-3 w-3 text-sky-500" /> {weatherText(log.weatherJson)}
                      </span>
                    )}
                    {crewSum(log.laborJson) > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-blue-500" /> {crewSum(log.laborJson)} crew
                      </span>
                    )}
                    {log.workPerformedJson && log.workPerformedJson.length > 0 && (
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3 w-3 text-emerald-500" /> {log.workPerformedJson.length} tasks
                      </span>
                    )}
                    {log.issuesJson && log.issuesJson.length > 0 && (
                      <span className="flex items-center gap-1 text-red-600">
                        <AlertTriangle className="h-3 w-3" /> {log.issuesJson.length} issue{log.issuesJson.length === 1 ? "" : "s"}
                      </span>
                    )}
                    {log.safetyNotesJson && log.safetyNotesJson.length > 0 && (
                      <span className="flex items-center gap-1 text-yellow-700">
                        <ShieldAlert className="h-3 w-3" /> {log.safetyNotesJson.length} safety note{log.safetyNotesJson.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  {log.workPerformedJson && log.workPerformedJson.length > 0 && (
                    <p className="text-xs text-foreground/80 line-clamp-2 pl-0.5">
                      {log.workPerformedJson.slice(0, 2).join(" • ")}
                      {log.workPerformedJson.length > 2 ? " ..." : ""}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={voiceOpen} onOpenChange={(o) => { setVoiceOpen(o); if (!o) setVoiceRecording(false); }}>
        <DialogContent data-testid="dialog-voice-recorder">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              Record Voice Memo
            </DialogTitle>
            <DialogDescription>
              Live mic capture isn't wired in this build — tap below to simulate a recording.
              Herbie will fill the manual form with a sample transcript.
            </DialogDescription>
          </DialogHeader>
          <div className="py-6 flex flex-col items-center gap-4">
            <button
              type="button"
              onClick={voiceRecording ? () => setVoiceRecording(false) : startMockVoice}
              className={`relative h-28 w-28 rounded-full flex items-center justify-center transition-colors ${
                voiceRecording
                  ? "bg-red-500 text-white"
                  : "bg-primary text-primary-foreground hover-elevate active-elevate-2"
              }`}
              data-testid="button-mic-toggle"
            >
              {voiceRecording ? (
                <>
                  <span className="absolute inset-0 rounded-full bg-red-500/50 animate-ping" />
                  <Square className="h-10 w-10 relative" />
                </>
              ) : (
                <Mic className="h-10 w-10" />
              )}
            </button>
            <p className="text-xs text-muted-foreground" data-testid="text-mic-status">
              {voiceRecording ? "Listening... (simulated)" : "Tap to start"}
            </p>
            <Separator />
            <p className="text-xs text-muted-foreground text-center max-w-sm">
              When real microphone access is wired in, audio will stream to Herbie's transcription pipeline.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setVoiceOpen(false); setVoiceRecording(false); }}
              data-testid="button-cancel-voice"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={useMockTranscript}
              className="gap-2"
              data-testid="button-use-sample-transcript"
            >
              <Sparkles className="h-4 w-4" />
              Use Sample Transcript
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

void queryClient;
