import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { DecisionPacket } from "@shared/schema";
import PrioritySection from "./PrioritySection";
import ActionDrawer from "./ActionDrawer";
import BatchApproveBar from "./BatchApproveBar";

export default function ReviewBoard() {
  const { toast } = useToast();
  const [selectedPacket, setSelectedPacket] = useState<DecisionPacket | null>(null);

  const { data: packets = [], isLoading } = useQuery<DecisionPacket[]>({
    queryKey: ["/api/work-packages", "pending"],
    queryFn: async () => {
      const res = await fetch("/api/work-packages?status=pending", { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
      return res.json();
    },
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, notes, bidProjectId, actionType }: { id: string; notes?: string; bidProjectId?: string; actionType?: string }) => {
      if (bidProjectId && actionType === "jacket_build") {
        const healRes = await fetch(`/api/jackets/bid/${bidProjectId}/ensure-canonical`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (!healRes.ok) {
          const err = await healRes.json().catch(() => ({}));
          throw new Error(err.error || `ensure-canonical failed: ${healRes.status}`);
        }
        const integrityRes = await fetch(`/api/jackets/bid/${bidProjectId}/integrity`, {
          credentials: "include",
        });
        if (integrityRes.ok) {
          const integrity = await integrityRes.json();
          if (!integrity.isHealthy) {
            console.warn("[ReviewBoard] Jacket still unhealthy after ensure-canonical:", integrity);
          }
        }
      }
      await apiRequest("POST", `/api/work-packages/${id}/approve`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-packages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jackets"] });
      toast({ title: "Approved", description: "Work package approved and jacket healed." });
      setSelectedPacket(null);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message || "Failed to approve work package.", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      await apiRequest("POST", `/api/work-packages/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-packages"] });
      toast({ title: "Rejected", description: "Work package rejected." });
      setSelectedPacket(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject work package.", variant: "destructive" });
    },
  });

  const batchMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await apiRequest("POST", "/api/work-packages/batch-approve", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/work-packages"] });
      toast({ title: "Batch Approved", description: "All selected work packages approved." });
      setSelectedPacket(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to batch approve.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const { priorityGroups } = groupPackets(packets);

  return (
    <div className="flex h-full" data-testid="review-board">
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-6">
          {priorityGroups.size === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground" data-testid="empty-board">
              <p className="text-sm">No pending work packages</p>
              <p className="text-xs mt-1">All items have been reviewed</p>
            </div>
          )}
          {["urgent", "high", "normal"].map(priority => {
            const projectGroups = priorityGroups.get(priority);
            if (!projectGroups || projectGroups.size === 0) return null;
            return (
              <PrioritySection
                key={priority}
                priority={priority}
                projectGroups={projectGroups}
                onSelect={setSelectedPacket}
                selectedId={selectedPacket?.id}
                onApprove={(id) => {
                  const pkg = packets.find(p => p.id === id);
                  approveMutation.mutate({ id, bidProjectId: pkg?.routing?.batchKey, actionType: pkg?.actionType });
                }}
              />
            );
          })}
        </div>
        <BatchApproveBar
          packets={packets}
          onBatchApprove={(ids) => batchMutation.mutate(ids)}
          isPending={batchMutation.isPending}
        />
      </div>

      <div className="w-[400px] border-l bg-card shrink-0 hidden lg:block overflow-hidden">
        <ActionDrawer
          packet={selectedPacket}
          onApprove={(id, notes) => approveMutation.mutate({ id, notes, bidProjectId: selectedPacket?.routing?.batchKey, actionType: selectedPacket?.actionType })}
          onReject={(id, reason) => rejectMutation.mutate({ id, reason })}
          isPending={approveMutation.isPending || rejectMutation.isPending}
        />
      </div>
    </div>
  );
}

function groupPackets(packets: DecisionPacket[]) {
  const priorityGroups = new Map<string, Map<string, DecisionPacket[]>>();

  for (const packet of packets) {
    const priority = packet.priority || "normal";
    if (!priorityGroups.has(priority)) {
      priorityGroups.set(priority, new Map());
    }
    const projectMap = priorityGroups.get(priority)!;
    const batchKey = packet.routing.batchKey;
    if (!projectMap.has(batchKey)) {
      projectMap.set(batchKey, []);
    }
    projectMap.get(batchKey)!.push(packet);
  }

  return { priorityGroups };
}
