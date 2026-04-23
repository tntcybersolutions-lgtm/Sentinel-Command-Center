import { useState, useEffect, useMemo } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  FileText,
  FolderOpen,
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  Send,
  Shield,
  AlertTriangle,
  Loader2,
  DollarSign,
  Save,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

interface InvitationData {
  invitation: {
    id: string;
    status: string;
    deadlineSnapshot: string | null;
    sentAt: string;
    openedAt: string | null;
    respondedAt: string | null;
    submittedAt: string | null;
  };
  bidProject: {
    id: string;
    opportunityTitle: string;
    status: string;
    agency: string;
    noticeId: string;
    naicsCode: string;
  };
  vendor: {
    companyName: string;
    contactName: string;
    email: string;
  };
}

interface FolderDoc {
  id: string;
  name: string;
  folderCode: string;
  documents: Array<{
    id: string;
    title: string;
    fileName: string;
    fileType: string;
    fileSizeBytes: number;
    documentType: string;
    uploadedAt: string;
  }>;
}

interface BidFormLineItem {
  id: string;
  description: string;
  costCodeId: string | null;
  costCode: { id: string; code: string; name: string } | null;
  uom: string | null;
  qty: string | null;
  isRequired: boolean;
  sortOrder: number;
}

interface BidFormSection {
  id: string;
  title: string;
  sectionType: string;
  sortOrder: number;
  isRequired: boolean;
  lineItems: BidFormLineItem[];
}

interface BidFormData {
  legacy: boolean;
  form: { id: string; instructions: string; allowUnitPricing: boolean; status: string } | null;
  sections: BidFormSection[];
  response: { id: string; status: string; notes: string | null } | null;
  responseLineItems: Array<{
    bidFormLineItemId: string;
    unitPrice: string | null;
    totalPrice: string | null;
    included: boolean;
    comment: string | null;
  }>;
  dueAt: string | null;
  isOverdue: boolean;
}

