import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Shield,
  Star,
  Loader2,
  Search,
} from "lucide-react";

interface Stats {
  total: number;
  avgConfidence: number;
  preferred: number;
  approved: number;
  watch: number;
  atRisk: number;
  expiredInsurance: number;
  expiringInsurance: number;
}
interface Vendor {
  id: string;
  vendorNumber: string;
  companyName: string;
  vendorType: string;
  status: string;
  trade?: string;
  confidenceScore: number;
  tier: "Preferred" | "Approved" | "Watch" | "At-Risk";
  performanceRating?: number | null;
  safetyRating?: number | null;
  qualityRating?: number | null;
  prequalificationStatus?: string | null;
  insuranceExpiresAt?: string | null;
  licenseExpiresAt?: string | null;
  updatedAt?: string;
}

function relTime(iso?: string | null) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

function tierClasses(tier: string) {
  switch (tier) {
    case "Preferred":
      return "bg-emerald-500/10 border-emerald-500/30 text-emerald-400";
    case "Approved":
      return "bg-blue-500/10 border-blue-500/30 text-blue-400";
    case "Watch":
      return "bg-amber-500/10 border-amber-500/30 text-amber-400";
    case "At-Risk":
      return "bg-red-500/10 border-red-500/30 text-red-400";
    default:
      return "bg-white/5 border-white/10 text-zinc-400";
  }
}
function scoreBarColor(score: number) {
  if (score >= 85) return "bg-emerald-500";
  if (score >= 70) return "bg-blue-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  border,
  text,
  testid,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: any;
  border: string;
  text: string;
  testid: string;
}) {
  return (
    <div className={"border rounded-lg p-4 " + border} data-testid={testid}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={"w-4 h-4 " + text} />
        <div className="text-xs text-zinc-400 uppercase tracking-wider">{label}</div>
      </div>
      <div className={"text-3xl font-bold font-mono " + text}>{value}</div>
      {sub && <div className="text-xs text-zinc-500 mt-1">{sub}</div>}
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      className={
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] uppercase tracking-wider border font-mono " +
        tierClasses(tier)
      }
    >
      {tier}
    </span>
  );
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <div className="flex-1 h-2 bg-white/5 rounded overflow-hidden border border-white/10">
        <div
          className={"h-full " + scoreBarColor(score)}
          style={{ width: `${Math.max(2, score)}%` }}
        />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-10 text-right">{score}</span>
    </div>
  );
}

