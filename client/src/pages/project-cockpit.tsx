import { useState } from "react";
import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  FileQuestion, FileCheck, ArrowLeftRight, ClipboardList, ListChecks, Bot,
  Loader2, Play, ChevronDown, ChevronRight, AlertTriangle, Clock, CheckCircle2,
  XCircle, ArrowUp, ArrowRight, Minus, Brain, Lightbulb, GitBranch, Zap,
  Plus, Shield, ExternalLink, Send,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

type TabId = "rfis" | "submittals" | "change-orders" | "daily-logs" | "tasks" | "agent-reports" | "herbie-memory";

const TABS: { id: TabId; label: string; icon: typeof FileQuestion }[] = [
  { id: "rfis", label: "RFIs", icon: FileQuestion },
  { id: "submittals", label: "Submittals", icon: FileCheck },
  { id: "change-orders", label: "Change Orders", icon: ArrowLeftRight },
  { id: "daily-logs", label: "Daily Reports", icon: ClipboardList },
  { id: "tasks", label: "Tasks", icon: ListChecks },
  { id: "agent-reports", label: "Agent Reports", icon: Bot },
  { id: "herbie-memory", label: "Memory", icon: Brain },
];

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function daysSince(d: string | Date | null | undefined): number {
  if (!d) return 0;
  return Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24)));
}

function StatusPill({ status }: { status: string }) {
  const colors: Record<string, string> = {
    open: "text-amber-400 border-amber-400/30",
    submitted: "text-blue-400 border-blue-400/30",
    approved: "text-emerald-400 border-emerald-400/30",
    rejected: "text-red-400 border-red-400/30",
    closed: "text-zinc-400 border-zinc-400/30",
    pending: "text-amber-400 border-amber-400/30",
    draft: "text-zinc-500 border-zinc-500/30",
    not_started: "text-zinc-400 border-zinc-400/30",
    in_progress: "text-blue-400 border-blue-400/30",
    completed: "text-emerald-400 border-emerald-400/30",
    voided: "text-zinc-600 border-zinc-600/30",
    success: "text-emerald-400 border-emerald-400/30",
  };
  const c = colors[status] || "text-zinc-400 border-zinc-400/30";
  return (
    <span data-testid={`status-${status}`} className={`px-2 py-0.5 text-xs font-mono border ${c} bg-black/30`}>
      {status.replace(/_/g, " ").toUpperCase()}
    </span>
  );
}

function PriorityIcon({ priority }: { priority: string | null | undefined }) {
  if (priority === "urgent" || priority === "critical") return <ArrowUp className="w-3.5 h-3.5 text-red-400" />;
  if (priority === "high") return <ArrowUp className="w-3.5 h-3.5 text-amber-400" />;
  if (priority === "normal" || priority === "medium") return <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />;
  return <Minus className="w-3.5 h-3.5 text-zinc-600" />;
}

function CountBadge({ label, count, accent }: { label: string; count: number; accent?: string }) {
  return (
    <div data-testid={`count-${label.toLowerCase().replace(/\s/g, "-")}`} className="border border-white/10 bg-black/30 px-4 py-2 flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">{label}</span>
      <span className={`text-xl font-mono font-bold ${accent || "text-white"}`}>{count}</span>
    </div>
  );
}

