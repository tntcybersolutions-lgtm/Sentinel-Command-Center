import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, CheckCircle, XCircle, Clock, AlertTriangle, ExternalLink, Loader2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface ApprovalCtx {
  message?: string;
  action?: string;
  reason?: string;
  reasoning?: string;
  amount?: number;
  alertType?: string;
  projectName?: string;
  changeOrderNumber?: string;
}
interface Approval {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  status: string;
  priority?: string;
  title?: string;
  description?: string;
  entityName?: string;
  dollarValue?: number | null;
  requestedBy?: string;
  requestedByType?: string;
  herbieReason?: string;
  context?: ApprovalCtx;
  createdAt?: string;
}

function fmtMoney(n?: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function relTime(iso?: string) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

// Pull project name + amount + CO# out of the monitor-generated message:
// 'Change Order #CO-201 ("Owner-directed intercom system upgrade")
//   on project "Underwood Hills HVAC & Intercom Upgrades" has been pending
//   for 30 days. Amount: $45000.00.'
function parseCtx(a: Approval) {
  const ctx = a.context || {};
  const msg = ctx.message || "";
  const projectName =
    ctx.projectName ||
    msg.match(/on project ["“]([^"”]+)["”]/)?.[1] ||
    msg.match(/project ["“]([^"”]+)["”]/)?.[1] ||
    "";
  const coNumber =
    ctx.changeOrderNumber ||
    msg.match(/Change Order #([A-Z0-9-]+)/i)?.[1] ||
    "";
  const coTitle = msg.match(/#[A-Z0-9-]+ \(["“]([^"”]+)["”]\)/i)?.[1] || "";
  const amountFromMsg = msg.match(/Amount:\s*\$?([\d,]+(?:\.\d+)?)/i)?.[1];
  const amount =
    typeof a.dollarValue === "number" && a.dollarValue > 0
      ? a.dollarValue
      : typeof ctx.amount === "number"
      ? ctx.amount
      : amountFromMsg
      ? Number(amountFromMsg.replace(/,/g, ""))
      : null;
  const daysPending = msg.match(/pending for (\d+) days?/i)?.[1] || "";
  const description = msg || a.description || a.herbieReason || ctx.action || "";
  return { projectName, coNumber, coTitle, amount, daysPending, description };
}

function PriorityBadge({ p }: { p?: string }) {
  const v = (p || "normal").toLowerCase();
  const cls =
    v === "urgent"
      ? "bg-red-500/10 border-red-500/30 text-red-400"
      : v === "high"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
      : v === "normal"
      ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
      : "bg-white/5 border-white/10 text-zinc-400";
  return <span className={"inline-flex px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border font-mono " + cls}>{v}</span>;
}
function StatusBadge({ s }: { s: string }) {
  const v = (s || "").toLowerCase();
  const cls =
    v === "pending"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
      : v === "approved"
      ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
      : v === "denied" || v === "rejected"
      ? "bg-red-500/10 border-red-500/30 text-red-400"
      : "bg-white/5 border-white/10 text-zinc-400";
  return <span className={"inline-flex px-2 py-0.5 rounded text-xs border font-mono " + cls}>{v || "—"}</span>;
}

export default function ChangeOrderApprovalsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"pending" | "all" | "decided">("pending");

  const { data, isLoading, error } = useQuery<Approval[]>({
    queryKey: ["/api/approvals", { type: "change_order" }],
    queryFn: async () => {
      const r = await fetch("/api/approvals?type=change_order");
      if (!r.ok) throw new Error("Failed to load approvals");
      const j = await r.json();
      return Array.isArray(j) ? j : (j.items || j.requests || []);
    },
  });

  const items = data || [];
  const pending = items.filter((a) => (a.status || "").toLowerCase() === "pending");
  const decided = items.filter((a) => {
    const s = (a.status || "").toLowerCase();
    return s === "approved" || s === "denied" || s === "rejected";
  });
  const visible = filter === "pending" ? pending : filter === "decided" ? decided : items;
  const totalValue = useMemo(
    () => pending.reduce((sum, a) => sum + (parseCtx(a).amount || 0), 0),
    [pending],
  );

  const decide = useMutation({
    mutationFn: async ({ id, decision, notes }: { id: string; decision: "approved" | "rejected"; notes?: string }) => {
      return apiRequest("PATCH", `/api/approvals/${id}`, { status: decision, notes });
    },
    onSuccess: (_d, vars) => {
      toast({
        title: vars.decision === "approved" ? "Approved" : "Rejected",
        description: vars.decision === "approved" ? "Change order marked approved." : "Change order marked rejected.",
      });
      qc.invalidateQueries({ queryKey: ["/api/approvals", { type: "change_order" }] });
      qc.invalidateQueries({ queryKey: ["/api/approvals"] });
    },
    onError: (e: any) => {
      toast({ title: "Failed", description: e?.message || "Could not update approval", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-black text-white p-6" data-testid="page-change-order-approvals">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ClipboardCheck className="w-7 h-7 text-purple-400" />
            <div>
              <h1 className="text-2xl font-bold" data-testid="text-page-title">
                Change Order Approvals
              </h1>
              <p className="text-zinc-400 text-sm">Review and decide change order escalations Herbie has surfaced.</p>
            </div>
          </div>
          <div className="flex items-center gap-1 border border-white/10 rounded p-0.5">
            {(["pending", "decided", "all"] as const).map((f) => (
              <button
                key={f}
                data-testid={`filter-${f}`}
                onClick={() => setFilter(f)}
                className={
                  "px-3 py-1 text-xs rounded font-mono uppercase tracking-wider " +
                  (filter === f ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")
                }
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="border border-amber-500/30 rounded-lg p-4">
            <div className="text-xs text-zinc-400 mb-1">Pending</div>
            <div className="text-3xl font-bold text-amber-400 font-mono" data-testid="stat-pending-count">
              {isLoading ? "…" : pending.length}
            </div>
          </div>
          <div className="border border-blue-500/30 rounded-lg p-4">
            <div className="text-xs text-zinc-400 mb-1">Total Pending Value</div>
            <div className="text-2xl font-bold text-blue-400 font-mono" data-testid="stat-pending-value">
              {fmtMoney(totalValue)}
            </div>
          </div>
          <div className="border border-white/10 rounded-lg p-4">
            <div className="text-xs text-zinc-400 mb-1">Decided</div>
            <div className="text-3xl font-bold font-mono" data-testid="stat-decided-count">
              {isLoading ? "…" : decided.length}
            </div>
          </div>
        </div>

        {error && (
          <div className="border border-red-500/30 bg-red-500/10 rounded p-3 text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Failed to load change order approvals.
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-zinc-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading approvals…
          </div>
        ) : visible.length === 0 ? (
          <div
            className="border border-white/10 rounded-lg p-10 text-center text-zinc-500 text-sm"
            data-testid="empty-state"
          >
            {filter === "pending"
              ? "No change orders are awaiting approval right now."
              : filter === "decided"
              ? "No decided change orders to show."
              : "No change order approvals yet."}
          </div>
        ) : (
          <div className="space-y-3" data-testid="list-approvals">
            {visible.map((a) => {
              const { projectName, coNumber, coTitle, amount, daysPending, description } = parseCtx(a);
              const isDecided = (a.status || "").toLowerCase() !== "pending";
              const busy = decide.isPending && decide.variables?.id === a.id;
              return (
                <div
                  key={a.id}
                  className="border border-white/10 rounded-lg p-4 bg-white/[0.02]"
                  data-testid={`approval-row-${a.id}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {coNumber && (
                          <span
                            className="font-mono text-xs px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-300"
                            data-testid={`text-co-number-${a.id}`}
                          >
                            #{coNumber}
                          </span>
                        )}
                        <PriorityBadge p={a.priority} />
                        <StatusBadge s={a.status} />
                        {daysPending && (
                          <span className="text-xs text-amber-400/80 font-mono">pending {daysPending}d</span>
                        )}
                        <span className="text-xs text-zinc-500">{relTime(a.createdAt)}</span>
                      </div>

                      {coTitle && (
                        <div className="text-base font-semibold text-white mb-1" data-testid={`text-co-title-${a.id}`}>
                          {coTitle}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm mb-2">
                        {projectName && (
                          <div className="flex items-center gap-1 text-zinc-300" data-testid={`text-project-${a.id}`}>
                            <span className="text-zinc-500">Project:</span>
                            <span className="font-medium">{projectName}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1" data-testid={`text-amount-${a.id}`}>
                          <span className="text-zinc-500 text-sm">Amount:</span>
                          <span className="text-blue-400 font-mono font-semibold">{fmtMoney(amount)}</span>
                        </div>
                        <div className="flex items-center gap-1 text-zinc-400" data-testid={`text-requested-by-${a.id}`}>
                          <span className="text-zinc-500">Requested by:</span>
                          <span className="font-mono text-xs">{a.requestedBy || "system"}</span>
                        </div>
                      </div>

                      {description && (
                        <p
                          className="text-sm text-zinc-400 leading-relaxed"
                          data-testid={`text-description-${a.id}`}
                        >
                          {description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {!isDecided && (
                        <div className="flex items-center gap-2">
                          <button
                            data-testid={`btn-approve-${a.id}`}
                            disabled={busy}
                            onClick={() => decide.mutate({ id: a.id, decision: "approved" })}
                            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50"
                          >
                            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                            Approve
                          </button>
                          <button
                            data-testid={`btn-reject-${a.id}`}
                            disabled={busy}
                            onClick={() => decide.mutate({ id: a.id, decision: "rejected" })}
                            className="flex items-center gap-1 px-3 py-1.5 rounded text-xs bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <XCircle className="w-3 h-3" />
                            Reject
                          </button>
                        </div>
                      )}
                      {a.entityType === "change_order" && a.entityId && (
                        <Link
                          href={`/change-orders/${a.entityId}`}
                          className="text-xs text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
                          data-testid={`link-co-${a.id}`}
                        >
                          <ExternalLink className="w-3 h-3" /> View CO
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-xs text-zinc-600 flex items-center gap-2 pt-2">
          <Clock className="w-3 h-3" />
          Source: <span className="font-mono">/api/approvals?type=change_order</span>
        </div>
      </div>
    </div>
  );
}
