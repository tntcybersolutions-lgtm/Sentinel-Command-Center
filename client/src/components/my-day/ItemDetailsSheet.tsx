import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import { Bot, CheckCircle, Clock, Send, Pencil, X, ArrowUp } from "lucide-react";
import type { WorkItem } from "@/pages/home/my-day";

type Props = {
  open: boolean;
  item: WorkItem | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
};

async function postAction(itemId: string, action: string) {
  const res = await fetch(`/api/items/${itemId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function patchItem(itemId: string, payload: any) {
  const res = await fetch(`/api/items/${itemId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function bandColor(band: string) {
  if (band === "critical") return "destructive" as const;
  if (band === "strategic") return "default" as const;
  return "secondary" as const;
}

function bandLabel(band: string) {
  if (band === "critical") return "CRITICAL";
  if (band === "strategic") return "HIGH";
  return "NORMAL";
}

function humanDue(due: string): string {
  if (!due) return "No due date";
  const d = new Date(due);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays < -1) return `Overdue ${Math.abs(diffDays)} days`;
  if (diffDays === -1) return "Overdue 1 day";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  return `Due in ${diffDays} days`;
}

export default function ItemDetailsSheet({ open, item, onOpenChange, onChanged }: Props) {
  const [editing, setEditing] = useState(false);

  const normalized = useMemo(() => {
    if (!item) return null;
    return {
      ...item,
      due: item.dueTs ?? item.due_ts ?? "",
      last: item.lastActivityTs ?? item.last_activity_ts ?? "",
      assigned: item.assignedTo ?? item.assigned_to ?? "",
      band: item.priority_band ?? "routine",
      score: item.priority_score ?? 0,
    };
  }, [item]);

  const [draft, setDraft] = useState({
    title: normalized?.title ?? "",
    status: normalized?.status ?? "open",
    project: normalized?.project ?? "",
    due: normalized?.due ?? "",
    assigned: normalized?.assigned ?? "",
  });

  useEffect(() => {
    if (!normalized) return;
    setDraft({
      title: normalized.title,
      status: normalized.status,
      project: normalized.project ?? "",
      due: normalized.due ?? "",
      assigned: normalized.assigned ?? "",
    });
    setEditing(false);
  }, [normalized?.id]);

  const explainQuery = useQuery({
    queryKey: ["explain-priority", item?.id],
    queryFn: async () => {
      if (!item) return null;
      const res = await fetch("/api/my-day/explain-priority", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ item }),
      });
      if (!res.ok) return null;
      return res.json() as Promise<{ explanation: string }>;
    },
    enabled: open && !!item,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const actionMut = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) => postAction(id, action),
    onSuccess: () => {
      onChanged();
      toast({ title: "Updated", description: "Action applied." });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Action failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const saveMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) => patchItem(id, payload),
    onSuccess: () => {
      onChanged();
      toast({ title: "Saved", description: "Changes saved." });
      setEditing(false);
    },
    onError: (e: any) => toast({ title: "Save failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const dueLabel = normalized?.due ? humanDue(normalized.due) : "No due date";
  const isOverdue = dueLabel.startsWith("Overdue");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[480px] sm:w-[480px] flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-3">
            <span className="truncate text-base">{normalized?.title ?? "Item"}</span>
            {normalized && (
              <Badge variant={bandColor(normalized.band)} className="shrink-0">
                {bandLabel(normalized.band)}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        {!normalized ? (
          <div className="text-sm text-muted-foreground p-4">Select an item to view details.</div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-4 pt-2">
            <div className="rounded-md border bg-muted/30 p-3" data-testid="ai-priority-explanation">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold text-primary">HERBIE Priority Analysis</span>
              </div>
              {explainQuery.isLoading ? (
                <div className="space-y-1.5">
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-4/5" />
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-foreground/85" data-testid="text-priority-explanation">
                  {explainQuery.data?.explanation || "Analysis unavailable. Refresh to retry."}
                </p>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3 text-center" data-testid="text-score-breakdown">
              <div className="rounded-md border p-2">
                <div className="text-[10px] text-muted-foreground">Score</div>
                <div className="text-sm font-semibold">{normalized.score}</div>
              </div>
              <div className="rounded-md border p-2">
                <div className="text-[10px] text-muted-foreground">Type</div>
                <div className="text-sm font-semibold capitalize">{normalized.type}</div>
              </div>
              <div className={`rounded-md border p-2 ${isOverdue ? "border-destructive/30 bg-destructive/5" : ""}`}>
                <div className="text-[10px] text-muted-foreground">Deadline</div>
                <div className={`text-xs font-medium ${isOverdue ? "text-destructive" : ""}`}>{dueLabel}</div>
              </div>
            </div>

            <Separator />

            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Title</Label>
                <Input disabled={!editing} value={draft.title} onChange={(e) => setDraft((s) => ({ ...s, title: e.target.value }))} data-testid="input-item-title" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Status</Label>
                  <Input disabled={!editing} value={draft.status} onChange={(e) => setDraft((s) => ({ ...s, status: e.target.value }))} data-testid="input-item-status" />
                </div>
                <div>
                  <Label className="text-xs">Project</Label>
                  <Input disabled={!editing} value={draft.project} onChange={(e) => setDraft((s) => ({ ...s, project: e.target.value }))} data-testid="input-item-project" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Due Date</Label>
                  <Input disabled={!editing} type="date" value={draft.due ? draft.due.split("T")[0] : ""} onChange={(e) => setDraft((s) => ({ ...s, due: e.target.value }))} data-testid="input-item-due" />
                </div>
                <div>
                  <Label className="text-xs">Assigned To</Label>
                  <Input disabled={!editing} value={draft.assigned} onChange={(e) => setDraft((s) => ({ ...s, assigned: e.target.value }))} data-testid="input-item-assigned" />
                </div>
              </div>
            </div>

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                onClick={() => actionMut.mutate({ id: normalized.id, action: "complete" })}
                disabled={actionMut.isPending}
                className="gap-1"
                data-testid="button-complete"
              >
                <CheckCircle className="w-3.5 h-3.5" /> Complete
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => actionMut.mutate({ id: normalized.id, action: "snooze_1d" })}
                disabled={actionMut.isPending}
                className="gap-1"
                data-testid="button-snooze"
              >
                <Clock className="w-3.5 h-3.5" /> Snooze 1 day
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast({ title: "Delegate", description: "Assign + notify workflow coming soon." })}
                className="gap-1"
                data-testid="button-delegate"
              >
                <Send className="w-3.5 h-3.5" /> Delegate
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => toast({ title: "Escalate", description: "Escalation workflow coming soon." })}
                className="gap-1"
                data-testid="button-escalate"
              >
                <ArrowUp className="w-3.5 h-3.5" /> Escalate
              </Button>

              <div className="flex-1" />

              {!editing ? (
                <Button size="sm" variant="secondary" onClick={() => setEditing(true)} className="gap-1" data-testid="button-edit">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={() =>
                      saveMut.mutate({
                        id: normalized.id,
                        payload: {
                          title: draft.title,
                          status: draft.status,
                          project: draft.project || null,
                          due_ts: draft.due || null,
                          assigned_to: draft.assigned || null,
                        },
                      })
                    }
                    disabled={saveMut.isPending}
                    data-testid="button-save"
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} data-testid="button-cancel-edit">
                    <X className="w-3.5 h-3.5" /> Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
