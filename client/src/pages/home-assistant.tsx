import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Stamp,
  FileQuestion,
  ListChecks,
  FileCheck,
  ChevronRight,
  FolderGit2,
  Clock,
} from "lucide-react";
import type { NavCounts } from "@/nav/navConfig";

function greetingText() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(v: number | null | undefined) {
  if (v == null) return "--";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function statusColor(s: string | null | undefined): string {
  if (!s) return "text-zinc-500";
  const low = s.toLowerCase();
  if (low === "active" || low === "in_progress") return "text-emerald-400";
  if (low === "on_hold" || low === "paused") return "text-amber-400";
  if (low === "completed" || low === "closed") return "text-sky-400";
  return "text-zinc-400";
}

function relativeTime(d: string | null | undefined) {
  if (!d) return "";
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type ActionBox = {
  label: string;
  countKey: keyof NavCounts;
  icon: typeof Stamp;
  route: string;
  accentClass: string;
};

const ACTION_BOXES: ActionBox[] = [
  { label: "Approvals Needed", countKey: "approvalsNeededCount", icon: Stamp, route: "/approvals", accentClass: "border-l-amber-500" },
  { label: "Open RFIs", countKey: "openRfiCount", icon: FileQuestion, route: "/execution/rfis", accentClass: "border-l-sky-500" },
  { label: "Overdue Tasks", countKey: "overdueTaskCount", icon: ListChecks, route: "/execution/tasks", accentClass: "border-l-red-500" },
  { label: "Pending Submittals", countKey: "pendingSubmittalCount", icon: FileCheck, route: "/execution/submittals", accentClass: "border-l-violet-500" },
];

export default function HomeAssistant() {
  const [, setLocation] = useLocation();

  const countsQuery = useQuery<NavCounts>({ queryKey: ["/api/nav-counts"] });
  const projectsQuery = useQuery<any[]>({ queryKey: ["/api/projects"] });
  const activityQuery = useQuery<any[]>({ queryKey: ["/api/audit-events", { limit: 10 }] });

  const counts = countsQuery.data;
  const projects = (projectsQuery.data ?? []).slice(0, 10);
  const events = (activityQuery.data ?? []).slice(0, 10);

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-8" data-testid="home-page">
      <div className="flex items-baseline justify-between" data-testid="greeting-bar">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-greeting">
          {greetingText()}
        </h1>
        <span className="text-sm text-zinc-500 font-mono" data-testid="text-date">{formatDate()}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" data-testid="action-strip">
        {ACTION_BOXES.map((box) => {
          const Icon = box.icon;
          const count = counts?.[box.countKey] ?? 0;
          return (
            <button
              key={box.countKey}
              onClick={() => setLocation(box.route)}
              className={`text-left border border-white/10 bg-black/20 border-l-4 ${box.accentClass} p-4 hover:bg-white/5 transition-colors`}
              data-testid={`action-box-${box.countKey}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-zinc-400" />
                <span className="text-xs text-zinc-400 uppercase tracking-wider">{box.label}</span>
              </div>
              <span className="text-3xl font-mono font-bold" data-testid={`count-${box.countKey}`}>
                {countsQuery.isLoading ? "--" : count}
              </span>
            </button>
          );
        })}
      </div>

      <div data-testid="projects-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderGit2 className="h-5 w-5 text-zinc-400" />
            My Projects
          </h2>
          <button
            onClick={() => setLocation("/projects/active")}
            className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 transition-colors"
            data-testid="link-view-all-projects"
          >
            View All <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        <div className="border border-white/10 bg-black/20 overflow-hidden">
          <table className="w-full text-sm" data-testid="projects-table">
            <thead>
              <tr className="border-b border-white/10 text-zinc-500 text-xs uppercase tracking-wider">
                <th className="text-left py-2 px-4">Project</th>
                <th className="text-left py-2 px-4 hidden md:table-cell">Status</th>
                <th className="text-right py-2 px-4 hidden md:table-cell">Contract Value</th>
                <th className="text-right py-2 px-4 hidden lg:table-cell">Completion</th>
                <th className="text-right py-2 px-4 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {projectsQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-white/5">
                    <td className="py-3 px-4"><div className="h-4 w-48 bg-zinc-800 animate-pulse" /></td>
                    <td className="py-3 px-4 hidden md:table-cell"><div className="h-4 w-16 bg-zinc-800 animate-pulse" /></td>
                    <td className="py-3 px-4 hidden md:table-cell"><div className="h-4 w-20 bg-zinc-800 animate-pulse ml-auto" /></td>
                    <td className="py-3 px-4 hidden lg:table-cell"><div className="h-4 w-12 bg-zinc-800 animate-pulse ml-auto" /></td>
                    <td className="py-3 px-4"></td>
                  </tr>
                ))
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">No active projects</td>
                </tr>
              ) : (
                projects.map((p: any) => (
                  <tr
                    key={p.id}
                    onClick={() => setLocation(`/projects/${encodeURIComponent(String(p.id))}/cockpit`)}
                    className="border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors"
                    data-testid={`project-row-${p.id}`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-medium" data-testid={`project-name-${p.id}`}>{p.name || p.projectName}</div>
                      {p.projectNumber && (
                        <div className="text-xs text-zinc-500 font-mono">{p.projectNumber}</div>
                      )}
                    </td>
                    <td className={`py-3 px-4 hidden md:table-cell text-xs font-medium uppercase ${statusColor(p.status)}`} data-testid={`project-status-${p.id}`}>
                      {p.status || "--"}
                    </td>
                    <td className="py-3 px-4 hidden md:table-cell text-right font-mono text-zinc-300" data-testid={`project-value-${p.id}`}>
                      {formatCurrency(p.contractValue)}
                    </td>
                    <td className="py-3 px-4 hidden lg:table-cell text-right font-mono text-zinc-300" data-testid={`project-completion-${p.id}`}>
                      {p.completionPercentage != null ? `${p.completionPercentage}%` : "--"}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <ChevronRight className="h-4 w-4 text-zinc-600 inline-block" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div data-testid="activity-section">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Clock className="h-5 w-5 text-zinc-400" />
            Recent Activity
          </h2>
        </div>

        <div className="border border-white/10 bg-black/20 divide-y divide-white/5">
          {activityQuery.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="py-3 px-4 flex items-center gap-3">
                <div className="h-3 w-16 bg-zinc-800 animate-pulse" />
                <div className="h-3 w-64 bg-zinc-800 animate-pulse" />
              </div>
            ))
          ) : events.length === 0 ? (
            <div className="py-8 text-center text-zinc-500">No recent activity</div>
          ) : (
            events.map((ev: any, i: number) => (
              <div key={ev.id ?? i} className="py-2.5 px-4 flex items-start gap-3 text-sm" data-testid={`activity-row-${i}`}>
                <span className="text-zinc-600 font-mono text-xs whitespace-nowrap pt-0.5" data-testid={`activity-time-${i}`}>
                  {relativeTime(ev.createdAt ?? ev.timestamp)}
                </span>
                <span className="text-zinc-300" data-testid={`activity-text-${i}`}>
                  <span className="text-zinc-500">{ev.actor || ev.performedBy || "system"}</span>
                  {" "}
                  {ev.eventType || ev.action || "activity"}
                  {ev.entityType ? ` on ${ev.entityType}` : ""}
                  {ev.details || ev.description ? ` — ${ev.details || ev.description}` : ""}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}