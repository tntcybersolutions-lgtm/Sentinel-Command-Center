import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Clock, Layers } from "lucide-react";
import type { MyDayResponse, WorkItem } from "@/pages/home/my-day";

function humanDue(item: WorkItem): string {
  const due = item.dueTs ?? item.due_ts;
  if (!due) return "";
  const d = new Date(due);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -1) return `Overdue ${Math.abs(diffDays)}d`;
  if (diffDays === -1) return "Overdue 1d";
  if (diffDays === 0) return "Due today";
  if (diffDays === 1) return "Due tomorrow";
  if (diffDays <= 7) return `Due in ${diffDays}d`;
  return `Due ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
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

export default function ActionRail({
  engine,
  onOpenItem,
}: {
  engine: MyDayResponse["engine"];
  onOpenItem: (id: string) => void;
}) {
  const urgent = engine.critical ?? [];
  const dueSoon = engine.strategic ?? [];
  const onDeck = engine.routine?.slice(0, 8) ?? [];

  const sections = [
    {
      id: "urgent",
      label: "Urgent",
      description: "Overdue, critical risk, or blocking other work",
      icon: AlertTriangle,
      items: urgent,
      iconColor: "text-destructive",
    },
    {
      id: "due-soon",
      label: "Due Soon",
      description: "Approaching deadlines this week",
      icon: Clock,
      items: dueSoon,
      iconColor: "text-amber-500",
    },
    {
      id: "on-deck",
      label: "On Deck",
      description: "Lower priority — will surface when ready",
      icon: Layers,
      items: onDeck,
      iconColor: "text-muted-foreground",
    },
  ];

  return (
    <div className="h-full flex flex-col" data-testid="action-rail">
      <div className="px-3 pt-3 pb-2">
        <h2 className="text-sm font-semibold">Priority Queue</h2>
        <p className="text-xs text-muted-foreground">AI-scored and ranked by urgency</p>
      </div>

      <Separator />

      <div className="flex-1 overflow-y-auto">
        {sections.map((section, si) => (
          <div key={section.id} data-testid={`section-${section.id}`}>
            {si > 0 && <Separator />}
            <div className="px-3 pt-3 pb-1 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <section.icon className={`w-3.5 h-3.5 shrink-0 ${section.iconColor}`} />
                <span className="text-xs font-semibold">{section.label}</span>
                <span className="text-[11px] text-muted-foreground truncate">{section.description}</span>
              </div>
              <Badge variant="secondary" className="text-[10px] shrink-0">{section.items.length}</Badge>
            </div>

            <div className="px-2 pb-2 space-y-0.5">
              {section.items.length === 0 ? (
                <div className="px-2 py-3 text-xs text-muted-foreground italic">Nothing here right now</div>
              ) : (
                section.items.map((item) => {
                  const band = item.priority_band ?? "routine";
                  const dueText = humanDue(item);
                  const isOverdue = dueText.startsWith("Overdue");

                  return (
                    <button
                      key={item.id}
                      onClick={() => onOpenItem(item.id)}
                      data-testid={`item-row-${item.id}`}
                      className="w-full text-left rounded-md px-2 py-2 hover-elevate active-elevate-2 focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{item.title}</div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            {item.project && (
                              <span className="text-[11px] text-muted-foreground truncate max-w-[120px]">{item.project}</span>
                            )}
                            {dueText && (
                              <span className={`text-[11px] ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                                {dueText}
                              </span>
                            )}
                          </div>
                        </div>
                        <Badge variant={bandColor(band)} className="text-[10px] shrink-0">
                          {bandLabel(band)}
                        </Badge>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
