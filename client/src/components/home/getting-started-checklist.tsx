// ============================================================================
// getting-started-checklist.tsx — Collapsible new-user onboarding
// ----------------------------------------------------------------------------
// Only renders when:
//   • localStorage flag `sentinel-onboarding-dismissed` is NOT set, AND
//   • user hasn't completed all steps yet
//
// Steps auto-check based on real data signals (projects exist, daily logs
// exist, etc.) — user doesn't have to manually tick them.
//
// User can dismiss the entire card (stored in localStorage) at any time. The
// "Take a tour" link is the one explicit CTA; everything else just shows
// progress passively.
// ============================================================================

import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Circle,
  X,
  ChevronDown,
  ChevronUp,
  Sparkles,
  ArrowRight,
} from "lucide-react";

const STORAGE_KEY = "sentinel-onboarding-dismissed";
const COLLAPSE_KEY = "sentinel-onboarding-collapsed";

interface Step {
  id: string;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

interface Project { id: string; name?: string; }
interface DailyLog { id: string; }
interface PunchItem { id: string; }

export interface GettingStartedChecklistProps {
  className?: string;
  /** Force-show even if user dismissed (for "reopen tour" link). */
  force?: boolean;
}

export function GettingStartedChecklist({ className = "", force = false }: GettingStartedChecklistProps) {
  const [, navigate] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(STORAGE_KEY) === "1");
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {/* private mode */}
  }, []);

  // Data signals to auto-check steps
  const projects = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      try { const r = await fetch("/api/projects"); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : []); }
      catch { return []; }
    },
    staleTime: 60_000,
  });

  const dailyLogs = useQuery<DailyLog[]>({
    queryKey: ["/api/daily-logs"],
    queryFn: async () => {
      try { const r = await fetch("/api/daily-logs"); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : []); }
      catch { return []; }
    },
    staleTime: 60_000,
  });

  const punchItems = useQuery<PunchItem[]>({
    queryKey: ["/api/punch-items"],
    queryFn: async () => {
      try { const r = await fetch("/api/punch-items"); if (!r.ok) return []; const d = await r.json(); return Array.isArray(d) ? d : (Array.isArray(d?.items) ? d.items : []); }
      catch { return []; }
    },
    staleTime: 60_000,
  });

  const hasProjects = (projects.data?.length ?? 0) > 0;
  const hasDailyLog = (dailyLogs.data?.length ?? 0) > 0;
  const hasPunchItem = (punchItems.data?.length ?? 0) > 0;

  const steps: Step[] = [
    { id: "project", label: "Create your first project", description: "Start tracking RFIs, money, and field activity in one place.", href: "/projects/new", done: hasProjects },
    { id: "team", label: "Invite a team member", description: "Add your PM, super, or admin so they can collaborate.", href: "/team/invite", done: false /* no public endpoint to detect; user can manually check */ },
    { id: "punch", label: "Add a punch item", description: "Try the field workflow — photo, severity, assignee, due date.", href: "/punch-list?new=1", done: hasPunchItem },
    { id: "daily-log", label: "Log a daily", description: "Use voice to capture today's manpower, weather, and deliveries in 30 seconds.", href: "/m-daily-log", done: hasDailyLog },
    { id: "tour", label: "Take a 60-second tour", description: "Walk through Sentinel's core flows — Drawings, Punch, Daily Log, Inbox.", href: "/welcome", done: false },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  // Hide conditions
  if (!force && dismissed) return null;
  if (!force && allDone) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setDismissed(true);
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {}
  };

  return (
    <div
      data-testid="getting-started-checklist"
      className={`relative rounded-2xl ring-1 ring-violet-900/40 bg-violet-950/20 backdrop-blur ${className}`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-violet-950/60 flex items-center justify-center">
            <Sparkles className="h-4.5 w-4.5 text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-zinc-100">Get started with Sentinel</h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {completedCount} of {steps.length} complete — finish in under 5 minutes.
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={toggleCollapse}
                  className="p-1.5 rounded hover:bg-violet-900/40 text-zinc-400"
                  aria-label={collapsed ? "Expand" : "Collapse"}
                  data-testid="onboarding-collapse"
                >
                  {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={dismiss}
                  className="p-1.5 rounded hover:bg-violet-900/40 text-zinc-400"
                  aria-label="Dismiss"
                  data-testid="onboarding-dismiss"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mt-3 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
                style={{ width: `${(completedCount / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

        {!collapsed && (
          <ol className="mt-4 space-y-1.5">
            {steps.map((step) => (
              <li
                key={step.id}
                data-testid={`onboarding-step-${step.id}`}
                data-done={step.done ? "true" : "false"}
                className={`flex items-start gap-3 p-2.5 rounded-lg ${step.done ? "bg-emerald-950/20" : "hover:bg-violet-950/30"} transition cursor-pointer group`}
                onClick={() => navigate(step.href)}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {step.done ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <Circle className="h-5 w-5 text-zinc-600 group-hover:text-violet-400 transition" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${step.done ? "text-emerald-300 line-through" : "text-zinc-100"}`}>
                      {step.label}
                    </span>
                    {!step.done && (
                      <ArrowRight className="h-3.5 w-3.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition" />
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default GettingStartedChecklist;
