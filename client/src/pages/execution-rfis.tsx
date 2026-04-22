import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { FileQuestion, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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

interface RFI {
  id: string;
  rfiNumber: string;
  subject: string;
  question: string;
  projectId: string;
  status: string;
  priority: string;
  dueDate: string | null;
  attachmentsJson: any;
  createdAt: string;
  projectName: string | null;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "answered":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Answered</Badge>;
    case "closed":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Closed</Badge>;
    case "submitted":
      return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Submitted</Badge>;
    case "draft":
      return <Badge variant="outline">Draft</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getPriorityBadge = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case "high":
    case "urgent":
      return <Badge variant="destructive">{priority}</Badge>;
    case "normal":
      return <Badge variant="secondary">Normal</Badge>;
    case "low":
      return <Badge variant="outline">Low</Badge>;
    default:
      return <Badge variant="outline">{priority}</Badge>;
  }
};

export default function ExecutionRFIs() {
  const [, setLocation] = useLocation();
  const { data: rfis, isLoading } = useQuery<RFI[]>({
    queryKey: ["/api/rfis"],
  });

  const openRFIs = rfis?.filter(r => r.status === "submitted" || r.status === "draft").length || 0;

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto" data-testid="page-execution-rfis">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Requests for Information</h1>
          <p className="text-muted-foreground">Requests for information across all projects</p>
        </div>
        <div className="flex items-center gap-2">
          <Card className="px-4 py-2">
            <div className="flex items-center gap-2">
              <FileQuestion className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{rfis?.length || 0} Total</span>
            </div>
          </Card>
          {openRFIs > 0 && (
            <Card className="px-4 py-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-blue-500" />
                <span className="text-sm font-medium">{openRFIs} Open</span>
              </div>
            </Card>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table data-testid="table-rfis" className="min-w-[850px]">
              <TableHeader>
                <TableRow>
                  <TableHead>RFI #</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rfis && rfis.length > 0 ? rfis.map((rfi) => (
                  <TableRow key={rfi.id} data-testid={`row-rfi-${rfi.id}`} className="cursor-pointer hover-elevate" onClick={() => setLocation(`/entity/rfi/${rfi.id}`)}>
                    <TableCell className="font-mono text-sm" data-testid={`text-rfi-number-${rfi.id}`}>
                      {rfi.rfiNumber}
                    </TableCell>
                    <TableCell className="font-medium max-w-[300px]">
                      <div className="truncate" data-testid={`text-rfi-subject-${rfi.id}`}>{rfi.subject}</div>
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="truncate text-sm">{rfi.projectName || "-"}</div>
                    </TableCell>
                    <TableCell>{getPriorityBadge(rfi.priority)}</TableCell>
                    <TableCell>{getStatusBadge(rfi.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {rfi.dueDate ? new Date(rfi.dueDate).toLocaleDateString() : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(rfi.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div onClick={(e) => e.stopPropagation()}>
                        <RowActionMenu entityType="rfi" entity={rfi} listQueryKey={["/api/rfis"]} />
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No RFIs found
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
