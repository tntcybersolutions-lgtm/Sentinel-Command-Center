import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Zap } from "lucide-react";
import type { DecisionPacket } from "@shared/schema";

interface BatchApproveBarProps {
  packets: DecisionPacket[];
  onBatchApprove: (ids: string[]) => void;
  isPending: boolean;
}

export default function BatchApproveBar({ packets, onBatchApprove, isPending }: BatchApproveBarProps) {
  const pendingPackets = packets.filter(p => p.status === "pending");
  const routinePackets = pendingPackets.filter(p => p.priority === "normal" && p.summary.risk.level === "low");

  if (pendingPackets.length === 0) return null;

  return (
    <div
      className="sticky bottom-0 bg-background/95 backdrop-blur border-t px-4 py-3 flex items-center justify-between gap-4 flex-wrap"
      data-testid="batch-approve-bar"
    >
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{pendingPackets.length}</Badge>
        <span>pending work packages</span>
      </div>
      <div className="flex items-center gap-2">
        {routinePackets.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onBatchApprove(routinePackets.map(p => p.id))}
            disabled={isPending}
            data-testid="batch-approve-routine"
          >
            <Zap className="h-3 w-3 mr-1" />
            Approve {routinePackets.length} Routine
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => onBatchApprove(pendingPackets.map(p => p.id))}
          disabled={isPending}
          data-testid="batch-approve-all"
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Approve All ({pendingPackets.length})
        </Button>
      </div>
    </div>
  );
}
