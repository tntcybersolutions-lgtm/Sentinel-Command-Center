import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Search, ChevronRight, Calendar, Building2, CheckCircle2, Send, Pencil, X, Truck, AlertCircle } from "lucide-react";

interface PO { id: string; poNumber: string; vendorId?: string; vendorName?: string; projectId: string; projectName?: string; status: string; totalAmount?: string | number | null; orderDate?: string | null; description?: string | null; needsReview?: boolean; isUnlinked?: boolean; }

const STATUS_TONES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  draft: { bg: "bg-zinc-500/15", text: "text-zinc-300", border: "border-zinc-500/30", label: "Draft" },
  issued: { bg: "bg-blue-500/15", text: "text-blue-300", border: "border-blue-500/30", label: "Issued" },
  received: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/30", label: "Received" },
  closed: { bg: "bg-green-500/15", text: "text-green-300", border: "border-green-500/30", label: "Closed" },
  cancelled: { bg: "bg-red-500/15", text: "text-red-300", border: "border-red-500/30", label: "Cancelled" },
};

function StatusBadge({ status }: { status: string }) { const tone = STATUS_TONES[status] ?? STATUS_TONES.draft; return <Badge variant="outline" className={`text-[10px] h-5 px-2 ${tone.bg} ${tone.text} ${tone.border} font-semibold uppercase tracking-wide`}>{tone.label}</Badge>; }
function fmtDate(s?: string | null): string { if (!s) return "—"; const d = new Date(s); if (isNaN(d.getTime())) return "—"; return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" }); }
function fmtMoney(v: string | number | null | undefined): string { if (v == null) return "—"; const n = typeof v === "string" ? parseFloat(v) : v; if (isNaN(n)) return "—"; return "$" + n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function ExecutionPurchaseOrders() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PO | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const { data: pos = [], isLoading } = useQuery<PO[]>({ queryKey: ["/api/purchase-orders"], queryFn: async () => { const r = await fetch("/api/purchase-orders"); if (!r.ok) return []; return r.json(); }, staleTime: 30_000 });
  const counts = useMemo(() => { const c: Record<string, number> = { all: pos.length, draft: 0, issued: 0, received: 0, closed: 0, review: 0 }; for (const p of pos) { c[p.status] = (c[p.status] || 0) + 1; if (p.needsReview) c.review++; } return c; }, [pos]);
  const filtered = useMemo(() => { let list = pos; if (filter === "review") list = list.filter(p => p.needsReview); else if (filter !== "all") list = list.filter(p => p.status === filter); if (search.trim()) { const q = search.toLowerCase(); list = list.filter(p => p.poNumber.toLowerCase().includes(q) || (p.vendorName || "").toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)); } return list; }, [pos, filter, search]);
  const totalValue = useMemo(() => { return filtered.reduce((sum, p) => { const v = typeof p.totalAmount === "string" ? parseFloat(p.totalAmount) : (p.totalAmount || 0); return sum + (isNaN(v as number) ? 0 : (v as number)); }, 0); }, [filtered]);
  const updateMutation = useMutation({ mutationFn: async ({ id, updates }: { id: string; updates: Partial<PO> }) => apiRequest("PATCH", `/api/purchase-orders/${id}`, updates), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "PO updated" }); }, onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }) });
  const createMutation = useMutation({ mutationFn: async (p: Partial<PO>) => apiRequest("POST", "/api/purchase-orders", p), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/purchase-orders"] }); queryClient.invalidateQueries({ queryKey: ["/api/nav-counts"] }); toast({ title: "PO created" }); setCreateOpen(false); }, onError: (e: any) => toast({ title: "Create failed", description: e?.message, variant: "destructive" }) });

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center ring-1 ring-purple-500/30"><ShoppingCart className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight">Purchase Orders</h1><p className="text-xs text-muted-foreground">{counts.all} POs • <span className="font-mono font-semibold text-foreground">{fmtMoney(totalValue)}</span> visible</p></div></div><Button onClick={() => setCreateOpen(true)} className="gap-2" data-testid="button-new-po"><Plus className="h-4 w-4" />New PO</Button></div>
      <div className="flex flex-wrap items-center gap-2">{[["all", "All"], ["issued", "Issued"], ["received", "Received"], ["draft", "Draft"], ["closed", "Closed"], ["review", "Needs review"]].map(([key, label]) => (<Button key={key} variant={filter === key ? "default" : "outline"} size="sm" onClick={() => setFilter(key)} className="gap-2" data-testid={`filter-${key}`}>{label}<Badge variant="secondary" className="font-mono tabular-nums text-[10px] h-4 px-1.5">{counts[key] ?? 0}</Badge></Button>))}<div className="relative flex-1 min-w-[200px] max-w-md ml-auto"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><Input placeholder="Search POs…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" data-testid="input-search-pos" /></div></div>
      <Card className="bg-card/80 border-white/10 shadow-lg"><CardContent className="p-0">
        <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 border-b border-white/10 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold"><div className="col-span-2">PO #</div><div className="col-span-3">Vendor</div><div className="col-span-2">Project</div><div className="col-span-2 text-right">Amount</div><div className="col-span-2">Order date</div><div className="col-span-1 text-right">Status</div></div>
        {isLoading && [0,1,2,3,4].map(i => (<div key={i} className="px-4 py-3 border-b last:border-b-0 border-white/10"><Skeleton className="h-4 w-full" /></div>))}
        {!isLoading && filtered.length === 0 && (<div className="px-6 py-12 text-center text-sm text-muted-foreground">{search ? "No POs match your search." : "No POs. Click “New PO” to create one."}</div>)}
        {!isLoading && filtered.map((p) => (
          <button key={p.id} onClick={() => setSelected(p)} className="group w-full grid grid-cols-12 gap-3 px-4 py-3 border-b last:border-b-0 border-white/10 text-left hover:bg-white/[0.03] transition-colors" data-testid={`row-po-${p.poNumber}`}>
            <div className="col-span-12 md:col-span-2 font-mono text-xs font-semibold text-purple-300 flex items-center gap-2">{p.poNumber}{p.needsReview && <AlertCircle className="h-3 w-3 text-amber-400" />}</div>
            <div className="col-span-12 md:col-span-3"><p className="text-sm font-medium truncate">{p.vendorName || (p.isUnlinked ? "Unlinked vendor" : "—")}</p>{p.description && <p className="text-xs text-muted-foreground line-clamp-1">{p.description}</p>}</div>
            <div className="col-span-6 md:col-span-2 text-xs text-muted-foreground truncate"><Building2 className="h-3 w-3 inline mr-1" />{p.projectName ?? "—"}</div>
            <div className="col-span-6 md:col-span-2 text-right font-mono text-sm font-semibold">{fmtMoney(p.totalAmount)}</div>
            <div className="col-span-6 md:col-span-2 text-xs text-muted-foreground"><Calendar className="h-3 w-3 inline mr-1" />{fmtDate(p.orderDate)}</div>
            <div className="col-span-6 md:col-span-1 flex items-center justify-end gap-1"><StatusBadge status={p.status} /><ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground hidden md:inline" /></div>
          </button>
        ))}
      </CardContent></Card>
      <PODetail po={selected} onClose={() => setSelected(null)} onSave={(id, updates) => updateMutation.mutate({ id, updates })} saving={updateMutation.isPending} />
      <CreateDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreate={(p) => createMutation.mutate(p)} saving={createMutation.isPending} />
    </div>
  );
}

