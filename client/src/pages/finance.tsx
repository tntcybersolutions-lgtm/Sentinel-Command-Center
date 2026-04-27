import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RowActionMenu } from "@/features/row-actions/RowActionMenu";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  FileText,
  ClipboardList,
  Download,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  PieChart,
  AlertTriangle,
  ShoppingCart,
  MessageSquareText,
  ArrowLeftRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceType: "receivable" | "payable";
  projectId: string | null;
  vendorId: string | null;
  status: string;
  totalAmount: string | number;
  paidAmount: string | number;
  invoiceDate: string | null;
  dueDate: string | null;
  notesJson: any;
  createdAt: string;
  projectName: string | null;
  vendorName: string | null;
}

interface ChangeOrder {
  id: string;
  coNumber: string;
  title: string;
  description: string | null;
  projectId: string | null;
  changeType: string | null;
  status: string;
  amount: string | number;
  daysImpact: number | null;
  createdAt: string;
  projectName: string | null;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorId: string | null;
  projectId: string | null;
  status: string;
  totalAmount: string | number;
  orderDate: string | null;
  notesJson: any;
  createdAt: string;
  projectName: string | null;
}

interface RFI {
  id: string;
  rfiNumber: string;
  subject: string;
  question: string | null;
  projectId: string | null;
  status: string;
  priority: string | null;
  dueDate: string | null;
  attachmentsJson: any;
  createdAt: string;
  projectName: string | null;
}

// Maps the URL slug under /financial/* to the Tabs `value` and back.
// Keeping the mapping here (vs. naming tabs after slugs) preserves the
// existing test-ids and lets us alias overview/dashboard/invoices.
const URL_TO_TAB: Record<string, string> = {
  overview: "overview",
  dashboard: "overview",
  bills: "bills",
  invoices: "client-invoices",
  "client-invoices": "client-invoices",
  "change-orders": "change-orders",
  "purchase-orders": "purchase-orders",
  rfis: "rfis",
};
const TAB_TO_URL: Record<string, string> = {
  overview: "overview",
  bills: "bills",
  "client-invoices": "invoices",
  "change-orders": "change-orders",
  "purchase-orders": "purchase-orders",
  rfis: "rfis",
};

