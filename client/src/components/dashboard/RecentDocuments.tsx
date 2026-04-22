import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileText, FolderOpen } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface RecentDocument {
  id: string;
  name: string;
  path: string;
  modifiedAt: string;
  size: number | null;
  type: string;
  entityType: string | null;
  entityId: string | null;
}

export function RecentDocuments() {
  const [, navigate] = useLocation();

  const { data: recentDocumentsData, isLoading } = useQuery<RecentDocument[] | { documents: RecentDocument[]; syncAvailable: boolean }>({
    queryKey: ["/api/dashboard/recent-documents"],
  });

  const recentDocuments = Array.isArray(recentDocumentsData)
    ? recentDocumentsData
    : recentDocumentsData?.documents || [];

  return (
    <Card data-testid="card-recent-documents">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FolderOpen className="h-4 w-4 text-primary" />
          Recent Documents
        </CardTitle>
        <CardDescription>Files synced from Egnyte</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : recentDocuments.length > 0 ? (
          <div className="space-y-2">
            {recentDocuments.slice(0, 4).map((doc) => (
              <div
                key={doc.id}
                className="flex items-center gap-3 rounded-md border p-2 hover-elevate cursor-pointer"
                onClick={() => window.open(`/api/egnyte/stream?path=${encodeURIComponent(doc.path)}`, "_blank")}
                data-testid={`doc-item-${doc.id}`}
              >
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">{doc.type}</Badge>
              </div>
            ))}
            <Button variant="outline" className="w-full" size="sm" onClick={() => navigate("/integrations")} data-testid="link-view-all-docs">
              View All Documents
            </Button>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No documents synced yet</p>
            <Button variant="ghost" size="sm" onClick={() => navigate("/integrations")} data-testid="link-sync-egnyte">
              Configure Egnyte Sync
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