function PODetail({ po, onClose, onSave, saving }: { po: PO | null; onClose: () => void; onSave: (id: string, updates: Partial<PO>) => void; saving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<PO>>({});
  if (!po) return null;
  const startEdit = () => { setDraft({ vendorName: po.vendorName, description: po.description ?? "", status: po.status, totalAmount: po.totalAmount, orderDate: po.orderDate ?? "" }); setEditing(true); };
  const save = () => { onSave(po.id, draft); setEditing(false); };
  const transition = (status: string) => onSave(po.id, { status });
  return (
    <Sheet open={!!po} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader><div className="flex items-center gap-2"><span className="font-mono text-sm font-bold text-purple-300">{po.poNumber}</span><StatusBadge status={po.status} />{po.needsReview && <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30">Needs review</Badge>}</div><SheetTitle className="text-lg">{po.vendorName || "Unlinked vendor"}</SheetTitle><SheetDescription className="flex items-center gap-2 text-xs"><Building2 className="h-3 w-3" />{po.projectName ?? "Unknown project"}<span className="mx-1">•</span><Calendar className="h-3 w-3" />{fmtDate(po.orderDate)}</SheetDescription></SheetHeader>
        <div className="py-4 space-y-5">
          <div className="text-center py-4 border-y border-white/10"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Total Amount</p><p className="text-3xl font-mono font-bold tabular-nums">{fmtMoney(po.totalAmount)}</p></div>
          <div className="flex flex-wrap gap-2">
            {po.status === "draft" && <Button size="sm" onClick={() => transition("issued")} disabled={saving} className="gap-2"><Send className="h-3.5 w-3.5" />Issue PO</Button>}
            {po.status === "issued" && <Button size="sm" onClick={() => transition("received")} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Truck className="h-3.5 w-3.5" />Mark received</Button>}
            {po.status === "received" && <Button size="sm" variant="outline" onClick={() => transition("closed")} disabled={saving} className="gap-2"><CheckCircle2 className="h-3.5 w-3.5" />Close out</Button>}
            {!editing && <Button size="sm" variant="outline" onClick={startEdit} className="gap-2 ml-auto"><Pencil className="h-3.5 w-3.5" />Edit</Button>}
            {editing && (<><Button size="sm" onClick={save} disabled={saving} className="gap-2 ml-auto"><CheckCircle2 className="h-3.5 w-3.5" />Save</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}><X className="h-3.5 w-3.5" /></Button></>)}
          </div>
          {!editing ? (<Field label="Description">{po.description ? <p className="text-sm whitespace-pre-wrap leading-relaxed">{po.description}</p> : <p className="text-sm text-muted-foreground italic">No description.</p>}</Field>) : (<>
            <div className="grid gap-2"><Label>Vendor name</Label><Input value={draft.vendorName ?? ""} onChange={(e) => setDraft({ ...draft, vendorName: e.target.value })} /></div>
            <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>Total amount</Label><Input type="number" step="0.01" value={String(draft.totalAmount ?? "")} onChange={(e) => setDraft({ ...draft, totalAmount: e.target.value })} /></div><div className="grid gap-2"><Label>Order date</Label><Input type="date" value={(draft.orderDate ?? "").slice(0,10)} onChange={(e) => setDraft({ ...draft, orderDate: e.target.value || null })} /></div></div>
          </>)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return (<div className="space-y-1"><p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p><div className="text-sm">{children}</div></div>); }

function CreateDialog({ open, onClose, onCreate, saving }: { open: boolean; onClose: () => void; onCreate: (p: Partial<PO>) => void; saving: boolean }) {
  const [form, setForm] = useState<Partial<PO>>({ poNumber: "", vendorName: "", description: "", status: "draft", totalAmount: "" });
  const submit = (e: React.FormEvent) => { e.preventDefault(); if (!form.vendorName?.trim()) return; onCreate({ ...form, poNumber: form.poNumber || `PO-${Date.now().toString().slice(-6)}` }); setForm({ poNumber: "", vendorName: "", description: "", status: "draft", totalAmount: "" }); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg"><DialogHeader><DialogTitle>New PO</DialogTitle><DialogDescription>Create a new purchase order.</DialogDescription></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4"><div className="grid gap-2"><Label>PO Number</Label><Input value={form.poNumber ?? ""} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} placeholder="Auto if blank" /></div><div className="grid gap-2"><Label>Total amount</Label><Input type="number" step="0.01" value={String(form.totalAmount ?? "")} onChange={(e) => setForm({ ...form, totalAmount: e.target.value })} placeholder="0.00" /></div></div>
          <div className="grid gap-2"><Label>Vendor name *</Label><Input required value={form.vendorName ?? ""} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} placeholder="e.g. ABC Steel Supply" /></div>
          <div className="grid gap-2"><Label>Description</Label><Textarea rows={3} value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Scope of purchase" /></div>
          <div className="grid gap-2"><Label>Order date</Label><Input type="date" value={(form.orderDate ?? "").slice(0,10)} onChange={(e) => setForm({ ...form, orderDate: e.target.value || null })} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || !form.vendorName?.trim()} className="gap-2"><Plus className="h-4 w-4" />{saving ? "Creating…" : "Create PO"}</Button></DialogFooter>
        </form></DialogContent>
    </Dialog>
  );
}