export default function VendorConfidenceDashboard() {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<"all" | "Preferred" | "Approved" | "Watch" | "At-Risk">("all");

  const { data: stats, isLoading: statsLoading } = useQuery<Stats>({
    queryKey: ["/api/vendor-confidence/stats"],
    queryFn: async () => {
      const r = await fetch("/api/vendor-confidence/stats");
      if (!r.ok) throw new Error("Failed to load stats");
      return r.json();
    },
  });
  const { data: vendors, isLoading: vendorsLoading, error: vendorsError } = useQuery<Vendor[]>({
    queryKey: ["/api/vendor-confidence/vendors"],
    queryFn: async () => {
      const r = await fetch("/api/vendor-confidence/vendors");
      if (!r.ok) throw new Error("Failed to load vendors");
      const j = await r.json();
      return Array.isArray(j) ? j : (j.vendors || []);
    },
  });

  const list = vendors || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return list.filter((v) => {
      if (tierFilter !== "all" && v.tier !== tierFilter) return false;
      if (!q) return true;
      return (
        v.companyName?.toLowerCase().includes(q) ||
        v.vendorNumber?.toLowerCase().includes(q) ||
        v.trade?.toLowerCase().includes(q)
      );
    });
  }, [list, search, tierFilter]);

  const isLoading = statsLoading || vendorsLoading;

  return (
    <div className="min-h-screen bg-black text-white p-6" data-testid="vendor-confidence-dashboard">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-blue-400" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-page-title">Vendor Confidence</h1>
            <p className="text-zinc-400 text-sm mt-0.5">
              AI-derived health & confidence scores across your vendor base.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total Vendors"
            value={statsLoading ? "…" : stats?.total ?? 0}
            icon={Building2}
            border="border-white/10"
            text="text-white"
            testid="stat-total"
          />
          <StatCard
            label="Avg Confidence"
            value={statsLoading ? "…" : `${stats?.avgConfidence ?? 0}`}
            sub="0–100 scale"
            icon={TrendingUp}
            border="border-blue-500/30"
            text="text-blue-400"
            testid="stat-avg-confidence"
          />
          <StatCard
            label="Preferred"
            value={statsLoading ? "…" : stats?.preferred ?? 0}
            sub="≥ 85"
            icon={Star}
            border="border-emerald-500/30"
            text="text-emerald-400"
            testid="stat-preferred"
          />
          <StatCard
            label="Approved"
            value={statsLoading ? "…" : stats?.approved ?? 0}
            sub="70–84"
            icon={CheckCircle}
            border="border-blue-500/30"
            text="text-blue-400"
            testid="stat-approved"
          />
          <StatCard
            label="Watch"
            value={statsLoading ? "…" : stats?.watch ?? 0}
            sub="50–69"
            icon={AlertTriangle}
            border="border-amber-500/30"
            text="text-amber-400"
            testid="stat-watch"
          />
          <StatCard
            label="At-Risk"
            value={statsLoading ? "…" : stats?.atRisk ?? 0}
            sub="< 50"
            icon={Shield}
            border="border-red-500/30"
            text="text-red-400"
            testid="stat-at-risk"
          />
        </div>

        {((stats?.expiredInsurance ?? 0) > 0 || (stats?.expiringInsurance ?? 0) > 0) && (
          <div className="border border-amber-500/30 bg-amber-500/5 rounded-lg p-3 text-sm flex items-center gap-3 flex-wrap">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-amber-300">
              <span className="font-mono text-white">{stats?.expiredInsurance ?? 0}</span> vendor(s) with expired insurance,{" "}
              <span className="font-mono text-white">{stats?.expiringInsurance ?? 0}</span> expiring within 30 days.
            </span>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              data-testid="input-search"
              type="text"
              placeholder="Search vendors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded text-sm placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <div className="flex items-center gap-1 border border-white/10 rounded p-0.5 self-start">
            {(["all", "Preferred", "Approved", "Watch", "At-Risk"] as const).map((t) => (
              <button
                key={t}
                data-testid={`filter-tier-${t}`}
                onClick={() => setTierFilter(t)}
                className={
                  "px-3 py-1 text-xs rounded font-mono uppercase tracking-wider " +
                  (tierFilter === t ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-300")
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {vendorsError && (
          <div className="border border-red-500/30 bg-red-500/10 rounded p-3 text-sm text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Failed to load vendor confidence data.
          </div>
        )}

        <div className="border border-white/10 rounded-lg overflow-hidden">
          <table className="w-full text-sm" data-testid="table-vendors">
            <thead>
              <tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono bg-white/[0.02]">
                <th className="py-2 px-3">Vendor</th>
                <th className="py-2 px-3">Trade</th>
                <th className="py-2 px-3">Confidence</th>
                <th className="py-2 px-3">Tier</th>
                <th className="py-2 px-3">Prequal</th>
                <th className="py-2 px-3">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-zinc-500">
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" /> Loading vendors…
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-zinc-500" data-testid="empty-state">
                    {list.length === 0 ? "No vendors yet." : "No vendors match the current filters."}
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-white/5 hover:bg-white/[0.02]"
                    data-testid={`row-vendor-${v.id}`}
                  >
                    <td className="py-2 px-3">
                      <div className="font-medium truncate max-w-[260px]" data-testid={`text-name-${v.id}`}>
                        {v.companyName}
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">{v.vendorNumber}</div>
                    </td>
                    <td className="py-2 px-3 text-zinc-400 text-xs capitalize">{v.trade || v.vendorType || "—"}</td>
                    <td className="py-2 px-3" data-testid={`score-${v.id}`}>
                      <ScoreBar score={v.confidenceScore} />
                    </td>
                    <td className="py-2 px-3" data-testid={`tier-${v.id}`}>
                      <TierBadge tier={v.tier} />
                    </td>
                    <td className="py-2 px-3 text-xs text-zinc-400 capitalize">
                      {v.prequalificationStatus || "—"}
                    </td>
                    <td className="py-2 px-3 text-xs text-zinc-500" data-testid={`updated-${v.id}`}>
                      {relTime(v.updatedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-zinc-600 flex items-center gap-2 pt-1">
          Source:{" "}
          <span className="font-mono">/api/vendor-confidence/stats</span> ·{" "}
          <span className="font-mono">/api/vendor-confidence/vendors</span>
        </div>
      </div>
    </div>
  );
}