// Feature 9 polish — Herbie proactive digest card.
// Consumes /api/herbie/digest/:projectId and renders the top items
// Herbie would surface to the PM. Collapsed by default to save
// vertical space; tapping the count expands the full list.
interface DigestItem {
  severity: "critical" | "high" | "medium" | "low";
  category: "coi" | "approval" | "rfi" | "submittal";
  headline: string;
  detail?: string;
  suggestedAction?: string;
}
interface DigestPayload {
  generatedAt: string;
  totals: { critical: number; high: number; medium: number; low: number };
  items: DigestItem[];
}
function HerbieDigestCard({ projectId }: { projectId: string }) {
  const [expanded, setExpanded] = useState(false);
  const { data } = useQuery<DigestPayload>({
    queryKey: ["/api/herbie/digest", projectId],
    queryFn: () => fetch(`/api/herbie/digest/${projectId}`).then((r) => r.json()),
  });
  if (!data) return null;
  const { totals, items } = data;
  const total = items.length;
  if (total === 0) {
    return (
      <div className="mx-6 my-3 border border-emerald-500/20 bg-emerald-500/5 px-4 py-2 flex items-center gap-2">
        <Bot className="w-4 h-4 text-emerald-400" />
        <span className="text-xs font-mono text-emerald-400">
          Herbie: Nothing on fire right now. Carry on.
        </span>
      </div>
    );
  }
  const sevColor: Record<DigestItem["severity"], string> = {
    critical: "text-red-400 border-red-500/30 bg-red-500/5",
    high: "text-orange-400 border-orange-500/30 bg-orange-500/5",
    medium: "text-amber-400 border-amber-500/30 bg-amber-500/5",
    low: "text-zinc-400 border-zinc-500/30 bg-zinc-500/5",
  };
  const leadSev = items[0].severity;
  const headerColor = sevColor[leadSev];
  return (
    <div className={`mx-6 my-3 border ${headerColor} px-4 py-3`} data-testid="herbie-digest">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 text-left"
        data-testid="herbie-digest-toggle"
      >
        <Bot className="w-4 h-4 shrink-0" />
        <span className="text-xs font-mono truncate flex-1">
          Herbie: {items[0].headline}
        </span>
        <span className="text-[10px] font-mono text-zinc-400 shrink-0">
          {totals.critical > 0 && <span className="text-red-400 mr-2">{totals.critical} crit</span>}
          {totals.high > 0 && <span className="text-orange-400 mr-2">{totals.high} high</span>}
          {totals.medium > 0 && <span className="text-amber-400 mr-2">{totals.medium} med</span>}
          {totals.low > 0 && <span className="text-zinc-400">{totals.low} low</span>}
        </span>
        {expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
      </button>
      {expanded && (
        <ul className="mt-3 space-y-2" data-testid="herbie-digest-items">
          {items.map((item, i) => (
            <li key={i} className={`border ${sevColor[item.severity]} px-3 py-2`}>
              <div className="text-xs font-mono">{item.headline}</div>
              {item.detail && <div className="text-[10px] font-mono text-zinc-500 mt-0.5">{item.detail}</div>}
              {item.suggestedAction && (
                <div className="text-[10px] font-mono text-zinc-400 mt-1">
                  → {item.suggestedAction}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Feature 3 / 9 — COI rollup card. Green when everything's OK, amber
// when something's in the 30-day warning window, red when anything
// is inside 7 days or already expired. The individual-tier counts
// render as small pills below the total so a PM can see the shape
// at a glance.
interface CoiRollup {
  total?: number;
  expired?: number;
  critical_1d?: number;
  critical_7d?: number;
  warning_14d?: number;
  warning_30d?: number;
  ok?: number;
}
function CoiRollupBadge({ rollup }: { rollup?: CoiRollup }) {
  const r = rollup ?? {};
  const total = r.total ?? 0;
  const expired = r.expired ?? 0;
  const crit = (r.critical_1d ?? 0) + (r.critical_7d ?? 0);
  const warn = (r.warning_14d ?? 0) + (r.warning_30d ?? 0);
  const ok = r.ok ?? 0;
  const severity =
    expired > 0 || r.critical_1d ? "red" :
    crit > 0 ? "red" :
    warn > 0 ? "amber" :
    "green";
  const accentByBand: Record<string, string> = {
    red: "text-red-400",
    amber: "text-amber-400",
    green: "text-emerald-400",
  };
  const accent = accentByBand[severity];
  return (
    <div
      data-testid="count-coi"
      className="border border-white/10 bg-black/30 px-4 py-2 flex flex-col"
      title={`Expired ${expired} · Critical ${crit} · Warning ${warn} · OK ${ok}`}
    >
      <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
        COIs
      </span>
      <div className="flex items-baseline gap-2">
        <span className={`text-xl font-mono font-bold ${accent}`}>{total}</span>
        <span className="text-[10px] font-mono text-zinc-500">
          {expired > 0 && <span className="text-red-400">{expired}exp </span>}
          {crit > 0 && <span className="text-red-400">{crit}crit </span>}
          {warn > 0 && <span className="text-amber-400">{warn}warn</span>}
          {total === 0 && <span>no policies</span>}
        </span>
      </div>
    </div>
  );
}

// Roadmap Feature 3 — COI Status card with click-to-open slide-over.
//
// The card itself is a button that opens a Sheet (slide-over) showing
// every active COI for this project pulled from
// GET /api/projects/:projectId/coi (the spec-mandated endpoint —
// non-expired only). The card surface still shows Red/Yellow/Green
// counts so the PM can read severity at a glance:
//   Red    = expired (count from rollup, even though the spec'd GET
//            filters them out — kept for the rollup-tile contract)
//   Yellow = expiring within 30 days
//   Green  = current
//
// Inside the Sheet:
//   - One row per COI with vendor name, policy type, carrier,
//     expiry date, days-until-expiry, and a status/tier badge.
//   - "Add COI" button opens a small Dialog that POSTs to
//     /api/projects/:projectId/coi.
//   - Footer link punts to the full /coi tracker filtered to project.
interface ProjectCoiRow {
  id: string;
  projectId: string | null;
  vendorId: string | null;
  policyType: string;
  carrier: string | null;
  policyNumber: string | null;
  expiryDate: string;
  effectiveDate: string | null;
  status: string;
  tier: "expired" | "critical_1d" | "critical_7d" | "warning_14d" | "warning_30d" | "ok";
  severity?: string;
}
interface ProjectCoiPayload {
  rows: ProjectCoiRow[];
  rollup: {
    total: number;
    expired: number;
    critical_1d: number;
    critical_7d: number;
    warning_14d: number;
    warning_30d: number;
    ok: number;
  };
}
interface VendorRow {
  id: string;
  companyName: string;
}

const POLICY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "gl", label: "General Liability" },
  { value: "wc", label: "Workers Comp" },
  { value: "auto", label: "Auto" },
  { value: "umbrella", label: "Umbrella" },
  { value: "professional", label: "Professional Liability" },
  { value: "pollution", label: "Pollution" },
  { value: "builders_risk", label: "Builder's Risk" },
];
const POLICY_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  POLICY_TYPE_OPTIONS.map((o) => [o.value, o.label]),
);

const TIER_BADGE: Record<string, { label: string; className: string }> = {
  expired:      { label: "EXPIRED",  className: "text-red-300 border-red-500/40 bg-red-500/10" },
  critical_1d:  { label: "<1 DAY",   className: "text-red-300 border-red-500/40 bg-red-500/10" },
  critical_7d:  { label: "<7 DAYS",  className: "text-orange-300 border-orange-500/40 bg-orange-500/10" },
  warning_14d:  { label: "<14 DAYS", className: "text-amber-300 border-amber-500/40 bg-amber-500/10" },
  warning_30d:  { label: "<30 DAYS", className: "text-yellow-300 border-yellow-500/40 bg-yellow-500/10" },
  ok:           { label: "CURRENT",  className: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10" },
};

function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

function AddCoiDialog({
  open,
  onOpenChange,
  projectId,
  vendors,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  vendors: VendorRow[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [policyType, setPolicyType] = useState("gl");
  const [vendorId, setVendorId] = useState<string>("none");
  const [carrier, setCarrier] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

  const createCoi = useMutation({
    mutationFn: async () => {
      const resp = await apiRequest("POST", `/api/projects/${projectId}/coi`, {
        policyType,
        vendorId: vendorId === "none" ? null : vendorId,
        carrier: carrier || null,
        policyNumber: policyNumber || null,
        effectiveDate: effectiveDate || null,
        expiryDate,
      });
      return resp.json();
    },
    onSuccess: () => {
      toast({ title: "COI added", description: "Certificate saved to project file." });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "coi"] });
      qc.invalidateQueries({ queryKey: ["/api/coi/expiring", 365] });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "cockpit"] });
      onOpenChange(false);
      setCarrier("");
      setPolicyNumber("");
      setEffectiveDate("");
      setExpiryDate("");
      setVendorId("none");
      setPolicyType("gl");
    },
    onError: (err: any) => {
      toast({ title: "Failed to add COI", description: err?.message ?? "Server error", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-add-coi" className="bg-[#0f0f17] border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">Add Certificate of Insurance</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="coi-vendor" className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Vendor</Label>
            <Select value={vendorId} onValueChange={setVendorId}>
              <SelectTrigger id="coi-vendor" data-testid="select-vendor" className="bg-black/40 border-white/10">
                <SelectValue placeholder="Select vendor (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No vendor —</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="coi-policy-type" className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Policy Type *</Label>
            <Select value={policyType} onValueChange={setPolicyType}>
              <SelectTrigger id="coi-policy-type" data-testid="select-policy-type" className="bg-black/40 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLICY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="coi-carrier" className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Carrier</Label>
              <Input id="coi-carrier" data-testid="input-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="bg-black/40 border-white/10" />
            </div>
            <div>
              <Label htmlFor="coi-policy-number" className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Policy #</Label>
              <Input id="coi-policy-number" data-testid="input-policy-number" value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} className="bg-black/40 border-white/10" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="coi-effective" className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Effective</Label>
              <Input id="coi-effective" data-testid="input-effective-date" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="bg-black/40 border-white/10" />
            </div>
            <div>
              <Label htmlFor="coi-expiry" className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">Expiry *</Label>
              <Input id="coi-expiry" data-testid="input-expiry-date" type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} className="bg-black/40 border-white/10" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" data-testid="btn-cancel-add-coi" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="btn-submit-add-coi"
            disabled={!expiryDate || createCoi.isPending}
            onClick={() => createCoi.mutate()}
          >
            {createCoi.isPending && <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />}
            Save COI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CoiStatusCard({ projectId }: { projectId: string }) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { data, isLoading } = useQuery<ProjectCoiPayload>({
    queryKey: ["/api/projects", projectId, "coi"],
    queryFn: () => fetch(`/api/projects/${projectId}/coi`).then((r) => r.json()),
    enabled: !!projectId,
  });
  const { data: vendorsData } = useQuery<VendorRow[]>({
    queryKey: ["/api/vendors"],
    queryFn: () => fetch("/api/vendors").then((r) => r.ok ? r.json() : []),
  });
  const vendors = Array.isArray(vendorsData) ? vendorsData : [];
  const vendorById = new Map(vendors.map((v) => [v.id, v.companyName]));

  const rows = data?.rows ?? [];
  const rollup = data?.rollup ?? { total: 0, expired: 0, critical_1d: 0, critical_7d: 0, warning_14d: 0, warning_30d: 0, ok: 0 };
  // Spec'd traffic-light rollup:
  //   Red    = <14 days OR expired (rollup.expired is always 0 here
  //            since GET filters them — but include defensively).
  //   Yellow = 14-30 days (warning_14d + warning_30d).
  //   Green  = >30 days (ok).
  const red = rollup.expired + rollup.critical_1d + rollup.critical_7d;
  const yellow = rollup.warning_14d + rollup.warning_30d;
  const green = rollup.ok;
  const total = rollup.total;

  const band =
    red > 0
      ? "border-red-500/30 bg-red-500/5"
      : yellow > 0
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-emerald-500/20 bg-emerald-500/5";

  return (
    <>
      <button
        type="button"
        onClick={() => setSheetOpen(true)}
        data-testid="card-coi-status"
        className={`mx-6 my-3 w-[calc(100%-3rem)] border ${band} px-4 py-3 flex items-center gap-4 hover:bg-white/5 transition-colors text-left`}
      >
        <Shield className="w-4 h-4 text-zinc-400" />
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono">
            COI Status
          </span>
          <span className="text-xs font-mono text-zinc-300">
            {isLoading ? "Loading…" : total === 0 ? "No policies on file" : `${total} ${total === 1 ? "policy" : "policies"}`}
          </span>
        </div>
        <div className="flex items-center gap-4 ml-auto">
          <div data-testid="coi-bucket-red" className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Red</span>
            <span className={`text-sm font-mono font-bold ${red > 0 ? "text-red-400" : "text-zinc-600"}`}>{red}</span>
          </div>
          <div data-testid="coi-bucket-yellow" className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Yellow</span>
            <span className={`text-sm font-mono font-bold ${yellow > 0 ? "text-amber-400" : "text-zinc-600"}`}>{yellow}</span>
          </div>
          <div data-testid="coi-bucket-green" className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">Green</span>
            <span className={`text-sm font-mono font-bold ${green > 0 ? "text-emerald-400" : "text-zinc-600"}`}>{green}</span>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
        </div>
      </button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          data-testid="sheet-coi-list"
          className="bg-[#0a0a0f] border-l border-white/10 text-white sm:max-w-2xl w-full overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle className="font-mono text-sm flex items-center gap-2">
              <Shield className="w-4 h-4" /> Project COI File
            </SheetTitle>
            <SheetDescription className="font-mono text-[11px] text-zinc-500">
              Active certificates for this project. Expired policies are
              excluded — see the COI Tracker for the full archive.
            </SheetDescription>
          </SheetHeader>

          <div className="flex items-center justify-between mt-4 mb-3">
            <div className="flex items-center gap-3 text-[11px] font-mono text-zinc-500">
              <span><span className="text-red-400">{red}</span> red</span>
              <span><span className="text-amber-400">{yellow}</span> yellow</span>
              <span><span className="text-emerald-400">{green}</span> green</span>
            </div>
            <Button
              size="sm"
              data-testid="btn-add-coi"
              onClick={() => setAddOpen(true)}
              className="h-8 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" /> Add COI
            </Button>
          </div>

          {isLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            </div>
          ) : rows.length === 0 ? (
            <div data-testid="empty-coi-list" className="py-12 text-center text-xs font-mono text-zinc-500">
              No active certificates on file.
              <div className="mt-2 text-zinc-600">Click <strong className="text-zinc-300">Add COI</strong> to upload one.</div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-white/5">
              <table className="w-full text-xs" data-testid="table-project-cois">
                <thead>
                  <tr className="border-b border-white/10 text-left text-zinc-500 text-[10px] uppercase tracking-wider font-mono">
                    <th className="py-2 px-3">Vendor</th>
                    <th className="py-2 px-3">Policy</th>
                    <th className="py-2 px-3">Carrier</th>
                    <th className="py-2 px-3">Expiry</th>
                    <th className="py-2 px-3">Days</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const tierCfg = TIER_BADGE[r.tier] ?? TIER_BADGE.ok;
                    const days = daysUntil(r.expiryDate);
                    const vendorName = r.vendorId ? (vendorById.get(r.vendorId) ?? "—") : "—";
                    return (
                      <tr
                        key={r.id}
                        data-testid={`row-coi-${r.id}`}
                        className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-2 px-3 text-white max-w-[160px] truncate">{vendorName}</td>
                        <td className="py-2 px-3 font-mono text-zinc-300">
                          {POLICY_TYPE_LABELS[r.policyType] ?? r.policyType}
                        </td>
                        <td className="py-2 px-3 text-zinc-400">{r.carrier ?? "—"}</td>
                        <td className="py-2 px-3 text-zinc-400 font-mono">{formatDate(r.expiryDate)}</td>
                        <td className="py-2 px-3 font-mono text-zinc-300">
                          {days === null ? "—" : days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                        </td>
                        <td className="py-2 px-3">
                          <span
                            data-testid={`badge-coi-tier-${r.id}`}
                            className={`inline-block px-2 py-0.5 text-[10px] font-mono border ${tierCfg.className}`}
                          >
                            {tierCfg.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-white/10 flex justify-end">
            <Link
              href={`/coi?projectId=${projectId}`}
              data-testid="link-coi-tracker"
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-1"
            >
              Open full COI Tracker <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </SheetContent>
      </Sheet>

      <AddCoiDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projectId={projectId}
        vendors={vendors}
      />
    </>
  );
}

function RFIsTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "rfis"], queryFn: () => fetch(`/api/projects/${projectId}/rfis`).then(r => r.json()) });
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<{ rfiId: string; approvalId: string } | null>(null);

  const draftRfi = async (rfiId: string) => {
    setDraftingId(rfiId);
    try {
      const res = await apiRequest("POST", "/api/rfi/draft", { rfiId, projectId });
      const data = await res.json();
      setDraftResult({ rfiId, approvalId: data.approvalId ?? data.draftId });
      qc.invalidateQueries({ queryKey: ["/api/projects", projectId, "rfis"] });
    } catch (err) {
      console.error("RFI draft failed:", err);
    } finally {
      setDraftingId(null);
    }
  };

  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No RFIs found for this project" />;
  return (
    <div className="space-y-3">
      {draftResult && (
        <div className="rounded-md bg-green-950/30 border border-green-900 p-2.5 text-xs text-green-400 flex items-center gap-2">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          Herbie drafted an RFI response — check the Approvals queue to review &amp; send.
          <button className="ml-auto underline hover:no-underline" onClick={() => setDraftResult(null)}>Dismiss</button>
        </div>
      )}
      <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-rfis">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono">
            <th className="py-2 px-3">#</th>
            <th className="py-2 px-3">Subject</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Priority</th>
            <th className="py-2 px-3">Age</th>
              <th className="py-2 px-3">Herbie</th>
            <th className="py-2 px-3">Created</th>
            <th className="py-2 px-3">AI</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} data-testid={`row-rfi-${r.id}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3 font-mono text-zinc-300">{r.rfiNumber || r.rfi_number}</td>
              <td className="py-2 px-3 text-white max-w-[300px] truncate">{r.subject}</td>
              <td className="py-2 px-3"><StatusPill status={r.status} /></td>
              <td className="py-2 px-3"><PriorityIcon priority={r.priority} /></td>
              <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{daysSince(r.createdAt || r.created_at)}d</td>
              <td className="py-2 px-3 text-zinc-500 text-xs">{formatDate(r.createdAt || r.created_at)}</td>
              <td className="py-2 px-3">
                <button
                  onClick={() => draftRfi(String(r.id))}
                  disabled={draftingId === String(r.id)}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Have Herbie draft a response"
                >
                  {draftingId === String(r.id) ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                  Draft
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}

function SubmittalsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "submittals"], queryFn: () => fetch(`/api/projects/${projectId}/submittals`).then(r => r.json()) });
  if (isLoading) return <LoadingState />;

  const qc = useQueryClient();
  const [draftingS, setDraftingS] = React.useState<string|null>(null);
  const draftSub = async (r: any) => { setDraftingS(r.id); try { await apiRequest("POST","/api/submittal/draft",{projectId,submittalNumber:r.submittalNumber||r.submittal_number,name:r.name,description:r.description||"",draftedBy:"Herbie"}); await qc.invalidateQueries({queryKey:["/api/projects",projectId,"submittals"]}); } finally { setDraftingS(null); } };
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No submittals found for this project" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-submittals">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono">
            <th className="py-2 px-3">#</th>
            <th className="py-2 px-3">Name</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Rev</th>
            <th className="py-2 px-3">Age</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} data-testid={`row-submittal-${r.id}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3 font-mono text-zinc-300">{r.submittalNumber || r.submittal_number}</td>
              <td className="py-2 px-3 text-white max-w-[300px] truncate">{r.name}</td>
              <td className="py-2 px-3"><StatusPill status={r.status} /></td>
              <td className="py-2 px-3 font-mono text-zinc-400">v{r.revision ?? 0}</td>
              <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{daysSince(r.createdAt || r.created_at)}d</td>
            <td className="py-2 px-3"><button onClick={() => draftSub(r)} disabled={draftingS === r.id} data-testid={`btn-draft-submittal-${r.id}`} className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-colors">{draftingS === r.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}Draft</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChangeOrdersTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "change-orders"], queryFn: () => fetch(`/api/projects/${projectId}/change-orders`).then(r => r.json()) });
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No change orders found for this project" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-change-orders">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono">
            <th className="py-2 px-3">#</th>
            <th className="py-2 px-3">Title</th>
            <th className="py-2 px-3">Type</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Amount</th>
            <th className="py-2 px-3">Days Pending</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} data-testid={`row-co-${r.id}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3 font-mono text-zinc-300">{r.coNumber || r.co_number}</td>
              <td className="py-2 px-3 text-white max-w-[250px] truncate">{r.title}</td>
              <td className="py-2 px-3 text-zinc-400 text-xs">{(r.changeType || r.change_type || "").replace(/_/g, " ")}</td>
              <td className="py-2 px-3"><StatusPill status={r.status} /></td>
              <td className="py-2 px-3 font-mono text-emerald-400">{r.amount ? `$${Number(r.amount).toLocaleString()}` : "—"}</td>
              <td className="py-2 px-3 text-zinc-400 font-mono text-xs">{daysSince(r.submittedAt || r.submitted_at || r.createdAt || r.created_at)}d</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DailyLogsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "daily-logs"], queryFn: () => fetch(`/api/projects/${projectId}/daily-logs`).then(r => r.json()) });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No daily logs found for this project" />;

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-1" data-testid="list-daily-logs">
      {rows.map((log: any) => {
        const id = log.id;
        const isOpen = expanded.has(id);
        const weather = log.weatherJson || log.weather_json;
        const work = log.workPerformedJson || log.work_performed_json;
        const labor = log.laborJson || log.labor_json;
        const issues = log.issuesJson || log.issues_json;
        return (
          <div key={id} data-testid={`card-log-${id}`} className="border border-white/10 bg-black/20">
            <button
              data-testid={`btn-expand-log-${id}`}
              onClick={() => toggle(id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                <span className="text-white font-mono text-sm">{formatDate(log.logDate || log.log_date)}</span>
                {weather && <span className="text-zinc-500 text-xs">{weather.conditions} · {weather.temp}°F</span>}
              </div>
              <StatusPill status={log.status} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                {weather && (
                  <div className="border-l-2 border-blue-500/50 pl-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono block">Weather</span>
                    <span className="text-zinc-300 text-sm">{weather.conditions} · {weather.temp}°F · Wind: {weather.wind} · Humidity: {weather.humidity}%</span>
                  </div>
                )}
                {work && Array.isArray(work) && work.length > 0 && (
                  <div className="border-l-2 border-emerald-500/50 pl-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono block">Work Performed</span>
                    <ul className="text-zinc-300 text-sm space-y-0.5">
                      {work.map((w: string, i: number) => <li key={i}>• {w}</li>)}
                    </ul>
                  </div>
                )}
                {labor && (
                  <div className="border-l-2 border-amber-500/50 pl-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono block">Labor</span>
                    <span className="text-zinc-300 text-sm">
                      {labor.crews} crews · {labor.trades?.join(", ")} · {labor.totalHours}h total
                      {labor.overtimeHours > 0 && <span className="text-amber-400"> ({labor.overtimeHours}h OT)</span>}
                    </span>
                  </div>
                )}
                {issues && Array.isArray(issues) && issues.length > 0 && (
                  <div className="border-l-2 border-red-500/50 pl-3">
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 font-mono block">Issues</span>
                    <ul className="text-red-300 text-sm space-y-0.5">
                      {issues.map((issue: string, i: number) => <li key={i} className="flex items-start gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />{issue}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TasksTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "tasks"], queryFn: () => fetch(`/api/projects/${projectId}/tasks`).then(r => r.json()) });
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No tasks found for this project" />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="table-tasks">
        <thead>
          <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono">
            <th className="py-2 px-3">Name</th>
            <th className="py-2 px-3">Status</th>
            <th className="py-2 px-3">Priority</th>
            <th className="py-2 px-3">Source</th>
            <th className="py-2 px-3">Due Date</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t: any) => (
            <tr key={t.id} data-testid={`row-task-${t.id}`} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
              <td className="py-2 px-3 text-white max-w-[350px] truncate">{t.name}</td>
              <td className="py-2 px-3"><StatusPill status={t.status} /></td>
              <td className="py-2 px-3"><PriorityIcon priority={t.priority} /></td>
              <td className="py-2 px-3">
                <span className={`px-1.5 py-0.5 text-[10px] font-mono border ${t.source === "monitor" ? "text-cyan-400 border-cyan-400/30" : "text-zinc-500 border-zinc-500/30"}`}>
                  {t.source || "manual"}
                </span>
              </td>
              <td className="py-2 px-3 text-zinc-500 text-xs">{formatDate(t.dueDate || t.due_date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AgentReportsTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/projects", projectId, "agent-reports"], queryFn: () => fetch(`/api/projects/${projectId}/agent-reports`).then(r => r.json()) });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (isLoading) return <LoadingState />;
  const rows = data || [];
  if (rows.length === 0) return <EmptyState label="No agent reports yet — run an agent to generate one" />;

  const toggle = (id: string) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpanded(next);
  };

  return (
    <div className="space-y-1" data-testid="list-agent-reports">
      {rows.map((r: any) => {
        const isOpen = expanded.has(r.id);
        return (
          <div key={r.id} data-testid={`card-report-${r.id}`} className="border border-white/10 bg-black/20">
            <button
              data-testid={`btn-expand-report-${r.id}`}
              onClick={() => toggle(r.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                <Bot className="w-4 h-4 text-cyan-400" />
                <span className="text-white text-sm font-mono">{r.agentName || r.agent_name}</span>
                <span className="text-zinc-500 text-xs">{formatDate(r.createdAt || r.created_at)}</span>
                {r.durationMs && <span className="text-zinc-600 text-[10px] font-mono">{r.durationMs}ms</span>}
              </div>
              <StatusPill status={r.status} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-white/5 pt-3">
                {r.description && <p className="text-zinc-400 text-sm mb-3">{r.description}</p>}
                <pre className="text-zinc-300 text-xs font-mono bg-black/40 border border-white/5 p-3 overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap">
                  {JSON.stringify(r.outputJson || r.output_json, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12 text-zinc-500" data-testid="loading-state">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-sm font-mono">Loading...</span>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-zinc-600" data-testid="empty-state">
      <span className="text-sm">{label}</span>
    </div>
  );
}


function HerbieMemoryTab({ projectId }: { projectId: string }) {
  const { data, isLoading } = useQuery<{ facts: any[]; decisions: any[]; relationships: any[] }>({
    queryKey: ["/api/herbie/memory/project", projectId],
    queryFn: () => fetch(`/api/herbie/memory/project/${projectId}`).then(r => r.json()),
  });
  if (isLoading) return <div className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading memory…</div>;
  const facts = data?.facts ?? [];
  const decisions = data?.decisions ?? [];
  const rels = data?.relationships ?? [];
  if (facts.length === 0 && decisions.length === 0 && rels.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Brain className="h-8 w-8 mx-auto mb-2 opacity-40" />
        <p className="text-sm">Herbie hasn't learned anything about this project yet.</p>
        <p className="text-xs mt-1">Run a document ingestion cycle to populate project memory.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      {facts.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Lightbulb className="h-4 w-4 text-yellow-500" /> Facts ({facts.length})
          </h3>
          <div className="space-y-2">
            {facts.map((f: any, i: number) => (
              <div key={f.id ?? i} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                <span className="text-xs font-mono text-muted-foreground w-28 shrink-0 truncate">{f.subjectType}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="font-medium text-primary">{f.predicate}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="truncate">{f.object ?? "—"}</span>
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  <div className={`h-1.5 w-1.5 rounded-full ${f.confidence >= 0.85 ? "bg-green-500" : f.confidence >= 0.6 ? "bg-yellow-500" : "bg-red-500"}`} />
                  <span className="text-xs text-muted-foreground font-mono">{Math.round((f.confidence ?? 0) * 100)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {decisions.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
            <Brain className="h-4 w-4 text-purple-500" /> Decisions ({decisions.length})
          </h3>
          <div className="space-y-2">
            {decisions.map((d: any, i: number) => (
              <div key={d.id ?? i} className="py-2 border-b last:border-0">
                <p className="text-sm font-medium">{d.summary}</p>
                {d.rationale && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.rationale}</p>}
                <p className="text-xs text-muted-foreground mt-1">by {d.decidedBy}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {rels.length > 0 && (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold mb-3">
            <GitBranch className="h-4 w-4 text-blue-500" /> Relationships ({rels.length})
          </h3>
          <div className="space-y-1.5">
            {rels.map((r: any, i: number) => (
              <div key={r.id ?? i} className="flex items-center gap-2 text-xs py-1 border-b last:border-0">
                <span className="font-mono text-muted-foreground">{r.fromEntityType}:{r.fromEntityId?.slice(0,8)}</span>
                <span className="text-primary font-medium">—[{r.role}]→</span>
                <span className="font-mono text-muted-foreground">{r.toEntityType}:{r.toEntityId?.slice(0,8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Roadmap Feature 11 — Share with Client / Sub modal.
//
// Lets the PM mint a portal share token scoped to an audience + a list of
// document categories with an expiry. Lists existing shares and allows
// revocation. The token URL is /portal/:token.
const SHARE_CATEGORIES = [
  { value: "drawings", label: "Drawings" },
  { value: "specs", label: "Specifications" },
  { value: "submittals", label: "Submittals" },
  { value: "rfis", label: "RFIs" },
  { value: "change_orders", label: "Change Orders" },
  { value: "daily_logs", label: "Daily Logs" },
  { value: "permits", label: "Permits" },
  { value: "compliance", label: "Compliance / COIs" },
];

interface PortalShareRow {
  id: string;
  token: string;
  audience: string | null;
  categoriesJson?: string[] | null;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

function ShareDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [audience, setAudience] = useState<string>("client");
  const [categories, setCategories] = useState<string[]>([
    "drawings",
    "submittals",
  ]);
  const [expiresInDays, setExpiresInDays] = useState<string>("14");

  const sharesQ = useQuery<PortalShareRow[]>({
    queryKey: ["/api/portal/shares", projectId],
    queryFn: () =>
      fetch(`/api/portal/shares?projectId=${encodeURIComponent(projectId)}`)
        .then((r) => r.json())
        .then((rows) => (Array.isArray(rows) ? rows : [])),
    enabled: open && !!projectId,
  });

  const createShare = useMutation({
    mutationFn: async () => {
      const days = parseInt(expiresInDays, 10);
      const expiresAt = Number.isFinite(days) && days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
        : null;
      // Backend audience enum is `client | sub | internal`; map UI labels.
      const audienceMap: Record<string, string> = {
        client: "client",
        subcontractor: "sub",
        architect: "internal",
        inspector: "internal",
      };
      const apiAudience = audienceMap[audience] ?? "client";
      const resp = await apiRequest("POST", "/api/portal/shares", {
        projectId,
        audience: apiAudience,
        audienceLabel: audience,
        categoriesJson: categories,
        expiresAt,
      });
      return resp.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Share link created",
        description: data?.token
          ? `Portal token: ${String(data.token).slice(0, 12)}…`
          : "Active",
      });
      qc.invalidateQueries({ queryKey: ["/api/portal/shares", projectId] });
    },
    onError: (e: any) => {
      toast({
        title: "Failed to create share",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const revokeShare = useMutation({
    mutationFn: async (token: string) => {
      const resp = await apiRequest(
        "DELETE",
        `/api/portal/${encodeURIComponent(token)}`,
      );
      return resp.json().catch(() => ({}));
    },
    onSuccess: () => {
      toast({ title: "Share revoked" });
      qc.invalidateQueries({ queryKey: ["/api/portal/shares", projectId] });
    },
    onError: (e: any) => {
      toast({
        title: "Failed to revoke",
        description: e?.message || "Try again",
        variant: "destructive",
      });
    },
  });

  const portalUrl = (token: string) =>
    `${window.location.origin}/portal/${token}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="dialog-share-portal"
        className="max-w-2xl bg-[#0f0f17] border-white/10 text-white"
      >
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            Share with Client / Subcontractor
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Audience</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger
                  className="h-9 bg-black/40 border-white/10"
                  data-testid="select-share-audience"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client / Owner</SelectItem>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="architect">Architect / Engineer</SelectItem>
                  <SelectItem value="inspector">Inspector / AHJ</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Expires in (days)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
                className="h-9 bg-black/40 border-white/10"
                data-testid="input-share-expiry"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Document Categories</Label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {SHARE_CATEGORIES.map((c) => {
                const checked = categories.includes(c.value);
                return (
                  <label
                    key={c.value}
                    className="flex items-center gap-2 text-xs px-2 py-1.5 border border-white/10 rounded cursor-pointer hover:bg-white/5"
                    data-testid={`label-share-cat-${c.value}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        setCategories((prev) =>
                          e.target.checked
                            ? [...prev, c.value]
                            : prev.filter((x) => x !== c.value),
                        );
                      }}
                      data-testid={`checkbox-share-cat-${c.value}`}
                    />
                    {c.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => createShare.mutate()}
              disabled={createShare.isPending || categories.length === 0}
              data-testid="button-create-share"
              size="sm"
            >
              {createShare.isPending ? (
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
              ) : null}
              Create share link
            </Button>
          </div>

          <div className="border-t border-white/10 pt-3">
            <div className="text-xs font-mono text-zinc-400 mb-2">
              Existing shares
            </div>
            {sharesQ.isLoading ? (
              <div className="text-xs text-zinc-500">Loading…</div>
            ) : (sharesQ.data || []).length === 0 ? (
              <div
                className="text-xs text-zinc-500"
                data-testid="text-share-empty"
              >
                No active shares.
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {(sharesQ.data || []).map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 p-2 border border-white/10 rounded text-xs"
                    data-testid={`row-share-${s.id}`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono uppercase text-cyan-400">
                          {s.audience || "client"}
                        </span>
                        {s.expiresAt ? (
                          <span className="text-zinc-500">
                            exp {new Date(s.expiresAt).toLocaleDateString()}
                          </span>
                        ) : null}
                      </div>
                      <div className="font-mono truncate text-zinc-400">
                        {portalUrl(s.token)}
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        navigator.clipboard
                          .writeText(portalUrl(s.token))
                          .then(() => toast({ title: "Copied to clipboard" }))
                          .catch(() => {});
                      }}
                      data-testid={`button-copy-share-${s.id}`}
                    >
                      Copy
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="h-7 text-xs"
                      onClick={() => revokeShare.mutate(s.token)}
                      disabled={revokeShare.isPending}
                      data-testid={`button-revoke-share-${s.id}`}
                    >
                      Revoke
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-share-close"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ProjectCockpit() {
  const [, params] = useRoute("/projects/:id/cockpit");
  const projectId = params?.id || "";
  const [activeTab, setActiveTab] = useState<TabId>("rfis");
  const [shareOpen, setShareOpen] = useState(false);

  const { data: cockpit, isLoading } = useQuery<any>({
    queryKey: ["/api/projects", projectId, "cockpit"],
    queryFn: () => fetch(`/api/projects/${projectId}/cockpit`).then(r => r.json()),
    enabled: !!projectId,
  });

  const runAgent = useMutation({
    mutationFn: async (agent: string) => {
      const resp = await apiRequest("POST", "/api/agents/run", { agent, projectId });
      return resp.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "agent-reports"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "cockpit"] });
      setActiveTab("agent-reports");
    },
  });

  if (!projectId) {
    return <div className="p-8 text-zinc-500">No project selected</div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
      </div>
    );
  }

  const project = cockpit?.project;
  const counts = cockpit?.counts || {};

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white" data-testid="project-cockpit">
      <div className="border-b border-white/10 bg-black/40 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-lg font-mono font-bold text-white" data-testid="text-project-name">
                {project?.name || "Project Cockpit"}
              </h1>
              {project?.status && <StatusPill status={project.status} />}
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500 font-mono">
              {project?.projectNumber && <span data-testid="text-project-number">#{project.projectNumber}</span>}
              {project?.clientName && <span data-testid="text-client">{project.clientName}</span>}
              {project?.contractValue && <span data-testid="text-contract-value">${Number(project.contractValue).toLocaleString()}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              data-testid="btn-run-pm-agent"
              onClick={() => runAgent.mutate("pm")}
              disabled={runAgent.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 transition-colors disabled:opacity-50"
            >
              {runAgent.isPending && runAgent.variables === "pm" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Run PM Agent
            </button>
            <button
              data-testid="btn-run-fieldops-agent"
              onClick={() => runAgent.mutate("fieldops")}
              disabled={runAgent.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
            >
              {runAgent.isPending && runAgent.variables === "fieldops" ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Run Field Ops
            </button>
            <button
              data-testid="btn-share-portal"
              onClick={() => setShareOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors"
            >
              <Send className="w-3 h-3" />
              Share with Client / Sub
            </button>
          </div>
        </div>
      </div>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} projectId={projectId} />

      <HerbieDigestCard projectId={projectId} />
      <CoiStatusCard projectId={projectId} />

      <div className="px-6 py-3 flex gap-2 flex-wrap border-b border-white/5">
        <CountBadge label="RFIs" count={counts.rfis || 0} accent={counts.openRfis > 0 ? "text-amber-400" : undefined} />
        <CountBadge label="Open RFIs" count={counts.openRfis || 0} accent="text-amber-400" />
        <CountBadge label="Submittals" count={counts.submittals || 0} />
        <CountBadge label="Change Orders" count={counts.changeOrders || 0} />
        <CountBadge label="Pending COs" count={counts.pendingCOs || 0} accent={counts.pendingCOs > 0 ? "text-red-400" : undefined} />
        <CountBadge label="Daily Logs" count={counts.dailyLogs || 0} />
        <CountBadge label="Tasks" count={counts.tasks || 0} />
        <CountBadge label="Open Tasks" count={counts.openTasks || 0} accent={counts.openTasks > 0 ? "text-amber-400" : undefined} />
        <CountBadge label="Agent Reports" count={counts.agentReports || 0} accent="text-cyan-400" />
        <CoiRollupBadge rollup={cockpit?.coiRollup} />
      </div>

      <div className="border-b border-white/10 px-6 flex gap-0">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              data-testid={`tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-mono transition-colors border-b-2 ${
                isActive
                  ? "border-cyan-400 text-cyan-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-300"
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="px-6 py-4">
        {activeTab === "rfis" && <RFIsTab projectId={projectId} />}
        {activeTab === "submittals" && <SubmittalsTab projectId={projectId} />}
        {activeTab === "change-orders" && <ChangeOrdersTab projectId={projectId} />}
        {activeTab === "daily-logs" && <DailyLogsTab projectId={projectId} />}
        {activeTab === "tasks" && <TasksTab projectId={projectId} />}
        {activeTab === "agent-reports" && <AgentReportsTab projectId={projectId} />}
            {activeTab === "herbie-memory" && <HerbieMemoryTab projectId={projectId} />}
      </div>
    </div>
  );
}
