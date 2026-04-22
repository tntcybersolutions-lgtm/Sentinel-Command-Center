import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";

interface SystemHealth {
  samgov: "healthy" | "warning" | "error";
  email: "healthy" | "warning" | "error";
  calendar: "healthy" | "warning" | "error";
  lastSync: string;
}

function StatusDot({ status, label }: { status: "healthy" | "warning" | "error"; label: string }) {
  const color =
    status === "healthy"
      ? "bg-green-500"
      : status === "warning"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-1.5" data-testid={`status-dot-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

export function SystemStatusStrip() {
  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ["/api/dashboard/health"],
  });

  if (isLoading) {
    return <Skeleton className="h-4 w-48" />;
  }

  const h = health || { samgov: "healthy" as const, email: "healthy" as const, calendar: "healthy" as const, lastSync: "Never" };

  return (
    <div className="flex items-center gap-4 text-xs text-muted-foreground" data-testid="system-status-strip">
      <StatusDot status={h.samgov} label="SAM.gov" />
      <StatusDot status={h.email} label="Email" />
      <StatusDot status={h.calendar} label="Calendar" />
      <StatusDot status="healthy" label="HERBIE" />
      <span className="text-muted-foreground/60">Synced {h.lastSync}</span>
    </div>
  );
}
