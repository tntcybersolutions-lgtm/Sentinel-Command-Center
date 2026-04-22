import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RowActionMenu } from "@/features/row-actions/RowActionMenu";

interface Submittal {
  id: string;
  submittalNumber: string;
  name: string;
  projectId: string;
  revision: number;
  status: string;
  priority: string;
  submittalType: string | null;
  description: string | null;
  managerName: string | null;
  contractorName: string | null;
  approvers: string | null;
  createdAt: string;
  projectName: string | null;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "approved":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Approved</Badge>;
    case "closed":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Closed</Badge>;
    case "pending":
      return <Badge variant="secondary">Pending</Badge>;
    case "draft":
      return <Badge variant="outline">Draft</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function ExecutionSubmittals() {
  const [, setLocation] = useLocation();
  const { data: submittals, isLoading } = useQuery<Submittal[]>({
    queryKey: ["/api/submittals"],
  });

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto" data-testid="page-execution-submittals">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Submittals</h1>
          <p className="text-muted-foreground">Material and equipment submittals across projects</p>
        </div>
        <div className="flex items-center gap-2">
          <Card className="px-4 py-2">
            <div className="flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{submittals?.length || 0} Submittals</span>
            </div>
          </Card>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table data-testid="table-submittals" className="min-w-[900px]">
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Rev</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Manager</TableHead>
                  <TableHead>Approvers</TableHead>
                  <TableHead className="w-[72px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submittals && submittals.length > 0 ? (
                  submittals.map((sub) => (
                    <TableRow
                      key={sub.id}
                      data-testid={`row-submittal-${sub.id}`}
                      className="cursor-pointer hover-elevate"
                      onClick={() => setLocation(`/entity/submittal/${sub.id}`)}
                    >
                      <TableCell
                        className="font-mono text-sm"
                        data-testid={`text-submittal-number-${sub.id}`}
                      >
                        {sub.submittalNumber}
                      </TableCell>
                      <TableCell className="font-medium max-w-[250px]">
                        <div className="truncate">{sub.name}</div>
                        {sub.description && (
                          <div className="text-xs text-muted-foreground truncate">
                            {sub.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <div className="truncate text-sm">{sub.projectName || "-"}</div>
                      </TableCell>
                      <TableCell className="text-sm">{sub.submittalType || "-"}</TableCell>
                      <TableCell className="text-sm">{sub.revision ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={sub.priority === "high" ? "destructive" : "secondary"}>
                          {sub.priority ?? "-"}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(sub.status)}</TableCell>
                      <TableCell className="text-sm">{sub.managerName || "-"}</TableCell>
                      <TableCell className="text-sm">{sub.approvers || "-"}</TableCell>
                      <TableCell className="w-[72px] text-right">
                        <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu
                            entityType="submittal"
                            entity={sub}
                            listQueryKey={["/api/submittals"]}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      No submittals found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