export default function Finance() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  // Derive the initial tab from the URL so a deep-link to
  // /financial/invoices opens the Client Invoices tab on first paint.
  const slugFromPath = (path: string) => {
    const m = path.match(/^\/financial\/([^/?#]+)/);
    return m ? m[1] : "overview";
  };
  const [selectedTab, setSelectedTab] = useState(() => URL_TO_TAB[slugFromPath(location)] ?? "overview");

  // Keep the tab in sync when the URL changes externally (back/forward,
  // sidebar nav, etc.) without thrashing if the slug already matches.
  useEffect(() => {
    const desired = URL_TO_TAB[slugFromPath(location)] ?? "overview";
    if (desired !== selectedTab) setSelectedTab(desired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location]);

  // Update the URL when the user clicks a tab so the path stays
  // shareable. Replace, not push, to avoid polluting history.
  const handleTabChange = (next: string) => {
    setSelectedTab(next);
    const slug = TAB_TO_URL[next] ?? next;
    const target = `/financial/${slug}`;
    if (location !== target) setLocation(target, { replace: true });
  };

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: projectOptions = [] } = useQuery<ProjectOption[]>({
    queryKey: ["/api/projects"],
  });

  // "+ New Invoice" dialog state. Kept local — the dialog is small and
  // tightly coupled to this page.
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    invoiceNumber: "",
    invoiceType: "receivable" as "receivable" | "payable",
    projectId: "",
    totalAmount: "",
    dueDate: "",
    status: "draft",
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (payload: typeof newInvoice) => {
      const body = {
        invoiceNumber: payload.invoiceNumber.trim(),
        invoiceType: payload.invoiceType,
        projectId: payload.projectId || null,
        totalAmount: payload.totalAmount || "0",
        dueDate: payload.dueDate || null,
        status: payload.status || "draft",
      };
      const res = await apiRequest("POST", "/api/invoices", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice created", description: `#${newInvoice.invoiceNumber} was added.` });
      setIsNewInvoiceOpen(false);
      setNewInvoice({
        invoiceNumber: "",
        invoiceType: "receivable",
        projectId: "",
        totalAmount: "",
        dueDate: "",
        status: "draft",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to create invoice",
        description: err?.message || "Please check the fields and try again.",
        variant: "destructive",
      });
    },
  });

  const { data: changeOrders, isLoading: coLoading } = useQuery<ChangeOrder[]>({
    queryKey: ["/api/change-orders"],
  });

  const { data: purchaseOrders, isLoading: poLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/purchase-orders"],
  });

  const { data: rfis, isLoading: rfisLoading } = useQuery<RFI[]>({
    queryKey: ["/api/rfis"],
  });

  const isLoading = invoicesLoading || coLoading || poLoading || rfisLoading;

  const stats = useMemo(() => {
    if (!invoices) return null;
    const receivables = invoices.filter((inv) => inv.invoiceType === "receivable");
    const payables = invoices.filter((inv) => inv.invoiceType === "payable");

    const cashPosition = receivables.reduce((sum, inv) => sum + Number(inv.paidAmount || 0), 0);
    const arOutstanding = receivables
      .filter((inv) => inv.status !== "paid")
      .reduce((sum, inv) => sum + (Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)), 0);
    const apDue = payables
      .filter((inv) => inv.status !== "paid")
      .reduce((sum, inv) => sum + (Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0)), 0);
    const projectedCashFlow = arOutstanding - apDue;

    return {
      cashPosition,
      arOutstanding,
      apDue,
      projectedCashFlow,
      receivableCount: receivables.length,
      payableCount: payables.length,
    };
  }, [invoices]);

  const bills = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv) => inv.invoiceType === "payable");
  }, [invoices]);

  const clientInvoices = useMemo(() => {
    if (!invoices) return [];
    return invoices.filter((inv) => inv.invoiceType === "receivable");
  }, [invoices]);

  const formatCurrency = (value: number) => {
    if (Math.abs(value) >= 1000000) {
      return `$${(value / 1000000).toFixed(2)}M`;
    }
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    const s = status.toLowerCase();
    switch (s) {
      case "paid":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 no-default-hover-elevate no-default-active-elevate">Paid</Badge>;
      case "approved":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 no-default-hover-elevate no-default-active-elevate">Approved</Badge>;
      case "pending":
      case "pending_review":
        return <Badge variant="secondary">Pending</Badge>;
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "voided":
      case "rejected":
        return <Badge variant="destructive">{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>;
      case "submitted":
      case "sent":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 no-default-hover-elevate no-default-active-elevate">Submitted</Badge>;
      case "open":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 no-default-hover-elevate no-default-active-elevate">Open</Badge>;
      case "closed":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 no-default-hover-elevate no-default-active-elevate">Closed</Badge>;
      case "overdue":
        return <Badge variant="destructive">Overdue</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string | null) => {
    if (!priority) return <Badge variant="outline">-</Badge>;
    const p = priority.toLowerCase();
    switch (p) {
      case "high":
      case "urgent":
        return <Badge variant="destructive">{priority}</Badge>;
      case "medium":
      case "normal":
        return <Badge variant="secondary">{priority}</Badge>;
      case "low":
        return <Badge variant="outline">{priority}</Badge>;
      default:
        return <Badge variant="outline">{priority}</Badge>;
    }
  };

  const parseNotesJson = (notesJson: any): Record<string, any> => {
    if (!notesJson) return {};
    if (typeof notesJson === "string") {
      try {
        return JSON.parse(notesJson);
      } catch {
        return {};
      }
    }
    return notesJson;
  };

  const getVendorFromNotes = (notesJson: any): string => {
    const notes = parseNotesJson(notesJson);
    return notes.vendorName || notes.vendor || notes.vendor_name || "-";
  };

  const getTypeFromNotes = (notesJson: any): string => {
    const notes = parseNotesJson(notesJson);
    return notes.type || notes.orderType || notes.order_type || "PO";
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto" data-testid="page-finance">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Finance</h1>
          <p className="text-muted-foreground">Financial overview, invoices, and project billing</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" data-testid="button-export-data">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-cash-position">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash Position</CardTitle>
            <div className="h-10 w-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
              <DollarSign className="h-5 w-5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-cash-position">
                  {formatCurrency(stats?.cashPosition ?? 0)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Receipt className="h-3 w-3" />
                  <span>{stats?.receivableCount ?? 0} receivable invoices</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-ar-outstanding">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AR Outstanding</CardTitle>
            <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-ar-outstanding">
                  {formatCurrency(stats?.arOutstanding ?? 0)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowUpRight className="h-3 w-3 text-blue-500" />
                  <span>{clientInvoices.filter((i) => i.status !== "paid").length} unpaid invoices</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-ap-due">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AP Due</CardTitle>
            <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center">
              <TrendingDown className="h-5 w-5 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-ap-due">
                  {formatCurrency(stats?.apDue ?? 0)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <ArrowDownRight className="h-3 w-3 text-amber-500" />
                  <span>{bills.filter((i) => i.status !== "paid").length} unpaid bills</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-projected-cash-flow">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projected Cash Flow</CardTitle>
            <div className="h-10 w-10 rounded-md bg-purple-500/10 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <>
                <div
                  className={`text-2xl font-bold ${(stats?.projectedCashFlow ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  data-testid="text-projected-cash-flow"
                >
                  {formatCurrency(stats?.projectedCashFlow ?? 0)}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  {(stats?.projectedCashFlow ?? 0) >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-500" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-red-500" />
                  )}
                  <span>AR - AP net position</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList data-testid="tabs-finance" className="flex-wrap">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="bills" data-testid="tab-bills">Bills (Payable)</TabsTrigger>
          <TabsTrigger value="client-invoices" data-testid="tab-client-invoices">Client Invoices</TabsTrigger>
          <TabsTrigger value="change-orders" data-testid="tab-change-orders">Change Orders</TabsTrigger>
          <TabsTrigger value="purchase-orders" data-testid="tab-purchase-orders">Purchase Orders</TabsTrigger>
          <TabsTrigger value="rfis" data-testid="tab-rfis">RFIs &amp; Docs</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4" data-testid="tabcontent-overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Billing Summary</CardTitle>
                  <CardDescription>Invoice overview by type</CardDescription>
                </div>
                <PieChart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50" data-testid="overview-ar-receivables">
                      <div className="flex items-center gap-3">
                        <TrendingUp className="h-4 w-4 text-green-500" />
                        <span className="text-sm font-medium">AR - Receivables</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{formatCurrency(clientInvoices.reduce((s, i) => s + Number(i.totalAmount || 0), 0))}</span>
                        <Badge variant="secondary">{clientInvoices.length}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50" data-testid="overview-ap-payables">
                      <div className="flex items-center gap-3">
                        <TrendingDown className="h-4 w-4 text-amber-500" />
                        <span className="text-sm font-medium">AP - Payables</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">{formatCurrency(bills.reduce((s, i) => s + Number(i.totalAmount || 0), 0))}</span>
                        <Badge variant="secondary">{bills.length}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50" data-testid="overview-change-orders">
                      <div className="flex items-center gap-3">
                        <ArrowLeftRight className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">Change Orders</span>
                      </div>
                      <Badge variant="secondary">{changeOrders?.length ?? 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50" data-testid="overview-purchase-orders">
                      <div className="flex items-center gap-3">
                        <ShoppingCart className="h-4 w-4 text-purple-500" />
                        <span className="text-sm font-medium">Purchase Orders</span>
                      </div>
                      <Badge variant="secondary">{purchaseOrders?.length ?? 0}</Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50" data-testid="overview-rfis">
                      <div className="flex items-center gap-3">
                        <MessageSquareText className="h-4 w-4 text-orange-500" />
                        <span className="text-sm font-medium">RFIs</span>
                      </div>
                      <Badge variant="secondary">{rfis?.length ?? 0}</Badge>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Recent Invoices</CardTitle>
                  <CardDescription>Latest financial activity</CardDescription>
                </div>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {invoicesLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {(invoices ?? []).slice(0, 6).map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer hover-elevate" data-testid={`recent-invoice-${invoice.id}`} onClick={() => setLocation(`/entity/invoice/${invoice.id}`)}>
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {invoice.invoiceType === "receivable" ? (
                            <Receipt className="h-4 w-4 shrink-0 text-green-500" />
                          ) : (
                            <FileText className="h-4 w-4 shrink-0 text-amber-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate" title={invoice.invoiceNumber}>{invoice.invoiceNumber}</div>
                            <div className="text-xs text-muted-foreground truncate" title={invoice.projectName || "-"}>{invoice.projectName || "-"}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {getStatusBadge(invoice.status)}
                          <span className="font-medium text-sm whitespace-nowrap">{formatCurrency(Number(invoice.totalAmount || 0))}</span>
                        </div>
                      </div>
                    ))}
                    {(!invoices || invoices.length === 0) && (
                      <div className="text-center py-8 text-muted-foreground" data-testid="text-no-invoices">
                        No invoices found
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bills" className="space-y-4" data-testid="tabcontent-bills">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Bills (Accounts Payable)</CardTitle>
                <CardDescription>Vendor bills and payables</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : bills.length === 0 ? (
                <div className="p-6 border rounded-lg text-center" data-testid="text-no-bills">
                  <Receipt className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="font-medium">No bills yet</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Create a bill to see it here. Row actions appear on each row once data exists.
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bills.map((bill) => {
                      const total = Number(bill.totalAmount || 0);
                      const paid = Number(bill.paidAmount || 0);
                      const due = total - paid;
                      return (
                        <TableRow key={bill.id} data-testid={`row-bill-${bill.id}`} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/entity/invoice/${bill.id}`)}>
                          <TableCell className="font-medium" data-testid={`text-bill-number-${bill.id}`}>{bill.invoiceNumber}</TableCell>
                          <TableCell data-testid={`text-bill-project-${bill.id}`}>{bill.projectName || "-"}</TableCell>
                          <TableCell data-testid={`text-bill-vendor-${bill.id}`}>{bill.vendorName || getVendorFromNotes(bill.notesJson)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                          <TableCell className="text-right text-green-500">{formatCurrency(paid)}</TableCell>
                          <TableCell className="text-right text-amber-500">{formatCurrency(due)}</TableCell>
                          <TableCell>{getStatusBadge(bill.status)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(bill.invoiceDate || bill.createdAt)}</TableCell>
                          <TableCell>
                            <div onClick={(e) => e.stopPropagation()}>
                              <RowActionMenu entityType="invoice" entity={bill} listQueryKey={["/api/invoices"]} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="client-invoices" className="space-y-4" data-testid="tabcontent-client-invoices">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Client Invoices (Accounts Receivable)</CardTitle>
                <CardDescription>Invoices sent to clients</CardDescription>
              </div>
              <Dialog open={isNewInvoiceOpen} onOpenChange={setIsNewInvoiceOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" data-testid="button-new-invoice">
                    <Plus className="h-4 w-4 mr-1" />
                    New Invoice
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md" data-testid="dialog-new-invoice">
                  <DialogHeader>
                    <DialogTitle>New Invoice</DialogTitle>
                    <DialogDescription>Create an invoice receivable from a client or payable to a vendor.</DialogDescription>
                  </DialogHeader>
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!newInvoice.invoiceNumber.trim()) {
                        toast({ title: "Invoice number required", variant: "destructive" });
                        return;
                      }
                      createInvoiceMutation.mutate(newInvoice);
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="invoice-number">Invoice #</Label>
                      <Input
                        id="invoice-number"
                        data-testid="input-invoice-number"
                        value={newInvoice.invoiceNumber}
                        onChange={(e) => setNewInvoice((s) => ({ ...s, invoiceNumber: e.target.value }))}
                        placeholder="INV-2026-0001"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="invoice-type">Type</Label>
                        <Select
                          value={newInvoice.invoiceType}
                          onValueChange={(v) => setNewInvoice((s) => ({ ...s, invoiceType: v as "receivable" | "payable" }))}
                        >
                          <SelectTrigger id="invoice-type" data-testid="select-invoice-type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="receivable">Receivable (AR)</SelectItem>
                            <SelectItem value="payable">Payable (AP)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="invoice-status">Status</Label>
                        <Select
                          value={newInvoice.status}
                          onValueChange={(v) => setNewInvoice((s) => ({ ...s, status: v }))}
                        >
                          <SelectTrigger id="invoice-status" data-testid="select-invoice-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="sent">Sent</SelectItem>
                            <SelectItem value="approved">Approved</SelectItem>
                            <SelectItem value="paid">Paid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="invoice-project">Project</Label>
                      <Select
                        value={newInvoice.projectId || "__none__"}
                        onValueChange={(v) => setNewInvoice((s) => ({ ...s, projectId: v === "__none__" ? "" : v }))}
                      >
                        <SelectTrigger id="invoice-project" data-testid="select-invoice-project">
                          <SelectValue placeholder="Select a project (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No project</SelectItem>
                          {projectOptions.map((p) => (
                            <SelectItem key={p.id} value={p.id} data-testid={`option-invoice-project-${p.id}`}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="invoice-amount">Amount</Label>
                        <Input
                          id="invoice-amount"
                          type="number"
                          step="0.01"
                          min="0"
                          inputMode="decimal"
                          data-testid="input-invoice-amount"
                          value={newInvoice.totalAmount}
                          onChange={(e) => setNewInvoice((s) => ({ ...s, totalAmount: e.target.value }))}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="invoice-due">Due Date</Label>
                        <Input
                          id="invoice-due"
                          type="date"
                          data-testid="input-invoice-due-date"
                          value={newInvoice.dueDate}
                          onChange={(e) => setNewInvoice((s) => ({ ...s, dueDate: e.target.value }))}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsNewInvoiceOpen(false)}
                        data-testid="button-cancel-new-invoice"
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={createInvoiceMutation.isPending}
                        data-testid="button-submit-new-invoice"
                      >
                        {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {invoicesLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : clientInvoices.length === 0 ? (
                <div className="p-6 border rounded-lg text-center" data-testid="text-no-client-invoices">
                  <Receipt className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="font-medium">No client invoices yet</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Create an invoice to see it here. Row actions appear on each row once data exists.
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Due</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientInvoices.map((inv) => {
                      const total = Number(inv.totalAmount || 0);
                      const paid = Number(inv.paidAmount || 0);
                      const due = total - paid;
                      return (
                        <TableRow key={inv.id} data-testid={`row-client-invoice-${inv.id}`} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/entity/invoice/${inv.id}`)}>
                          <TableCell className="font-medium" data-testid={`text-client-invoice-number-${inv.id}`}>{inv.invoiceNumber}</TableCell>
                          <TableCell data-testid={`text-client-invoice-project-${inv.id}`}>{inv.projectName || "-"}</TableCell>
                          <TableCell className="text-right">{formatCurrency(total)}</TableCell>
                          <TableCell className="text-right text-green-500">{formatCurrency(paid)}</TableCell>
                          <TableCell className="text-right text-amber-500">{formatCurrency(due)}</TableCell>
                          <TableCell>{getStatusBadge(inv.status)}</TableCell>
                          <TableCell className="text-muted-foreground">{formatDate(inv.createdAt)}</TableCell>
                          <TableCell>
                            <div onClick={(e) => e.stopPropagation()}>
                              <RowActionMenu entityType="invoice" entity={inv} listQueryKey={["/api/invoices"]} />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="change-orders" className="space-y-4" data-testid="tabcontent-change-orders">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Change Orders</CardTitle>
                <CardDescription>Project change orders and modifications</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {coLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !changeOrders || changeOrders.length === 0 ? (
                <div className="p-6 border rounded-lg text-center" data-testid="text-no-change-orders">
                  <ArrowLeftRight className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="font-medium">No change orders yet</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Create a change order to see it here. Row actions appear on each row once data exists.
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CO #</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Days Impact</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {changeOrders.map((co) => (
                      <TableRow key={co.id} data-testid={`row-change-order-${co.id}`} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/entity/changeOrder/${co.id}`)}>
                        <TableCell className="font-medium" data-testid={`text-co-number-${co.id}`}>{co.coNumber}</TableCell>
                        <TableCell data-testid={`text-co-title-${co.id}`}>{co.title}</TableCell>
                        <TableCell data-testid={`text-co-project-${co.id}`}>{co.projectName || "-"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(co.amount || 0))}</TableCell>
                        <TableCell>{co.daysImpact != null ? `${co.daysImpact} days` : "-"}</TableCell>
                        <TableCell>{getStatusBadge(co.status)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(co.createdAt)}</TableCell>
                        <TableCell>
                          <div onClick={(e) => e.stopPropagation()}>
                            <RowActionMenu entityType="changeOrder" entity={co} listQueryKey={["/api/change-orders"]} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="purchase-orders" className="space-y-4" data-testid="tabcontent-purchase-orders">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Purchase Orders</CardTitle>
                <CardDescription>Purchase orders and subcontracts</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {poLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !purchaseOrders || purchaseOrders.length === 0 ? (
                <div className="p-6 border rounded-lg text-center" data-testid="text-no-purchase-orders">
                  <ShoppingCart className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="font-medium">No purchase orders yet</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Create a purchase order to see it here. Row actions appear on each row once data exists.
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO #</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {purchaseOrders.map((po) => (
                      <TableRow key={po.id} data-testid={`row-purchase-order-${po.id}`} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/entity/purchaseOrder/${po.id}`)}>
                        <TableCell className="font-medium" data-testid={`text-po-number-${po.id}`}>{po.poNumber}</TableCell>
                        <TableCell data-testid={`text-po-project-${po.id}`}>{po.projectName || "-"}</TableCell>
                        <TableCell data-testid={`text-po-vendor-${po.id}`}>{getVendorFromNotes(po.notesJson)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getTypeFromNotes(po.notesJson)}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(po.totalAmount || 0))}</TableCell>
                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(po.orderDate || po.createdAt)}</TableCell>
                        <TableCell>
                          <div onClick={(e) => e.stopPropagation()}>
                            <RowActionMenu entityType="purchaseOrder" entity={po} listQueryKey={["/api/purchase-orders"]} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rfis" className="space-y-4" data-testid="tabcontent-rfis">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle>Requests for Information</CardTitle>
                <CardDescription>For cost-impact RFIs only</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              {rfisLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !rfis || rfis.length === 0 ? (
                <div className="p-6 border rounded-lg text-center" data-testid="text-no-rfis-finance">
                  <MessageSquareText className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <div className="font-medium">No RFIs yet</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Create an RFI to see it here. Row actions appear on each row once data exists.
                  </div>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>RFI #</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-12 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rfis.map((rfi) => (
                      <TableRow key={rfi.id} data-testid={`row-rfi-${rfi.id}`} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/entity/rfi/${rfi.id}`)}>
                        <TableCell className="font-medium" data-testid={`text-rfi-number-${rfi.id}`}>{rfi.rfiNumber}</TableCell>
                        <TableCell data-testid={`text-rfi-subject-${rfi.id}`}>{rfi.subject}</TableCell>
                        <TableCell data-testid={`text-rfi-project-${rfi.id}`}>{rfi.projectName || "-"}</TableCell>
                        <TableCell>{getStatusBadge(rfi.status)}</TableCell>
                        <TableCell>{getPriorityBadge(rfi.priority)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(rfi.dueDate)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(rfi.createdAt)}</TableCell>
                        <TableCell>
                          <div onClick={(e) => e.stopPropagation()}>
                            <RowActionMenu entityType="rfi" entity={rfi} listQueryKey={["/api/rfis"]} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
