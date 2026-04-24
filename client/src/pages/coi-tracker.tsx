import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { AlertTriangle, CheckCircle, Clock, Plus, RefreshCw, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, differenceInDays } from "date-fns";

interface CoiCertificate {
  id: number;
  tenantId: string;
  projectId?: number;
  vendorId?: number;
  policyType: string;
  carrier?: string;
  policyNumber?: string;
  limitsJson?: Record<string, unknown>;
  effectiveDate?: string;
  expiryDate?: string;
  documentId?: number;
  status: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

interface CoiWithTier {
  coi: CoiCertificate;
  tier: string;
  severity: string;
}

const TIER_CONFIG: Record<string, { label: string; color: string; icon: typeof AlertTriangle; bgClass: string }> = {
  expired: { label: "Expired", color: "text-red-700", icon: AlertTriangle, bgClass: "bg-red-50 border-red-200" },
  critical_1d: { label: "Expires Tomorrow", color: "text-red-600", icon: AlertTriangle, bgClass: "bg-red-50 border-red-200" },
  critical_7d: { label: "Expires in 7 days", color: "text-orange-600", icon: AlertTriangle, bgClass: "bg-orange-50 border-orange-200" },
  warning_14d: { label: "Expires in 14 days", color: "text-amber-600", icon: Clock, bgClass: "bg-amber-50 border-amber-200" },
  warning_30d: { label: "Expires in 30 days", color: "text-yellow-600", icon: Clock, bgClass: "bg-yellow-50 border-yellow-200" },
  ok: { label: "Current", color: "text-green-600", icon: CheckCircle, bgClass: "bg-green-50 border-green-200" },
};

const POLICY_TYPES = ["gl", "wc", "auto", "umbrella", "professional", "pollution", "builders_risk"];
const POLICY_LABELS: Record<string, string> = {
  gl: "General Liability",
  wc: "Workers Comp",
  auto: "Auto",
  umbrella: "Umbrella",
  professional: "Professional Liability",
  pollution: "Pollution",
  builders_risk: "Builder's Risk",
};

function getTierForCoi(coi: CoiCertificate): string {
  if (!coi.expiryDate) return "ok";
  const days = differenceInDays(parseISO(coi.expiryDate), new Date());
  if (days < 0) return "expired";
  if (days <= 1) return "critical_1d";
  if (days <= 7) return "critical_7d";
  if (days <= 14) return "warning_14d";
  if (days <= 30) return "warning_30d";
  return "ok";
}

function CoiBadge({ tier }: { tier: string }) {
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.ok;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.bgClass} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function AddCoiDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    policyType: "gl",
    carrier: "",
    policyNumber: "",
    effectiveDate: "",
    expiryDate: "",
    notes: "",
  });
  const { toast } = useToast();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/coi", data),
    onSuccess: () => {
      toast({ title: "COI added successfully" });
      qc.invalidateQueries({ queryKey: ["/api/coi"] });
      setOpen(false);
      onSuccess();
    },
    onError: () => toast({ title: "Failed to add COI", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="w-4 h-4" /> Add Certificate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add COI Certificate</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Policy Type</Label>
            <Select value={form.policyType} onValueChange={v => setForm(f => ({ ...f, policyType: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {POLICY_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{POLICY_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Carrier</Label>
            <Input value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))} placeholder="e.g. Acme Insurance" />
          </div>
          <div>
            <Label>Policy Number</Label>
            <Input value={form.policyNumber} onChange={e => setForm(f => ({ ...f, policyNumber: e.target.value }))} placeholder="GL-123456" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Effective Date</Label>
              <Input type="date" value={form.effectiveDate} onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={e => setForm(f => ({ ...f, expiryDate: e.target.value }))} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional notes" />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate(form)} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding..." : "Add Certificate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CoiTracker() {
  const [filterTier, setFilterTier] = useState<string>("all");
  const qc = useQueryClient();

  const { data: expiring, isLoading, refetch } = useQuery<CoiCertificate[]>({
    queryKey: ["/api/coi/expiring/365"],
    queryFn: async (): Promise<CoiCertificate[]> => { const r = await apiRequest("GET", "/api/coi/expiring/365"); const data = await r.json(); return (data.rows ?? data) as CoiCertificate[]; },
  });

  const coisWithTier: CoiWithTier[] = (expiring ?? []).map(coi => ({
    coi,
    tier: getTierForCoi(coi),
    severity: TIER_CONFIG[getTierForCoi(coi)]?.label ?? "ok",
  }));

  const filtered = filterTier === "all" ? coisWithTier : coisWithTier.filter(c => c.tier === filterTier);

  // Summary counts
  const counts = {
    total: coisWithTier.length,
    expired: coisWithTier.filter(c => c.tier === "expired").length,
    critical: coisWithTier.filter(c => c.tier === "critical_1d" || c.tier === "critical_7d").length,
    warning: coisWithTier.filter(c => c.tier === "warning_14d" || c.tier === "warning_30d").length,
    ok: coisWithTier.filter(c => c.tier === "ok").length,
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" />
            COI Tracker
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Certificate of Insurance monitoring — Herbie alerts at 30, 14, 7, and 1 day before expiry
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
          <AddCoiDialog onSuccess={() => refetch()} />
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "Expired", count: counts.expired, color: "text-red-700 bg-red-50 border-red-200" },
          { label: "Critical", count: counts.critical, color: "text-orange-600 bg-orange-50 border-orange-200" },
          { label: "Warning", count: counts.warning, color: "text-amber-600 bg-amber-50 border-amber-200" },
          { label: "Current", count: counts.ok, color: "text-green-700 bg-green-50 border-green-200" },
        ].map(({ label, count, color }) => (
          <Card key={label} className={`border ${color.includes("red") ? "border-red-200" : color.includes("orange") ? "border-orange-200" : color.includes("amber") ? "border-amber-200" : "border-green-200"}`}>
            <CardContent className="pt-4 pb-3 text-center">
              <div className={`text-2xl font-bold ${color.split(" ")[0]}`}>{count}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        <Button variant={filterTier === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterTier("all")}>
          All ({counts.total})
        </Button>
        {Object.entries(TIER_CONFIG).map(([tier, cfg]) => {
          const count = coisWithTier.filter(c => c.tier === tier).length;
          if (count === 0) return null;
          return (
            <Button key={tier} variant={filterTier === tier ? "default" : "outline"} size="sm" onClick={() => setFilterTier(tier)}>
              {cfg.label} ({count})
            </Button>
          );
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center text-muted-foreground py-12">Loading certificates...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No certificates found</p>
            <p className="text-sm mt-1">Add a COI certificate to start tracking expiration dates.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ coi, tier }) => {
            const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.ok;
            return (
              <Card key={coi.id} className={`border ${cfg.bgClass}`}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div>
                        <div className="font-medium text-sm">
                          {POLICY_LABELS[coi.policyType] ?? coi.policyType}
                          {coi.carrier && <span className="text-muted-foreground font-normal"> · {coi.carrier}</span>}
                        </div>
                        {coi.policyNumber && (
                          <div className="text-xs text-muted-foreground">#{coi.policyNumber}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {coi.expiryDate && (
                        <div className="text-right">
                          <div className="text-xs text-muted-foreground">Expires</div>
                          <div className="text-sm font-medium">{format(parseISO(coi.expiryDate), "MMM d, yyyy")}</div>
                        </div>
                      )}
                      <CoiBadge tier={tier} />
                    </div>
                  </div>
                  {coi.notes && (
                    <p className="text-xs text-muted-foreground mt-2 border-t pt-2">{coi.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
