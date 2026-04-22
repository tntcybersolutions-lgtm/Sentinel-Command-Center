import { useMutation } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import type { CalendarEvent } from "@/pages/home/my-day";

async function respondEvent(eventId: string, response: "accepted" | "tentative" | "declined") {
  const res = await fetch(`/api/events/${eventId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ response }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function getTs(e: CalendarEvent, key: "start" | "end") {
  return (key === "start" ? (e.startTs ?? e.start_ts) : (e.endTs ?? e.end_ts)) ?? "";
}

export default function EventDetailsSheet({
  open,
  event,
  onOpenChange,
  onChanged,
}: {
  open: boolean;
  event: CalendarEvent | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const mut = useMutation({
    mutationFn: ({ id, response }: { id: string; response: "accepted" | "tentative" | "declined" }) => respondEvent(id, response),
    onSuccess: () => {
      onChanged();
      toast({ title: "Updated", description: "Calendar response recorded." });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Failed", description: String(e?.message || e), variant: "destructive" }),
  });

  const status = (event?.responseStatus ?? event?.response_status ?? "none").toUpperCase();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] sm:w-[520px]">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-3">
            <span className="truncate">{event?.title ?? "Event"}</span>
            <Badge variant="secondary">{status}</Badge>
          </SheetTitle>
        </SheetHeader>

        <Separator className="my-4" />

        {!event ? (
          <div className="text-sm text-muted-foreground">Select an event to view details.</div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">
              <div className="text-muted-foreground">Time</div>
              <div className="font-medium" data-testid="text-event-time">
                {new Date(getTs(event, "start")).toLocaleString()} \u2013{" "}
                {new Date(getTs(event, "end")).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>

            <div className="text-sm">
              <div className="text-muted-foreground">Location</div>
              <div className="font-medium" data-testid="text-event-location">{event.location || "\u2014"}</div>
            </div>

            <div className="text-sm">
              <div className="text-muted-foreground">Preparation</div>
              <div className="font-medium" data-testid="text-event-prep">{(event.requiresPrep ?? event.requires_prep) ? "Prep required" : "No prep required"}</div>
            </div>

            <Separator />

            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => mut.mutate({ id: event.id, response: "accepted" })} disabled={mut.isPending} data-testid="button-accept">
                Accept
              </Button>
              <Button variant="outline" onClick={() => mut.mutate({ id: event.id, response: "tentative" })} disabled={mut.isPending} data-testid="button-tentative">
                Tentative
              </Button>
              <Button variant="outline" onClick={() => mut.mutate({ id: event.id, response: "declined" })} disabled={mut.isPending} data-testid="button-decline">
                Decline
              </Button>
              <Button
                variant="secondary"
                onClick={() => toast({ title: "Prep Pack", description: "Hook: generate prep tasks + open linked items (next iteration)." })}
                data-testid="button-prep-pack"
              >
                Open Prep Pack
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
