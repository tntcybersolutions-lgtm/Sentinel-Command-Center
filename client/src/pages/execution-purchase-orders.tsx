import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ShoppingCart, FileText, Package } from "lucide-react";
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

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string;
  projectId: string | null;
  status: string;
  totalAmount: string;
  orderDate: string | null;
  notesJson: any;
  createdAt: string;
  projectName: string | null;
  vendorName: string | null;
  isUnlinked: boolean;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "issued":
      return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Issued</Badge>;
    case "approved":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Approved</Badge>;
    case "draft":
      return <Badge variant="outline">Draft</Badge>;
    case "closed":
      return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Closed</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const getDocTypeBadge = (notesJson: any) => {
  const type = notesJson?.docType;
  if (type === "subcontract") {
    return <Badge variant="secondary">Subcontract</Badge>;
  }
  return <Badge variant="outline">Purchase Order</Badge>;
};

export default function ExecutionPurchaseOrders() {
  const [, setLocation] = useLocation();
  const { data: pos, isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const poCount = pos?.filter(p => p.notesJson?.docType !== "subcontract").length || 0;
  const scCount = pos?.filter(p => p.notesJson?.docType === "subcontract").length || 0;

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto" data-testid="page-execution-purchase-orders">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Purchase Orders & Subcontracts</h1>
          <p className="text-muted-foreground">Purchase orders and subcontracts across projects</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="stat-total-pos">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : (pos?.length || 0)}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-purchase-orders">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Purchase Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : poCount}</div>
          </CardContent>
        </Card>
        <Card data-testid="stat-subcontracts">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subcontracts</CardTitle>
            <Package className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? <Skeleton className="h-8 w-16" /> : scCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <Table data-testid="table-purchase-orders" className="min-w-[800px]">
              <TableHeader>
                <TableRow>
                  <TableHead>PO/SC Number</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pos && pos.length > 0 ? pos.map((po) => (
                  <TableRow key={po.id} data-testid={`row-po-${po.id}`} className="cursor-pointer hover-elevate" onClick={() => setLocation(`/entity/purchaseOrder/${po.id}`)}>
                    <TableCell className="font-mono text-sm" data-testid={`text-po-number-${po.id}`}>
                      {po.poNumber}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      {po.isUnlinked ? (
                        <Badge variant="destructive" className="text-xs" data-testid={`badge-unlinked-${po.id}`}>Unlinked</Badge>
                      ) : (
                        <div className="truncate text-sm" data-testid={`text-project-name-${po.id}`}>{po.projectName || "\u2014"}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px]">
                      <div className="truncate" data-testid={`text-vendor-name-${po.id}`}>{po.vendorName || "\u2014"}</div>
                    </TableCell>
                    <TableCell>{getDocTypeBadge(po.notesJson)}</TableCell>
                    <TableCell>{getStatusBadge(po.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(po.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div onClick={(e) => e.stopPropagation()}>
                        <RowActionMenu entityType="purchaseOrder" entity={po} listQueryKey={["/api/purchase-orders"]} />
                      </div>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No purchase orders found
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
