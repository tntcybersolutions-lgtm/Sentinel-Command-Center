import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ShoppingCart, Plus, Search, Building2, Calendar, AlertCircle, CheckCircle2, X, ChevronRight, Send, Pencil, DollarSign, Truck, RefreshCw, Trash2, Store, Package, FileText } from "lucide-react";

interface LineItem { id?: string; description: string; quantity: number; unitCost: number; totalCost?: number; receivedQty?: number; }
interface PO {
  id: string; poNumber: string; vendorId: string; vendorName?: string;
  projectId: string | null; projectName?: string | null;
  status: string; subtotal?: string | number | null; taxAmount?: string | number | null; totalAmount?: string | number | null;
  orderDate?: string | null; expectedDeliveryDate?: string | null; receivedDate?: string | null;
  needsReview?: boolean; notes?: string; internalNotes?: string;
  lineItems?: LineItem[]; isUnlinked?: boolean;
  createdAt: string; updatedAt?: string;
}
interface Project { id: string; name: string; }
interface Vendor { id: string; companyName: string; vendorNumber: string; vendorType?: string; status?: string; }

const STATUS_TONES: Record<string,string> = { draft:"bg-slate-500/15 text-slate-300 border-slate-500/30", issued:"bg-blue-500/15 text-blue-300 border-blue-500/30", sent:"bg-blue-500/15 text-blue-300 border-blue-500/30", received:"bg-emerald-500/15 text-emerald-300 border-emerald-500/30", partial:"bg-amber-500/15 text-amber-300 border-amber-500/30", closed:"bg-slate-600/20 text-slate-400 border-slate-600/30", cancelled:"bg-red-500/15 text-red-300 border-red-500/30" };
function StatusBadge({ status }: { status: string }) { const cls = STATUS_TONES[status] ?? STATUS_TONES.draft; return <Badge variant="outline" className={`${cls} capitalize text-[10px]`}>{status}</Badge>; }
const fmtDate = (d?: string | null) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
const fmtMoney = (n: any) => { const v = Number(n ?? 0); return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }); };

