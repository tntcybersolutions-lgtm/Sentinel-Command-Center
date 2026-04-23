import { useQuery } from "@tanstack/react-query";
import { Building2, Star, TrendingUp, AlertTriangle, CheckCircle, Clock, BarChart3 } from "lucide-react";

interface VendorStats { total: number; approved: number; pending: number; rejected: number; highConfidence: number; lowConfidence: number; }
interface Vendor { id: string; companyName: string; status: string; confidenceScore?: number; confidence_score?: number; trade?: string; createdAt?: string; created_at?: string; }

function ConfidenceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 80 ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" : pct >= 60 ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : "text-red-400 bg-red-500/10 border-red-500/30";
  return <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border font-mono " + color}><Star className="w-3 h-3" />{pct}%</span>;
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number | string; icon: any; color: string }) {
  return (<div className={"border rounded-lg p-4 flex items-center gap-3 " + color}><Icon className="w-5 h-5 flex-shrink-0" /><div><div className="text-2xl font-bold font-mono">{value}</div><div className="text-xs text-zinc-400 mt-0.5">{label}</div></div></div>);
}

export default function VendorConfidenceDashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<VendorStats>({ queryKey: ["/api/vendors/stats"], queryFn: () => fetch("/api/vendors/stats").then(r => r.json()) });
  const { data: vendors, isLoading: vendorsLoading } = useQuery<Vendor[]>({ queryKey: ["/api/vendors"], queryFn: () => fetch("/api/vendors").then(r => r.json()).then(d => Array.isArray(d) ? d : d.vendors || d.rows || []) });
  const { data: pending } = useQuery<any[]>({ queryKey: ["/api/vendors/pending-reviews"], queryFn: () => fetch("/api/vendors/pending-reviews").then(r => r.json()).then(d => Array.isArray(d) ? d : []) });
  const isLoading = statsLoading || vendorsLoading;
  const vendorList = vendors || [];
  const sorted = [...vendorList].sort((a, b) => (b.confidenceScore ?? b.confidence_score ?? 0) - (a.confidenceScore ?? a.confidence_score ?? 0));
  const lowConf = sorted.filter(v => (v.confidenceScore ?? v.confidence_score ?? 0) < 0.6);
  return (
    <div className="min-h-screen bg-black text-white p-6" data-testid="vendor-confidence-dashboard">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Building2 className="w-7 h-7 text-blue-400" />
          <div><h1 className="text-2xl font-bold">Vendor Confidence</h1><p className="text-zinc-400 text-sm mt-0.5">AI-scored vendor health and confidence overview</p></div>
        </div>
        {isLoading ? <div className="text-zinc-400 text-sm animate-pulse">Loading vendor data...</div> : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Total Vendors" value={stats?.total ?? vendorList.length} icon={Building2} color="border-white/10 text-white" />
            <StatCard label="Approved" value={stats?.approved ?? vendorList.filter(v => v.status === "approved").length} icon={CheckCircle} color="border-emerald-500/30 text-emerald-400" />
            <StatCard label="Pending" value={stats?.pending ?? (pending?.length ?? 0)} icon={Clock} color="border-amber-500/30 text-amber-400" />
            <StatCard label="Rejected" value={stats?.rejected ?? vendorList.filter(v => v.status === "rejected").length} icon={AlertTriangle} color="border-red-500/30 text-red-400" />
            <StatCard label="High Confidence" value={stats?.highConfidence ?? vendorList.filter(v => (v.confidenceScore ?? v.confidence_score ?? 0) >= 0.8).length} icon={TrendingUp} color="border-blue-500/30 text-blue-400" />
            <StatCard label="Needs Review" value={lowConf.length} icon={BarChart3} color="border-orange-500/30 text-orange-400" />
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><Star className="w-4 h-4 text-emerald-400" />Top Vendors</h2>
            <div className="border border-white/10 rounded-lg overflow-hidden">
              <table className="w-full text-sm" data-testid="table-top-vendors">
                <thead><tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono"><th className="py-2 px-3">Vendor</th><th className="py-2 px-3">Trade</th><th className="py-2 px-3">Score</th></tr></thead>
                <tbody>
                  {isLoading ? <tr><td colSpan={3} className="py-8 text-center text-zinc-500">Loading...</td></tr> : sorted.slice(0, 10).map((v) => (
                    <tr key={v.id} className="border-b border-white/5 hover:bg-white/[0.02]"><td className="py-2 px-3 font-medium truncate max-w-[200px]">{v.companyName}</td><td className="py-2 px-3 text-zinc-400 text-xs">{v.trade || "—"}</td><td className="py-2 px-3"><ConfidenceBadge score={v.confidenceScore ?? v.confidence_score ?? 0} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {lowConf.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-orange-400" />Low Confidence ({lowConf.length})</h2>
              <div className="border border-orange-500/20 rounded-lg overflow-hidden">
                <table className="w-full text-sm" data-testid="table-low-confidence-vendors">
                  <thead><tr className="border-b border-white/10 text-left text-zinc-500 text-xs uppercase tracking-wider font-mono"><th className="py-2 px-3">Vendor</th><th className="py-2 px-3">Status</th><th className="py-2 px-3">Score</th></tr></thead>
                  <tbody>
                    {lowConf.slice(0, 10).map((v) => (
                      <tr key={v.id} className="border-b border-white/5 hover:bg-white/[0.02]"><td className="py-2 px-3 font-medium truncate max-w-[180px]">{v.companyName}</td><td className="py-2 px-3 text-xs"><span className="px-2 py-0.5 rounded bg-white/5 text-zinc-300">{v.status}</span></td><td className="py-2 px-3"><ConfidenceBadge score={v.confidenceScore ?? v.confidence_score ?? 0} /></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}