import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link2, ArrowRight } from "lucide-react";

interface ContextDockProps {
  entityType: string;
  entityId: string;
}

export function ContextDock({ entityType, entityId }: ContextDockProps) {
  const { data: links, isLoading } = useQuery<any[]>({
    queryKey: ["/api/entity-links", entityType, entityId],
    queryFn: async () => {
      const res = await fetch(`/api/entity-links?entityType=${entityType}&entityId=${entityId}`);
      return res.json();
    },
    enabled: !!(entityType && entityId),
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-3">
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!links || links.length === 0) return null;

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      opportunity: "Opportunity",
      project: "Project",
      bid_project: "Bid Project",
      purchase_order: "Purchase Order",
      change_order: "Change Order",
      compliance_item: "Compliance Item",
      task: "Task",
      invoice: "Invoice",
      takeoff: "Takeoff",
    };
    return labels[type] || type;
  };

  return (
    <Card data-testid="context-dock">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Linked Entities
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {links.map((link: any) => {
            const isSource = link.sourceType === entityType && link.sourceId === entityId;
            const linkedType = isSource ? link.targetType : link.sourceType;
            const linkedId = isSource ? link.targetId : link.sourceId;
            return (
              <div key={link.id} className="flex items-center gap-2 text-sm border rounded-md p-2" data-testid={`link-${link.id}`}>
                <Badge variant="outline">{getTypeLabel(linkedType)}</Badge>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground font-mono">{linkedId.slice(0, 12)}...</span>
                <Badge variant="secondary" className="ml-auto">{link.relationLabel}</Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
