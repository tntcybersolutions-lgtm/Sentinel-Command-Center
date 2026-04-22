import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FileQuestion, FileCheck, ArrowLeftRight, ClipboardList, ListChecks, Bot,
  Loader2, Play, ChevronDown, ChevronRight, AlertTriangle, Clock, CheckCircle2,
  XCircle, ArrowUp, ArrowRight, Minus,
} from "lucide-react";

type TabId = "rfis" | "submittals" | "change-orders" | "daily-logs" | "tasks" | "agent-reports";

const TABS: { id: TabId; label: string; icon: typeof FileQuestion }[] = [
  { id: "rfis", label: "RFIs", icon: FileQuestion },
  { id: "submittals", label: "Submittals", icon: FileCheck },
  { id: "change-orders", label: "Change Orders", icon: ArrowLeftRight },
  { id: "daily-logs", label: "Daily Reports", icon: ClipboardList },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "agent-reports", label: "Agent Reports", icon: Bot },
];

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysSince(d: string | Date | null | undefined): number {
  if (!d) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)));
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "text-amber-400 border-amber-400/30",
    submitted: "text-blue-400 border-blue-400/30",
    approved: "text-emerald-400 border-emerald-400/30",
    rejected: "text-red-400 border-red-400/30",
    closed: "text-zinc-400 border-zinc-400/30",
    pending: "text-amber-400 border-amber-400/30",
    draft: "text-zinc-500 border-zinc-500/30",
    not_started: "text-zinc-400 border-zinc-400/30",
    in_progress: "text-blue-400 border-blue-400/30",
    completed: "text-emerald-400 border-emerald-400/30",
    voided: "text-zinc-600 border-zinc-600/30",
    success: "text-emerald-400 border-emerald-400/30",
  };
  const c = colors[status] || "text-zinc-400 border-zinc-400/30";
  return (
    <span data-testid={`status-${status}`} className={`px-2 py-0.5 text-xs font-mono border ${c} bg-black/30`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </span>
  );
}

function PriorityIcon({ priority }: { priority: string | null | undefined }) {
  if (priority === "urgent" || priority === "critical") return <ArrowUp className="w-3.5 h-3.5 text-red-400" />;
  if (priority === "high") return <ArrowUp className="w-3.5 h-3.5 text-amber-400" />;
  if (priority === "normal" || priority === "medium") return <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />;
  return <Minus className="w-3.5 h-3.5 text-zinc-600" />;
}

function CountBadge({ label, count, accent }: { label: string; count: number; accent?: string }) {
  return (
    <div data-testid={`count-${label.toLowerCase().replace(/\s/g, "-")}`} className="border border-white/10 bg-black/30 px-4 py-2 flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">{label}</span>
      <span className={`text-xl font-mono font-bold ${accent || "text-white"}`}>{count}</span>
    </div>
  );
}

function RFIsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "rfis"], queryFn: () => fetch(`/api/projects/${projectId}/rfis`).then(r => r.json()) });
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No RFIs found for this project" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-rfis">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono">
            <th className="py-2 px-3">#</th>
            <th className="py-2 px-3">Subject</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Priority</th>
            <th className="py-2 px-3">Age</th>
            <th className="py-2 px-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} data-testid={`row-rfi-${r.id}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3 font-mono text-zinc-300">{r.rfiNumber || r.rfi_number}</td>
              <td className="py-2 px-3 text-white max-w-[300px] truncate">{r.subject}</td>
              <td className="py-2 px-3"><StatusPill status={r.status} /></td>
              <td className="py-2 px-3"><PriorityIcon priority={r.priority} /></td>
              <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{daysSince(r.createdAt || r.created_at)}d</td>
              <td className="py-2 px-3 text-zinc-500 text-xs">{formatDate(r.createdAt || r.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubmittalsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "submittals"], queryFn: () => fetch(`/api/projects/${projectId}/submittals`).then(r => r.json()) });
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No submittals found for this project" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-submittals">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono">
            <th className="py-2 px-3">#</th>
            <th className="py-2 px-3">Name</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Rev</th>
            <th className="py-2 px-3">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} data-testid={`row-submittal-${r.id}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3 font-mono text-zinc-300">{r.submittalNumber || r.submittal_number}</td>
              <td className="py-2 px-3 text-white max-w-[300px] truncate">{r.name}</td>
              <td className="py-2 px-3"><StatusPill status={r.status} /></td>
              <td className="py-2 px-3 font-mono text-zinc-400">v{r.revision ?? 0}</td>
              <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{daysSince(r.createdAt || r.created_at)}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChangeOrdersTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "change-orders"], queryFn: () => fetch(`/api/projects/${projectId}/change-orders`).then(r => r.json()) });
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No change orders found for this project" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-change-orders">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono">
            <th className="py-2 px-3">#</th>
            <th className="py-2 px-3">Title</th>
            <th className="py-2 px-3">Type</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Amount</th>
            <th className="py-2 px-3">Days Pending</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} data-testid={`row-co-${r.id}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3 font-mono text-zinc-300">{r.coNumber || r.co_number}</td>
              <td className="py-2 px-3 text-white max-w-[250px] truncate">{r.title}</td>
              <td className="py-2 px-3 text-zinc-400 text-xs">{(r.changeType || r.change_type || "").replace(/_/g, " ")}</td>
              <td className="py-2 px-3"><StatusPill status={r.status} /></td>
              <td className="py-2 px-3 font-mono text-emerald-400">{r.amount ? `$${Number(r.amount).toLocaleString()}` : "—"}</td>
              <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{daysSince(r.submittedAt || r.submitted_at || r.createdAt || r.created_at)}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyLogsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "daily-logs"], queryFn: () => fetch(`/api/projects/${projectId}/daily-logs`).then(r => r.json()) });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No daily logs found for this project" />;

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-1" data-testid="list-daily-logs">
      {rows.map((log: any) => {
        const id = log.id;
        const isOpen = expanded.has(id);
        const weather = log.weatherJson || log.weather_json;
        const work = log.workPerformedJson || log.work_performed_json;
        const labor = log.laborJson || log.labor_json;
        const issues = log.issuesJson || log.issues_json;
        return (
          <div key={id} data-testid={`card-log-${id}`} className="border border-white/10 bg-black/20">
            <button
              data-testid={`btn-expand-log-${id}`}
              onClick={() => toggle(id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                <span className="text-white font-mono text-sm">{formatDate(log.logDate || log.log_date)}</span>
                {weather && <span className="text-zinc-500 text-xs">{weather.conditions} · {weather.temp}°F</span>}
              </div>
              <StatusPill status={log.status} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                {weather && (
                  <div className="border-l-2 border-blue-500/50 pl-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono block">Weather</span>
                    <span className="text-zinc-300 text-sm">{weather.conditions} · {weather.temp}°F · Wind: {weather.wind} · Humidity: {weather.humidity}%</span>
                  </div>
                )}
                {work && Array.isArray(work) && work.length > 0 && (
                  <div className="border-l-2 border-emerald-500/50 pl-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono block">Work Performed</span>
                    <ul className="text-zinc-300 text-sm space-y-0.5">
                      {work.map((w: string, i: number) => <li key={i}>• {w}</li>)}
                    </ul>
                  </div>
                )}
                {labor && (
                  <div className="border-l-2 border-amber-500/50 pl-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono block">Labor</span>
                    <span className="text-zinc-300 text-sm">
                      {labor.crews} crews · {labor.trades?.join(", ")} · {labor.totalHours}h total
                      {labor.overtimeHours > 0 && <span className="text-amber-400"> ({labor.overtimeHours}h OT)</span>}
                    </span>
                  </div>
                )}
                {issues && Array.isArray(issues) && issues.length > 0 && (
                  <div className="border-l-2 border-red-500/50 pl-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono block">Issues</span>
                    <ul className="text-red-300 text-sm space-y-0.5">
                      {issues.map((issue: string, i: number) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{issue}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TasksTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "tasks"], queryFn: () => fetch(`/api/projects/${projectId}/tasks`).then(r => r.json()) });
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No tasks found for this project" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-tasks">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono">
            <th className="py-2 px-3">Name</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Priority</th>
            <th className="py-2 px-3">Source</th>
            <th className="py-2 px-3">Due Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t: any) => (
            <tr key={t.id} data-testid={`row-task-${t.id}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3 text-white max-w-[350px] truncate">{t.name}</td>
              <td className="py-2 px-3"><StatusPill status={t.status} /></td>
              <td className="py-2 px-3"><PriorityIcon priority={t.priority} /></td>
              <td className="py-2 px-3">
                <span className={`px-1.5 py-0.5 text-[10px] font-mono border ${t.source === "monitor" ? "text-cyan-400 border-cyan-400/30" : "text-zinc-500 border-zinc-500/30"}`}>
                  {t.source || "manual"}
                </span>
              </td>
              <td className="py-2 px-3 text-zinc-500 text-xs">{formatDate(t.dueDate || t.due_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentReportsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "agent-reports"], queryFn: () => fetch(`/api/projects/${projectId}/agent-reports`).then(r => r.json()) });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No agent reports yet — run an agent to generate one" />;

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-1" data-testid="list-agent-reports">
      {rows.map((r: any) => {
        const isOpen = expanded.has(r.id);
        return (
          <div key={r.id} data-testid={`card-report-${r.id}`} className="border border-white/10 bg-black/20">
            <button
              data-testid={`btn-expand-report-${r.id}`}
              onClick={() => toggle(r.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                <Bot className="w-4 h-4 text-cyan-400" />
                <span className="text-white text-sm font-mono">{r.agentName || r.agent_name}</span>
                <span className="text-zinc-500 text-xs">{formatDate(r.createdAt || r.created_at)}</span>
                {r.durationMs && <span className="text-zinc-600 text-[10px] font-mono">{r.durationMs}ms</span>}
              </div>
              <StatusPill status={r.status} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3">
                {r.description && <p className="text-zinc-400 text-sm mb-3">{r.description}</p>}
                <pre className="text-zinc-300 text-xs font-mono bg-black/40 border border-white/5 p-3 overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(r.outputJson || r.output_json, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12 text-zinc-500" data-testid="loading-state">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-sm font-mono">Loading...</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-zinc-600" data-testid="empty-state">
      <span className="text-sm">{label}</span>
    </div>
  );
}

export default function ProjectCockpit() {
  const [, params] = useRoute("/projects/:id/cockpit");
  const projectId = params?.id || "";
  const [activeTab, setActiveTab] = useState<TabId>("rfis");

  const { data: cockpit, isLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "cockpit"],
    queryFn: () => fetch(`/api/projects/${projectId}/cockpit`).then(r => r.json()),
    enabled: !!projectId,
  });

  const runAgent = useMutation({
    mutationFn: async (agent: string) => {
      const resp = await apiRequest("POST", "/api/agents/run", { agent, projectId });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "agent-reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "cockpit"] });
      setActiveTab("agent-reports");
    },
  });

  if (!projectId) {
    return <div className="p-8 text-zinc-500">No project selected</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const project = cockpit?.project;
  const counts = cockpit?.counts || {};

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" data-testid="project-cockpit">
      <div className="border-b border-white/10 bg-black/40 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-mono font-bold text-white" data-testid="text-project-name">
                {project?.name || "Project Cockpit"}
              </h1>
              {project?.status && <StatusPill status={project.status} />}
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
              {project?.projectNumber && <span data-testid="text-project-number">#{project.projectNumber}</span>}
              {project?.clientName && <span data-testid="text-client">{project.clientName}</span>}
              {project?.contractValue && <span data-testid="text-contract-value">${Number(project.contractValue).toLocaleString()}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="btn-run-pm-agent"
              onClick={() => runAgent.mutate("pm")}
              disabled={runAgent.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
            >
              {runAgent.isPending && runAgent.variables === "pm" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Run PM Agent
            </button>
            <button
              data-testid="btn-run-fieldops-agent"
              onClick={() => runAgent.mutate("fieldops")}
              disabled={runAgent.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
            >
              {runAgent.isPending && runAgent.variables === "fieldops" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Run Field Ops
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-3 flex gap-2 flex-wrap border-b border-white/5">
        <CountBadge label="RFIs" count={counts.rfis || 0} accent={counts.openRfis > 0 ? "text-amber-400" : undefined} />
        <CountBadge label="Open RFIs" count={counts.openRfis || 0} accent="text-amber-400" />
        <CountBadge label="Submittals" count={counts.submittals || 0} />
        <CountBadge label="Change Orders" count={counts.changeOrders || 0} />
        <CountBadge label="Pending COs" count={counts.pendingCOs || 0} accent={counts.pendingCOs > 0 ? "text-red-400" : undefined} />
        <CountBadge label="Daily Logs" count={counts.dailyLogs || 0} />
        <CountBadge label="Tasks" count={counts.tasks || 0} />
        <CountBadge label="Open Tasks" count={counts.openTasks || 0} accent={counts.openTasks > 0 ? "text-amber-400" : undefined} />
        <CountBadge label="Agent Reports" count={counts.agentReports || 0} accent="text-cyan-400" />
      </div>

      <div className="border-b border-white/10 px-6 flex gap-0">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-mono transition-colors border-b-2 ${
                isActive
                  ? "border-cyan-400 text-cyan-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="px-6 py-4">
        {activeTab === "rfis" && <RFIsTab projectId={projectId} />}
        {activeTab === "submittals" && <SubmittalsTab projectId={projectId} />}
        {activeTab === "change-orders" && <ChangeOrdersTab projectId={projectId} />}
        {activeTab === "daily-logs" && <DailyLogsTab projectId={projectId} />}
        {activeTab === "tasks" && <TasksTab projectId={projectId} />}
        {activeTab === "agent-reports" && <AgentReportsTab projectId={projectId} />}
      </div>
    </div>
  );
}