function formatCurrency(val: number): string {
  return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VendorPortal() {
  const params = useParams<{ token: string }>();
  const token = params.token || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InvitationData | null>(null);
  const [folders, setFolders] = useState<FolderDoc[]>([]);
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null);
  const [intentSubmitting, setIntentSubmitting] = useState(false);
  const [declineSubmitting, setDeclineSubmitting] = useState(false);
  const [bidFormOpen, setBidFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [bidFormData, setBidFormData] = useState<BidFormData | null>(null);
  const [bidFormLoading, setBidFormLoading] = useState(false);
  const [lineItemValues, setLineItemValues] = useState<Record<string, { unitPrice: string; totalPrice: string; included: boolean; comment: string }>>({});
  const [bidNotes, setBidNotes] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const [legacyBidAmount, setLegacyBidAmount] = useState("");
  const [legacyLineItems, setLegacyLineItems] = useState<Array<{ description: string; quantity: string; unitPrice: string; total: string }>>([
    { description: "", quantity: "1", unitPrice: "", total: "" },
  ]);

  useEffect(() => {
    if (!token) return;
    loadInvitation();
  }, [token]);

  async function loadInvitation() {
    try {
      setLoading(true);
      const resp = await fetch(`/api/v/bid/${token}`);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Invalid invitation" }));
        setError(err.error || "Invalid or expired invitation");
        return;
      }
      const invData = await resp.json();
      setData(invData);
      if (invData.folders) setFolders(invData.folders);
      if (invData.invitation?.status === "submitted") setSubmitted(true);
    } catch {
      setError("Failed to load invitation. Please try again later.");
    } finally {
      setLoading(false);
    }
  }

  async function loadBidForm() {
    setBidFormLoading(true);
    try {
      const resp = await fetch(`/api/v/bid/${token}/bid-form`);
      if (!resp.ok) return;
      const formData: BidFormData = await resp.json();
      setBidFormData(formData);

      if (!formData.legacy && formData.sections.length > 0) {
        const vals: Record<string, { unitPrice: string; totalPrice: string; included: boolean; comment: string }> = {};
        const existingMap: Record<string, any> = {};
        (formData.responseLineItems || []).forEach(ri => { existingMap[ri.bidFormLineItemId] = ri; });

        formData.sections.forEach(s => {
          s.lineItems.forEach(li => {
            const existing = existingMap[li.id];
            vals[li.id] = {
              unitPrice: existing?.unitPrice || "",
              totalPrice: existing?.totalPrice || "",
              included: existing ? existing.included : true,
              comment: existing?.comment || "",
            };
          });
        });
        setLineItemValues(vals);
        setBidNotes(formData.response?.notes || "");
        setExpandedSections(new Set(formData.sections.map(s => s.id)));
      }
    } finally {
      setBidFormLoading(false);
    }
  }

  async function handleIntent() {
    setIntentSubmitting(true);
    try {
      const resp = await fetch(`/api/v/bid/${token}/intends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intends: true }),
      });
      if (resp.ok) await loadInvitation();
    } finally {
      setIntentSubmitting(false);
    }
  }

  async function handleDecline() {
    setDeclineSubmitting(true);
    try {
      const resp = await fetch(`/api/v/bid/${token}/intends`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intends: false }),
      });
      if (resp.ok) await loadInvitation();
    } finally {
      setDeclineSubmitting(false);
    }
  }

  function updateLineItemValue(itemId: string, field: string, value: any) {
    setLineItemValues(prev => ({
      ...prev,
      [itemId]: { ...prev[itemId], [field]: value },
    }));
  }

  function toggleSection(sectionId: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      return next;
    });
  }

  const sectionTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    if (!bidFormData?.sections) return totals;
    bidFormData.sections.forEach(s => {
      totals[s.id] = s.lineItems.reduce((sum, li) => {
        const val = lineItemValues[li.id];
        if (!val || !val.included) return sum;
        return sum + (parseFloat(val.totalPrice) || 0);
      }, 0);
    });
    return totals;
  }, [bidFormData, lineItemValues]);

  const grandTotal = useMemo(() => {
    return Object.values(sectionTotals).reduce((sum, v) => sum + v, 0);
  }, [sectionTotals]);

  async function handleStructuredSave(action: "draft" | "submit") {
    if (action === "submit") setSubmitting(true);
    else setSavingDraft(true);

    try {
      const items = Object.entries(lineItemValues).map(([bidFormLineItemId, val]) => ({
        bidFormLineItemId,
        unitPrice: val.unitPrice ? parseFloat(val.unitPrice) : null,
        totalPrice: val.totalPrice ? parseFloat(val.totalPrice) : null,
        included: val.included,
        comment: val.comment || null,
      }));

      const resp = await fetch(`/api/v/bid/${token}/bid-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, lineItems: items, notes: bidNotes }),
      });

      if (resp.ok) {
        if (action === "submit") {
          setSubmitted(true);
          await loadInvitation();
        }
      } else {
        const err = await resp.json().catch(() => ({}));
        alert(err.error || `Failed to ${action} bid`);
      }
    } finally {
      setSubmitting(false);
      setSavingDraft(false);
    }
  }

  function updateLegacyLineItem(idx: number, field: string, value: string) {
    setLegacyLineItems(prev => {
      const next = [...prev];
      (next[idx] as any)[field] = value;
      if (field === "quantity" || field === "unitPrice") {
        const qty = parseFloat(next[idx].quantity) || 0;
        const price = parseFloat(next[idx].unitPrice) || 0;
        next[idx].total = (qty * price).toFixed(2);
      }
      return next;
    });
  }

  const legacyTotal = legacyLineItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);

  async function handleLegacySave(action: string) {
    if (action === "submit") setSubmitting(true);
    else setSavingDraft(true);
    try {
      const resp = await fetch(`/api/v/bid/${token}/bid-form`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          totalAmount: legacyTotal || parseFloat(legacyBidAmount) || 0,
          lineItemsJson: legacyLineItems.filter(li => li.description),
          notesJson: { notes: bidNotes },
        }),
      });
      if (resp.ok && action === "submit") {
        setSubmitted(true);
        await loadInvitation();
      } else if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        alert(err.error || "Failed");
      }
    } finally {
      setSubmitting(false);
      setSavingDraft(false);
    }
  }

  function formatFileSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="space-y-4 w-full max-w-2xl px-4">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="vendor-portal-error">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <AlertTriangle className="w-16 h-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const deadline = data.invitation.deadlineSnapshot ? new Date(data.invitation.deadlineSnapshot) : null;
  const isExpired = deadline ? deadline < new Date() : false;
  const daysRemaining = deadline ? Math.ceil((deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;

  if (submitted || data.invitation.status === "submitted") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="vendor-portal-submitted">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Bid Submitted</h2>
            <p className="text-muted-foreground">Your bid has been submitted successfully for</p>
            <p className="font-medium mt-2" data-testid="text-submitted-title">{data.bidProject.opportunityTitle}</p>
            {data.invitation.submittedAt && (
              <p className="text-sm text-muted-foreground mt-2">
                Submitted on {new Date(data.invitation.submittedAt).toLocaleString()}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (data.invitation.status === "declined") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center" data-testid="vendor-portal-declined">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <XCircle className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invitation Declined</h2>
            <p className="text-muted-foreground">You have declined the invitation for</p>
            <p className="font-medium mt-2">{data.bidProject.opportunityTitle}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isStructuredForm = bidFormData && !bidFormData.legacy && bidFormData.form;

  return (
    <div className="min-h-screen bg-background" data-testid="vendor-portal-main">
      <header className="border-b bg-card">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold" data-testid="text-portal-title">Vendor Bid Portal</h1>
              <p className="text-sm text-muted-foreground">Secure bid submission portal</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-lg" data-testid="text-project-title">{data.bidProject.opportunityTitle}</CardTitle>
                <CardDescription className="mt-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <Building2 className="w-4 h-4" />
                    {data.bidProject.agency}
                    {data.bidProject.noticeId && (
                      <Badge variant="outline">{data.bidProject.noticeId}</Badge>
                    )}
                    {data.bidProject.naicsCode && (
                      <Badge variant="outline">NAICS: {data.bidProject.naicsCode}</Badge>
                    )}
                  </span>
                </CardDescription>
              </div>
              {deadline && (
                <div className={`text-right ${isExpired ? "text-destructive" : daysRemaining && daysRemaining <= 7 ? "text-yellow-600" : ""}`}>
                  <div className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm font-medium" data-testid="text-deadline">
                      {isExpired ? "Expired" : `${daysRemaining} day(s) remaining`}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{deadline.toLocaleDateString()}</p>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge data-testid="badge-invitation-status">
                {data.invitation.status === "intends_to_bid" ? "Intending to Bid" : data.invitation.status.charAt(0).toUpperCase() + data.invitation.status.slice(1)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                Invited: {data.vendor.companyName}
              </span>
            </div>
          </CardContent>
        </Card>

        {data.invitation.status === "invited" || data.invitation.status === "opened" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Respond to Invitation</CardTitle>
              <CardDescription>Please indicate whether you intend to bid on this opportunity</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  onClick={handleIntent}
                  disabled={intentSubmitting || isExpired}
                  data-testid="button-intend-to-bid"
                >
                  {intentSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                  Intend to Bid
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDecline}
                  disabled={declineSubmitting || isExpired}
                  data-testid="button-decline"
                >
                  {declineSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Decline
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bid Documents</CardTitle>
            <CardDescription>Review the following documents before preparing your bid</CardDescription>
          </CardHeader>
          <CardContent>
            {folders.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mb-3" />
                <p>No documents available yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {folders.map(f => (
                  <div key={f.id}>
                    <button
                      className="flex items-center gap-2 w-full text-left p-2 rounded-md hover-elevate"
                      onClick={() => setExpandedFolder(expandedFolder === f.id ? null : f.id)}
                      data-testid={`folder-toggle-${f.id}`}
                    >
                      <FolderOpen className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm flex-1">{f.name}</span>
                      <Badge variant="outline">{f.documents.length}</Badge>
                    </button>
                    {expandedFolder === f.id && f.documents.length > 0 && (
                      <div className="ml-6 mt-1 space-y-1">
                        {f.documents.map(doc => (
                          <div
                            key={doc.id}
                            className="flex items-center gap-2 p-2 rounded-md text-sm"
                            data-testid={`doc-row-${doc.id}`}
                          >
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            <span className="flex-1 truncate">{doc.title || doc.fileName}</span>
                            <span className="text-xs text-muted-foreground">{formatFileSize(doc.fileSizeBytes || 0)}</span>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => window.open(`/api/v/bid/${token}/documents/${doc.id}/download`, "_blank")}
                              data-testid={`button-download-${doc.id}`}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {(data.invitation.status === "intends_to_bid") && !isExpired && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base">Submit Your Bid</CardTitle>
                  <CardDescription>Complete the bid form with pricing details</CardDescription>
                </div>
                {!bidFormOpen && (
                  <Button onClick={() => { setBidFormOpen(true); loadBidForm(); }} data-testid="button-open-bid-form">
                    <DollarSign className="w-4 h-4 mr-2" />
                    Prepare Bid
                  </Button>
                )}
              </div>
            </CardHeader>
            {bidFormOpen && bidFormLoading && (
              <CardContent className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-8 w-full" />
              </CardContent>
            )}
            {bidFormOpen && !bidFormLoading && isStructuredForm && (
              <CardContent className="space-y-6">
                {bidFormData.form?.instructions && (
                  <div className="bg-muted/50 rounded-md p-4">
                    <p className="text-sm font-medium mb-1">Instructions</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{bidFormData.form.instructions}</p>
                  </div>
                )}

                {bidFormData.sections.map(section => (
                  <div key={section.id} className="border rounded-md">
                    <button
                      className="w-full flex items-center justify-between p-3 hover-elevate rounded-t-md"
                      onClick={() => toggleSection(section.id)}
                      data-testid={`section-toggle-${section.id}`}
                    >
                      <div className="flex items-center gap-2">
                        {expandedSections.has(section.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <span className="font-medium">{section.title}</span>
                        <Badge variant="outline">{section.sectionType}</Badge>
                        {section.isRequired && <Badge variant="secondary">Required</Badge>}
                      </div>
                      <span className="text-sm font-medium" data-testid={`section-total-${section.id}`}>
                        ${formatCurrency(sectionTotals[section.id] || 0)}
                      </span>
                    </button>

                    {expandedSections.has(section.id) && (
                      <div className="border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-8"></TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Cost Code</TableHead>
                              {bidFormData.form?.allowUnitPricing && <TableHead>UOM</TableHead>}
                              {bidFormData.form?.allowUnitPricing && <TableHead>Qty</TableHead>}
                              {bidFormData.form?.allowUnitPricing && <TableHead>Unit Price</TableHead>}
                              <TableHead>Total Price</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {section.lineItems.map(li => {
                              const val = lineItemValues[li.id] || { unitPrice: "", totalPrice: "", included: true, comment: "" };
                              return (
                                <TableRow key={li.id} className={!val.included ? "opacity-50" : ""} data-testid={`line-item-row-${li.id}`}>
                                  <TableCell>
                                    <input
                                      type="checkbox"
                                      checked={val.included}
                                      onChange={e => updateLineItemValue(li.id, "included", e.target.checked)}
                                      className="rounded"
                                      data-testid={`checkbox-include-${li.id}`}
                                    />
                                  </TableCell>
                                  <TableCell>
                                    <div>
                                      <span className="text-sm">{li.description}</span>
                                      {li.isRequired && <span className="text-destructive ml-1">*</span>}
                                    </div>
                                  </TableCell>
                                  <TableCell>
                                    <span className="text-xs text-muted-foreground">
                                      {li.costCode ? `${li.costCode.code} - ${li.costCode.name}` : "-"}
                                    </span>
                                  </TableCell>
                                  {bidFormData.form?.allowUnitPricing && (
                                    <TableCell className="text-xs text-muted-foreground">{li.uom || "-"}</TableCell>
                                  )}
                                  {bidFormData.form?.allowUnitPricing && (
                                    <TableCell className="text-xs text-muted-foreground">{li.qty || "-"}</TableCell>
                                  )}
                                  {bidFormData.form?.allowUnitPricing && (
                                    <TableCell>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={val.unitPrice}
                                        onChange={e => {
                                          const up = e.target.value;
                                          updateLineItemValue(li.id, "unitPrice", up);
                                          if (li.qty) {
                                            const total = (parseFloat(up) || 0) * (parseFloat(li.qty) || 0);
                                            updateLineItemValue(li.id, "totalPrice", total.toFixed(2));
                                          }
                                        }}
                                        placeholder="0.00"
                                        disabled={!val.included}
                                        className="w-28"
                                        data-testid={`input-unit-price-${li.id}`}
                                      />
                                    </TableCell>
                                  )}
                                  <TableCell>
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={val.totalPrice}
                                      onChange={e => updateLineItemValue(li.id, "totalPrice", e.target.value)}
                                      placeholder="0.00"
                                      disabled={!val.included}
                                      className="w-32"
                                      data-testid={`input-total-price-${li.id}`}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                ))}

                <div className="flex items-center justify-between flex-wrap gap-2 bg-muted/50 rounded-md p-4">
                  <span className="text-lg font-semibold">Grand Total</span>
                  <span className="text-2xl font-bold" data-testid="text-grand-total">${formatCurrency(grandTotal)}</span>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1 block">Notes / Comments</label>
                  <Textarea
                    value={bidNotes}
                    onChange={e => setBidNotes(e.target.value)}
                    placeholder="Add any notes, clarifications, or conditions for your bid..."
                    rows={4}
                    data-testid="textarea-bid-notes"
                  />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => handleStructuredSave("draft")}
                    disabled={savingDraft}
                    data-testid="button-save-draft"
                  >
                    {savingDraft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => handleStructuredSave("submit")}
                    disabled={submitting || grandTotal === 0}
                    data-testid="button-submit-bid"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Submit Bid
                  </Button>
                </div>
              </CardContent>
            )}
            {bidFormOpen && !bidFormLoading && (!bidFormData || bidFormData.legacy) && (
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1 block">Line Items</label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40%]">Description</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead className="w-12"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {legacyLineItems.map((item, idx) => (
                        <TableRow key={idx} data-testid={`line-item-${idx}`}>
                          <TableCell>
                            <Input
                              value={item.description}
                              onChange={e => updateLegacyLineItem(idx, "description", e.target.value)}
                              placeholder="Item description"
                              data-testid={`input-line-desc-${idx}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={e => updateLegacyLineItem(idx, "quantity", e.target.value)}
                              className="w-20"
                              data-testid={`input-line-qty-${idx}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.unitPrice}
                              onChange={e => updateLegacyLineItem(idx, "unitPrice", e.target.value)}
                              placeholder="0.00"
                              data-testid={`input-line-price-${idx}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">${item.total || "0.00"}</TableCell>
                          <TableCell>
                            {legacyLineItems.length > 1 && (
                              <Button size="icon" variant="ghost" onClick={() => setLegacyLineItems(prev => prev.filter((_, i) => i !== idx))} data-testid={`button-remove-line-${idx}`}>
                                <XCircle className="w-4 h-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between flex-wrap gap-2 mt-2">
                    <Button variant="outline" onClick={() => setLegacyLineItems(prev => [...prev, { description: "", quantity: "1", unitPrice: "", total: "" }])} data-testid="button-add-line-item">
                      Add Line Item
                    </Button>
                    <div className="text-lg font-bold" data-testid="text-bid-total">
                      Total: ${legacyTotal.toFixed(2)}
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <label className="text-sm font-medium mb-1 block">Notes / Comments</label>
                  <Textarea
                    value={bidNotes}
                    onChange={e => setBidNotes(e.target.value)}
                    placeholder="Add any notes, clarifications, or conditions for your bid..."
                    rows={4}
                    data-testid="textarea-bid-notes"
                  />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    variant="outline"
                    onClick={() => handleLegacySave("draft")}
                    disabled={savingDraft}
                    data-testid="button-save-draft"
                  >
                    {savingDraft ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Draft
                  </Button>
                  <Button
                    onClick={() => handleLegacySave("submit")}
                    disabled={submitting || legacyTotal === 0}
                    data-testid="button-submit-bid"
                  >
                    {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Submit Bid
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        )}
      </main>

      <footer className="border-t mt-8">
        <div className="max-w-5xl mx-auto px-4 py-4 text-center text-xs text-muted-foreground">
          <p>This is a secure portal. All access is logged and audited.</p>
          <p>Powered by Sentinel + Herbie</p>
        </div>
      </footer>
    </div>
  );
}