export default function ExecutionPurchaseOrders() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [selected, setSelected] = useState<PO | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; label: string } | null>(null);

  const { data: projects = [] } = useQuery<Project[]>({ queryKey: ["/api/projects"], queryFn: async () => { const r = await fetch("/api/projects"); if (!r.ok) return []; return r.json(); }, staleTime: 60_000 });
  const { data: vendors = [] } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"], queryFn: async () => { const r = await fetch("/api/vendors"); if (!r.ok) return []; return r.json(); }, staleTime: 60_000 });
  const { data: pos = [], isLoading, isError, refetch } = useQuery<PO[]>({ queryKey: ["/api/purchase-orders"], queryFn: async () => { const r = await fetch("/api/purchase-orders"); if (!r.ok) throw new Error("Failed to load POs"); return r.json(); }, staleTime: 30_000 });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<PO> }) => apiRequest("PATCH", `/api/purchase-orders/${id}`, updates),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/purchase-orders"] });
      const prev = queryClient.getQueryData<PO[]>(["/api/purchase-orders"]);
      queryClient.setQueryData<PO[]>(["/api/purchase-orders"], (old = []) => old.map(p => p.id === id ? { ...p, ...updates } : p));
      return { prev };
    },
    onError: (e: any, _v, ctx: any) => { if (ctx?.prev) queryClient.setQueryData(["/api/purchase-orders"], ctx.prev); toast({ title: "Update failed", description: e?.message, variant: "destructive" }); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Purchase order updated" }); },
  });
  const createMutation = useMutation({
    mutationFn: async (po: Partial<PO>) => apiRequest("POST", "/api/purchase-orders", po),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "Purchase order created" }); setCreateOpen(false); },
    onError: (e: any) => toast({ title: "Create failed", description: e?.message ?? "Server rejected the request", variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pos.filter(po => {
      if (projectFilter !== "all" && po.projectId !== projectFilter) return false;
      if (vendorFilter !== "all" && po.vendorId !== vendorFilter) return false;
      if (statusFilter === "needs_review" ? !po.needsReview : statusFilter !== "all" && po.status !== statusFilter) return false;
      if (q && !`${po.poNumber} ${po.vendorName ?? ""} ${po.notes ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pos, search, statusFilter, projectFilter, vendorFilter]);

  const counts = useMemo(() => {
    const scope = pos.filter(p => (projectFilter === "all" || p.projectId === projectFilter) && (vendorFilter === "all" || p.vendorId === vendorFilter));
    const c: Record<string, number> = { all: scope.length, needs_review: scope.filter(p => p.needsReview).length };
    for (const p of scope) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [pos, projectFilter, vendorFilter]);

  const visibleTotal = useMemo(() => filtered.reduce((sum, po) => sum + Number(po.totalAmount ?? 0), 0), [filtered]);
  const activeVendors = useMemo(() => vendors.filter(v => v.status !== "inactive" && v.status !== "archived"), [vendors]);

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="page-execution-purchase-orders">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div><h1 className="text-2xl font-bold flex items-center gap-2"><ShoppingCart className="h-6 w-6 text-purple-400" />Purchase Orders<Badge variant="outline" className="ml-2 text-xs">{fmtMoney(visibleTotal)}</Badge>{counts.needs_review > 0 && <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 ml-2">{counts.needs_review} flagged</Badge>}</h1><p className="text-sm text-muted-foreground">Materials, equipment, and supplier orders across all active projects</p></div>
        <div className="flex items-center gap-2"><Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-2" data-testid="button-refresh"><RefreshCw className="h-4 w-4" /></Button><Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-po"><Plus className="h-4 w-4" />New PO</Button></div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px]"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search by PO #, vendor, notes…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search" /></div>
        <Select value={projectFilter} onValueChange={setProjectFilter}><SelectTrigger className="w-[200px]" data-testid="select-project-filter"><Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="All projects" /></SelectTrigger><SelectContent><SelectItem value="all">All projects ({pos.length})</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>
        <Select value={vendorFilter} onValueChange={setVendorFilter}><SelectTrigger className="w-[200px]" data-testid="select-vendor-filter"><Store className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="All vendors" /></SelectTrigger><SelectContent><SelectItem value="all">All vendors</SelectItem>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {[{ k: "all", l: "All" },{ k: "draft", l: "Draft" },{ k: "issued", l: "Issued" },{ k: "partial", l: "Partial" },{ k: "received", l: "Received" },{ k: "closed", l: "Closed" },{ k: "needs_review", l: "Needs review" }].map(f => (
          <button key={f.k} onClick={() => setStatusFilter(f.k)} data-testid={`chip-${f.k}`} className={`px-2.5 py-1 rounded-full border transition-colors ${statusFilter === f.k ? "bg-purple-500/15 text-purple-300 border-purple-500/40" : "bg-white/[0.02] text-muted-foreground border-white/10 hover:border-white/20"}`}>{f.l}{counts[f.k] != null && <span className="ml-1.5 text-[10px] opacity-70">{counts[f.k]}</span>}</button>
        ))}
      </div>
      <Card><CardHeader className="py-2 px-4 border-b border-white/10"><CardTitle className="text-xs font-medium text-muted-foreground grid grid-cols-12 gap-3"><span className="col-span-2">PO #</span><span className="col-span-3">Vendor</span><span className="col-span-3">Project</span><span className="col-span-2 text-right">Total</span><span className="col-span-1">Delivery</span><span className="col-span-1 text-right">Status</span></CardTitle></CardHeader>
        <CardContent className="p-0">
          {isLoading && <div className="px-6 py-12 text-center text-sm text-muted-foreground">Loading purchase orders…</div>}
          {isError && <div className="px-6 py-12 text-center text-sm"><p className="text-red-400 mb-2">Couldn't load purchase orders</p><Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button></div>}
          {!isLoading && !isError && filtered.length === 0 && <div className="px-6 py-12 text-center text-sm text-muted-foreground">{search ? "No POs match your search." : "No purchase orders yet. Click “New PO” to create one."}</div>}
          {!isLoading && filtered.map((po) => (
            <button key={po.id} onClick={() => setSelected(po)} className="group w-full grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 border-white/10 text-left hover:bg-white/[0.03] transition-colors" data-testid={`row-po-${po.poNumber}`}>
              <div className="col-span-12 md:col-span-2 font-mono text-xs font-semibold text-purple-300 flex items-center gap-1.5">{po.poNumber}{po.needsReview && <Badge variant="outline" className="text-[9px] bg-amber-500/15 text-amber-300 border-amber-500/30 px-1 py-0">Review</Badge>}</div>
              <div className="col-span-12 md:col-span-3"><p className="text-sm font-medium truncate flex items-center gap-1"><Store className="h-3 w-3 text-muted-foreground" />{po.vendorName ?? <span className="text-red-400">Unknown vendor</span>}</p></div>
              <div className="col-span-6 md:col-span-3 text-xs">{po.projectName ? <span className="flex items-center gap-1"><Building2 className="h-3 w-3 text-muted-foreground" />{po.projectName}</span> : <span className="text-amber-400 italic flex items-center gap-1"><AlertCircle className="h-3 w-3" />Unlinked</span>}</div>
              <div className="col-span-6 md:col-span-2 text-xs text-right font-mono font-semibold text-emerald-300">{fmtMoney(po.totalAmount)}</div>
              <div className="col-span-6 md:col-span-1 text-xs text-muted-foreground"><Truck className="h-3 w-3 inline mr-1" />{fmtDate(po.expectedDeliveryDate)}</div>
              <div className="col-span-6 md:col-span-1 flex items-center justify-end gap-1"><StatusBadge status={po.status} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground hidden md:inline" /></div>
            </button>
          ))}
        </CardContent></Card>
      <PoSheet po={selected} onClose={() => setSelected(null)} onSave={(id, updates) => updateMutation.mutate({ id, updates })} saving={updateMutation.isPending} onConfirmAction={(id, status, label) => setConfirmAction({ id, status, label })} vendors={vendors} projects={projects} />
      <CreatePoDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(po) => createMutation.mutate(po)} saving={createMutation.isPending} projects={projects} vendors={activeVendors} defaultProjectId={projectFilter !== "all" ? projectFilter : undefined} />
      <AlertDialog open={!!confirmAction} onOpenChange={(o) => !o && setConfirmAction(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmAction?.label}</AlertDialogTitle><AlertDialogDescription>This will change the status and may notify the vendor. Continue?</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirmAction) { updateMutation.mutate({ id: confirmAction.id, updates: { status: confirmAction.status } }); setConfirmAction(null); } }}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: any; label: string; children: any }) {
  return <div className="space-y-1"><div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground"><Icon className="h-3 w-3" />{label}</div><div>{children}</div></div>;
}

function PoSheet({ po, onClose, onSave, saving, onConfirmAction, vendors, projects }: { po: PO | null; onClose: () => void; onSave: (id: string, updates: Partial<PO>) => void; saving: boolean; onConfirmAction: (id: string, status: string, label: string) => void; vendors: Vendor[]; projects: Project[] }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<PO>>({});
  const [draftLines, setDraftLines] = useState<LineItem[]>([]);
  useEffect(() => { setEditing(false); }, [po?.id]);
  if (!po) return null;
  const lineItems = po.lineItems ?? [];
  const startEdit = () => { setDraft({ vendorId: po.vendorId, projectId: po.projectId, expectedDeliveryDate: po.expectedDeliveryDate ?? "", orderDate: po.orderDate ?? "", notes: po.notes ?? "", taxAmount: po.taxAmount ?? "0" }); setDraftLines(lineItems.map(l => ({ ...l, quantity: Number(l.quantity), unitCost: Number(l.unitCost), totalCost: Number(l.quantity) * Number(l.unitCost) }))); setEditing(true); };
  const computedSubtotal = draftLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const computedTotal = computedSubtotal + Number(draft.taxAmount || 0);
  const save = () => { onSave(po.id, { ...draft, lineItems: draftLines } as any); setEditing(false); };
  const addLine = () => setDraftLines([...draftLines, { description: "", quantity: 1, unitCost: 0 }]);
  const updateLine = (idx: number, patch: Partial<LineItem>) => setDraftLines(draftLines.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) => setDraftLines(draftLines.filter((_, i) => i !== idx));
  return (
    <Sheet open={!!po} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader><div className="flex items-center gap-2 flex-wrap"><span className="font-mono text-sm font-bold text-purple-300">{po.poNumber}</span><StatusBadge status={po.status} />{po.needsReview && <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30">Needs Review</Badge>}{po.isUnlinked && <Badge variant="outline" className="text-[10px] bg-red-500/15 text-red-300 border-red-500/30">Unlinked</Badge>}</div><SheetTitle className="text-lg flex items-center gap-2"><Store className="h-5 w-5 text-purple-400" />{po.vendorName ?? "Unknown vendor"}</SheetTitle><SheetDescription className="flex items-center gap-2 text-xs flex-wrap"><Building2 className="h-3 w-3" />{po.projectName ?? "Unlinked"}<span className="mx-1">•</span>Ordered {fmtDate(po.orderDate)}<span className="mx-1">•</span><Truck className="h-3 w-3" />Delivery {fmtDate(po.expectedDeliveryDate)}</SheetDescription></SheetHeader>
        <div className="py-4 space-y-5">
          <div className="flex flex-wrap gap-2">
            {po.status === "draft" && <Button size="sm" onClick={() => onSave(po.id, { status: "issued" })} disabled={saving} className="gap-2"><Send className="h-3.5 w-3.5" />Issue to vendor</Button>}
            {po.status === "issued" && <Button size="sm" onClick={() => onSave(po.id, { status: "received", receivedDate: new Date().toISOString() } as any)} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Package className="h-3.5 w-3.5" />Mark received</Button>}
            {po.status === "issued" && <Button size="sm" variant="outline" onClick={() => onSave(po.id, { status: "partial" })} disabled={saving} className="gap-2"><Package className="h-3.5 w-3.5" />Partial receipt</Button>}
            {po.status === "partial" && <Button size="sm" onClick={() => onSave(po.id, { status: "received", receivedDate: new Date().toISOString() } as any)} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Package className="h-3.5 w-3.5" />Complete receipt</Button>}
            {po.status === "received" && <Button size="sm" variant="outline" onClick={() => onConfirmAction(po.id, "closed", "Close this PO?")} disabled={saving} className="gap-2"><CheckCircle2 className="h-3.5 w-3.5" />Close out</Button>}
            {po.needsReview && <Button size="sm" variant="outline" onClick={() => onSave(po.id, { needsReview: false } as any)} disabled={saving} className="gap-2 text-amber-300 border-amber-500/30"><CheckCircle2 className="h-3.5 w-3.5" />Mark reviewed</Button>}
            {po.status !== "cancelled" && po.status !== "closed" && <Button size="sm" variant="ghost" onClick={() => onConfirmAction(po.id, "cancelled", "Cancel this PO?")} disabled={saving} className="gap-2 text-muted-foreground"><X className="h-3.5 w-3.5" />Cancel</Button>}
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-2 ml-auto"><Pencil className="h-3.5 w-3.5" />Edit</Button>}
            {editing && (<><Button size="sm" onClick={save} disabled={saving} className="gap-2 ml-auto"><CheckCircle2 className="h-3.5 w-3.5" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button></>)}
          </div>
          {!editing ? (<>
            <Field icon={Package} label={`Line items (${lineItems.length})`}>
              {lineItems.length === 0 ? <p className="text-xs text-muted-foreground italic">No line items recorded.</p> : (
                <div className="rounded border border-white/10 bg-white/[0.02] overflow-hidden">
                  <div className="grid grid-cols-12 gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/5 bg-white/[0.02]"><span className="col-span-6">Description</span><span className="col-span-1 text-right">Qty</span><span className="col-span-2 text-right">Unit</span><span className="col-span-2 text-right">Total</span><span className="col-span-1 text-right">Rcvd</span></div>
                  {lineItems.map((l, i) => (
                    <div key={l.id ?? i} className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-b border-white/5 last:border-b-0"><span className="col-span-6">{l.description}</span><span className="col-span-1 text-right">{Number(l.quantity)}</span><span className="col-span-2 text-right font-mono text-muted-foreground">{fmtMoney(l.unitCost)}</span><span className="col-span-2 text-right font-mono font-semibold">{fmtMoney(l.totalCost ?? Number(l.quantity) * Number(l.unitCost))}</span><span className="col-span-1 text-right text-muted-foreground">{Number(l.receivedQty ?? 0)}</span></div>
                  ))}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-t border-white/10 bg-white/[0.03]"><span className="col-span-9 text-right text-muted-foreground">Subtotal</span><span className="col-span-3 text-right font-mono">{fmtMoney(po.subtotal)}</span></div>
                  {Number(po.taxAmount ?? 0) > 0 && <div className="grid grid-cols-12 gap-2 px-3 py-1 text-xs bg-white/[0.03]"><span className="col-span-9 text-right text-muted-foreground">Tax</span><span className="col-span-3 text-right font-mono">{fmtMoney(po.taxAmount)}</span></div>}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 text-sm bg-white/[0.05] font-semibold"><span className="col-span-9 text-right">Total</span><span className="col-span-3 text-right font-mono text-emerald-300">{fmtMoney(po.totalAmount)}</span></div>
                </div>
              )}
            </Field>
            <div className="grid grid-cols-2 gap-4"><Field icon={Store} label="Vendor">{po.vendorName ?? "—"}</Field><Field icon={Building2} label="Project">{po.projectName ?? <span className="text-amber-400">Unlinked</span>}</Field><Field icon={Calendar} label="Order date">{fmtDate(po.orderDate)}</Field><Field icon={Truck} label="Expected delivery">{fmtDate(po.expectedDeliveryDate)}</Field>{po.receivedDate && <Field icon={Package} label="Received">{fmtDate(po.receivedDate)}</Field>}</div>
            {po.notes && <Field icon={FileText} label="Notes"><p className="text-sm whitespace-pre-wrap leading-relaxed">{po.notes}</p></Field>}
          </>) : (<>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Vendor</Label><Select value={draft.vendorId ?? ""} onValueChange={(v) => setDraft({ ...draft, vendorId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Project</Label><Select value={draft.projectId ?? ""} onValueChange={(v) => setDraft({ ...draft, projectId: v })}><SelectTrigger><SelectValue placeholder="Pick a project" /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid gap-2"><Label>Order date</Label><Input type="date" value={(draft.orderDate ?? "").toString().slice(0,10)} onChange={(e) => setDraft({ ...draft, orderDate: e.target.value || null })} /></div>
              <div className="grid gap-2"><Label>Expected delivery</Label><Input type="date" value={(draft.expectedDeliveryDate ?? "").toString().slice(0,10)} onChange={(e) => setDraft({ ...draft, expectedDeliveryDate: e.target.value || null })} /></div>
              <div className="grid gap-2 col-span-2"><Label>Internal notes</Label><Textarea rows={3} value={draft.notes ?? ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div>
            </div>
            <div className="space-y-2"><div className="flex items-center justify-between"><Label className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />Line items ({draftLines.length})</Label><Button size="sm" variant="outline" onClick={addLine} className="h-7 gap-1"><Plus className="h-3 w-3" />Add line</Button></div>
              <div className="rounded border border-white/10 bg-white/[0.02]"><div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/10"><span className="col-span-6">Description</span><span className="col-span-2 text-right">Qty</span><span className="col-span-2 text-right">Unit cost</span><span className="col-span-2 text-right">Line total</span></div>
                {draftLines.map((ln, i) => { const lineTotal = (Number(ln.quantity) || 0) * (Number(ln.unitCost) || 0); return (
                  <div key={i} className="grid grid-cols-12 gap-2 px-2 py-1 border-b border-white/5 last:border-b-0 items-center"><Input className="col-span-6 h-8 text-xs" placeholder="Description" value={ln.description} onChange={(e) => updateLine(i, { description: e.target.value })} data-testid={`line-desc-${i}`} /><Input className="col-span-2 h-8 text-xs text-right" type="number" step="0.01" value={ln.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} data-testid={`line-qty-${i}`} /><Input className="col-span-2 h-8 text-xs text-right" type="number" step="0.01" value={ln.unitCost} onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })} data-testid={`line-unit-${i}`} /><div className="col-span-1 text-xs text-right font-mono">{fmtMoney(lineTotal)}</div><button className="col-span-1 flex justify-end" onClick={() => removeLine(i)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" /></button></div>
                ); })}
                {draftLines.length === 0 && <p className="text-xs text-muted-foreground italic py-3 text-center">No lines. Click "Add line" above.</p>}
              </div>
              <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-1"><div className="grid grid-cols-12 gap-2 text-xs"><span className="col-span-9 text-right text-muted-foreground">Subtotal</span><span className="col-span-3 text-right font-mono">{fmtMoney(computedSubtotal)}</span></div><div className="grid grid-cols-12 gap-2 text-xs items-center"><span className="col-span-9 text-right text-muted-foreground">Tax</span><Input className="col-span-3 h-7 text-xs text-right" type="number" step="0.01" value={String(draft.taxAmount ?? "0")} onChange={(e) => setDraft({ ...draft, taxAmount: e.target.value })} data-testid="input-tax" /></div><div className="grid grid-cols-12 gap-2 text-sm font-semibold border-t border-white/10 pt-1"><span className="col-span-9 text-right">Total</span><span className="col-span-3 text-right font-mono text-emerald-300">{fmtMoney(computedTotal)}</span></div></div>
            </div>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CreatePoDialog({ open, onClose, onCreate, saving, projects, vendors, defaultProjectId }: { open: boolean; onClose: () => void; onCreate: (po: any) => void; saving: boolean; projects: Project[]; vendors: Vendor[]; defaultProjectId?: string }) {
  const [form, setForm] = useState<any>({ projectId: defaultProjectId, vendorId: "", orderDate: new Date().toISOString().slice(0,10), expectedDeliveryDate: "", taxAmount: "0", notes: "" });
  const [lineItems, setLineItems] = useState<LineItem[]>([{ description: "", quantity: 1, unitCost: 0 }]);
  useEffect(() => { if (open) { setForm({ projectId: defaultProjectId, vendorId: "", orderDate: new Date().toISOString().slice(0,10), expectedDeliveryDate: "", taxAmount: "0", notes: "" }); setLineItems([{ description: "", quantity: 1, unitCost: 0 }]); } }, [open, defaultProjectId]);
  const subtotal = lineItems.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const total = subtotal + Number(form.taxAmount || 0);
  const canSubmit = !!(form.projectId && form.vendorId && lineItems.some(l => l.description && Number(l.quantity) > 0));
  const addLine = () => setLineItems([...lineItems, { description: "", quantity: 1, unitCost: 0 }]);
  const updateLine = (idx: number, patch: Partial<LineItem>) => setLineItems(lineItems.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const removeLine = (idx: number) => setLineItems(lineItems.filter((_, i) => i !== idx));
  const handleCreate = () => onCreate({ ...form, lineItems: lineItems.filter(l => l.description && Number(l.quantity) > 0) });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-new-po">
        <DialogHeader><DialogTitle>New Purchase Order</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label>Project <span className="text-red-400">*</span></Label><Select value={form.projectId ?? ""} onValueChange={(v) => setForm({ ...form, projectId: v })}><SelectTrigger data-testid="select-project"><Building2 className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Pick a project" /></SelectTrigger><SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select>{!form.projectId && <p className="text-[11px] text-amber-400">Required.</p>}</div>
            <div className="grid gap-2"><Label>Vendor <span className="text-red-400">*</span></Label><Select value={form.vendorId ?? ""} onValueChange={(v) => setForm({ ...form, vendorId: v })}><SelectTrigger data-testid="select-vendor"><Store className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue placeholder="Pick a vendor" /></SelectTrigger><SelectContent>{vendors.length === 0 ? <SelectItem value="__none" disabled>No active vendors</SelectItem> : vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.companyName}{v.vendorNumber && <span className="text-muted-foreground ml-1">({v.vendorNumber})</span>}</SelectItem>)}</SelectContent></Select>{!form.vendorId && <p className="text-[11px] text-amber-400">Required — must come from real vendor list.</p>}</div>
            <div className="grid gap-2"><Label>Order date</Label><Input type="date" value={form.orderDate ?? ""} onChange={(e) => setForm({ ...form, orderDate: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Expected delivery</Label><Input type="date" value={form.expectedDeliveryDate ?? ""} onChange={(e) => setForm({ ...form, expectedDeliveryDate: e.target.value })} /></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label className="flex items-center gap-1"><Package className="h-3.5 w-3.5" />Line items <span className="text-red-400">*</span></Label><Button size="sm" variant="outline" onClick={addLine} className="h-7 gap-1" data-testid="button-add-line"><Plus className="h-3 w-3" />Add line</Button></div>
            <div className="rounded border border-white/10 bg-white/[0.02]"><div className="grid grid-cols-12 gap-2 px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground border-b border-white/10"><span className="col-span-6">Description</span><span className="col-span-2 text-right">Qty</span><span className="col-span-2 text-right">Unit cost</span><span className="col-span-2 text-right">Line total</span></div>
              {lineItems.map((ln, i) => { const lineTotal = (Number(ln.quantity) || 0) * (Number(ln.unitCost) || 0); return (
                <div key={i} className="grid grid-cols-12 gap-2 px-2 py-1 border-b border-white/5 last:border-b-0 items-center"><Input className="col-span-6 h-8 text-xs" placeholder="e.g. 1/2&quot; OSB sheathing" value={ln.description} onChange={(e) => updateLine(i, { description: e.target.value })} data-testid={`create-line-desc-${i}`} /><Input className="col-span-2 h-8 text-xs text-right" type="number" step="0.01" value={ln.quantity} onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })} data-testid={`create-line-qty-${i}`} /><Input className="col-span-2 h-8 text-xs text-right" type="number" step="0.01" value={ln.unitCost} onChange={(e) => updateLine(i, { unitCost: Number(e.target.value) })} data-testid={`create-line-unit-${i}`} /><div className="col-span-1 text-xs text-right font-mono">{fmtMoney(lineTotal)}</div><button className="col-span-1 flex justify-end" onClick={() => removeLine(i)} disabled={lineItems.length === 1}><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-400" /></button></div>
              ); })}
            </div>
            <div className="rounded border border-white/10 bg-white/[0.03] p-2 space-y-1"><div className="grid grid-cols-12 gap-2 text-xs"><span className="col-span-9 text-right text-muted-foreground">Subtotal</span><span className="col-span-3 text-right font-mono" data-testid="text-subtotal">{fmtMoney(subtotal)}</span></div><div className="grid grid-cols-12 gap-2 text-xs items-center"><span className="col-span-9 text-right text-muted-foreground">Tax</span><Input className="col-span-3 h-7 text-xs text-right" type="number" step="0.01" value={String(form.taxAmount ?? "0")} onChange={(e) => setForm({ ...form, taxAmount: e.target.value })} data-testid="create-input-tax" /></div><div className="grid grid-cols-12 gap-2 text-sm font-semibold border-t border-white/10 pt-1"><span className="col-span-9 text-right">Total</span><span className="col-span-3 text-right font-mono text-emerald-300" data-testid="text-total">{fmtMoney(total)}</span></div></div>
          </div>
          <div className="grid gap-2"><Label>Notes (internal)</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <DialogFooter><Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button><Button onClick={handleCreate} disabled={!canSubmit || saving} data-testid="button-create-po" className="gap-2">{saving ? "Creating…" : <><Plus className="h-4 w-4" />Create PO</>}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
