import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Check, Trash2, Sparkles, X, FileCheck, FileQuestion, ListChecks, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { MyDayResponse } from "@/pages/home/my-day";

type Reminder = {
  id: string;
  text: string;
  completed: boolean;
  due_date: string | null;
  source: string;
  created_at: string;
};

type AISuggestion = { text: string; due_date?: string };

export default function InsightsRail({
  kpis,
  grid,
  onOpenQueue,
}: {
  kpis: MyDayResponse["kpis"];
  grid: MyDayResponse["grid"];
  onOpenQueue: (type: "submittals" | "rfis" | "tasks") => void;
}) {
  const [newText, setNewText] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const remindersQuery = useQuery({
    queryKey: ["my-day-reminders"],
    queryFn: async () => {
      const res = await fetch("/api/my-day/reminders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<Reminder[]>;
    },
    staleTime: 10_000,
  });

  const suggestMut = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/my-day/ai-suggest", { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<{ suggestions: AISuggestion[] }>;
    },
    onSuccess: () => setShowSuggestions(true),
    onError: () => toast({ title: "AI unavailable", description: "Could not generate suggestions right now.", variant: "destructive" }),
  });

  const addMut = useMutation({
    mutationFn: async (body: { text: string; due_date?: string; source?: string }) => {
      const res = await fetch("/api/my-day/reminders", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      remindersQuery.refetch();
      setNewText("");
    },
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const res = await fetch(`/api/my-day/reminders/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed }),
      });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => remindersQuery.refetch(),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/my-day/reminders/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Failed");
    },
    onSuccess: () => remindersQuery.refetch(),
  });

  const reminders = remindersQuery.data ?? [];
  const activeReminders = reminders.filter((r) => !r.completed);
  const completedReminders = reminders.filter((r) => r.completed);
  const suggestions = suggestMut.data?.suggestions ?? [];

  const queues = [
    { type: "submittals" as const, label: "Submittals", count: kpis.submittals, icon: FileCheck },
    { type: "rfis" as const, label: "RFIs", count: kpis.rfis, icon: FileQuestion },
    { type: "tasks" as const, label: "Tasks", count: (grid.tasks?.length ?? 0), icon: ListChecks },
  ];

  const riskSignals = [
    kpis.atRisk > 0 ? `${kpis.atRisk} items at elevated risk` : null,
    kpis.overdue > 0 ? `${kpis.overdue} overdue items need action` : null,
    kpis.carried > 0 ? `${kpis.carried} carried over from yesterday` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="h-full flex flex-col" data-testid="insights-rail">
      <div className="px-3 pt-3 pb-2">
        <h2 className="text-sm font-semibold">Reminders & Signals</h2>
        <p className="text-xs text-muted-foreground">Personal to-do list and queue status</p>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto">
        <div className="p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold">My Reminders</span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] gap-1"
              onClick={() => suggestMut.mutate()}
              disabled={suggestMut.isPending}
              data-testid="button-ai-suggest"
            >
              <Sparkles className="w-3 h-3" />
              {suggestMut.isPending ? "Thinking..." : "AI Suggest"}
            </Button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newText.trim()) addMut.mutate({ text: newText.trim() });
            }}
            className="flex gap-1.5 mb-2"
          >
            <Input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="Add a reminder..."
              className="h-8 text-sm"
              data-testid="input-new-reminder"
            />
            <Button type="submit" size="icon" variant="default" disabled={!newText.trim() || addMut.isPending} className="h-8 w-8 shrink-0" data-testid="button-add-reminder">
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </form>

          {showSuggestions && suggestions.length > 0 && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-2 mb-2 space-y-1" data-testid="ai-suggestions-panel">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-medium text-primary flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> HERBIE Suggestions
                </span>
                <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setShowSuggestions(false)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-1.5 text-xs" data-testid={`ai-suggestion-${i}`}>
                  <span className="truncate flex-1">{s.text}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 text-[10px] shrink-0"
                    onClick={() => {
                      addMut.mutate({ text: s.text, due_date: s.due_date, source: "ai" });
                      const remaining = suggestions.filter((_, j) => j !== i);
                      if (remaining.length === 0) setShowSuggestions(false);
                    }}
                    data-testid={`button-accept-suggestion-${i}`}
                  >
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          {remindersQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <div className="space-y-0.5">
              {activeReminders.map((r) => (
                <div key={r.id} className="flex items-center gap-1.5 group rounded px-1 py-1 hover:bg-muted/30" data-testid={`reminder-${r.id}`}>
                  <button
                    onClick={() => toggleMut.mutate({ id: r.id, completed: true })}
                    className="w-4 h-4 shrink-0 rounded-sm border border-muted-foreground/40 hover:border-primary flex items-center justify-center"
                    data-testid={`button-complete-reminder-${r.id}`}
                  >
                    <span className="sr-only">Complete</span>
                  </button>
                  <span className="text-xs flex-1 truncate">{r.text}</span>
                  {r.source === "ai" && <Sparkles className="w-2.5 h-2.5 text-primary shrink-0" />}
                  <button
                    onClick={() => deleteMut.mutate(r.id)}
                    className="invisible group-hover:visible shrink-0"
                    data-testid={`button-delete-reminder-${r.id}`}
                  >
                    <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                  </button>
                </div>
              ))}
              {completedReminders.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[11px] text-muted-foreground cursor-pointer">
                    {completedReminders.length} completed
                  </summary>
                  <div className="mt-1 space-y-0.5">
                    {completedReminders.map((r) => (
                      <div key={r.id} className="flex items-center gap-1.5 group rounded px-1 py-1" data-testid={`reminder-done-${r.id}`}>
                        <button
                          onClick={() => toggleMut.mutate({ id: r.id, completed: false })}
                          className="w-4 h-4 shrink-0 rounded-sm border border-primary bg-primary/20 flex items-center justify-center"
                        >
                          <Check className="w-2.5 h-2.5 text-primary" />
                        </button>
                        <span className="text-xs flex-1 truncate line-through text-muted-foreground">{r.text}</span>
                        <button onClick={() => deleteMut.mutate(r.id)} className="invisible group-hover:visible shrink-0">
                          <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {activeReminders.length === 0 && completedReminders.length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">No reminders yet. Add one or ask HERBIE to suggest.</p>
              )}
            </div>
          )}
        </div>

        <Separator />

        <div className="p-3">
          <span className="text-xs font-semibold mb-2 block">Queue Status</span>
          <div className="space-y-0.5">
            {queues.map((q) => (
              <button
                key={q.type}
                onClick={() => onOpenQueue(q.type)}
                data-testid={`queue-row-${q.type}`}
                className="w-full text-left rounded-md px-2 py-1.5 hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <q.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium">{q.label}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{q.count}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>

        {riskSignals.length > 0 && (
          <>
            <Separator />
            <div className="p-3">
              <span className="text-xs font-semibold mb-2 block">Risk Signals</span>
              <div className="space-y-1">
                {riskSignals.map((s, i) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs" data-testid={`risk-signal-${i}`}>
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-amber-500" />
                    <span className="text-muted-foreground">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
