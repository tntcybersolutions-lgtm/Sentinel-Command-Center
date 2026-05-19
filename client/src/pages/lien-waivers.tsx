/**
 * /lien-waivers — cross-project lien-waiver triage workspace.
 *
 * Procore-style left rail with modules:
 *   Outstanding (default landing — every "missing" waiver across all projects)
 *   Received    (uploaded but not yet approved)
 *   Approved    (fully cleared)
 *   Templates   (50-state library — 200 entries)
 *   Settings    (seed templates button + future automation rules)
 *
 * Backed by /api/lien-waivers — uses the existing service in server/lien-waivers.ts.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  ShieldAlert, Inbox, CheckCircle2, FileText, Settings,
  Search, Building2, Clock, AlertTriangle, Upload, ExternalLink, ChevronRight, Sparkles,
} from "lucide-react";

interface LienWaiver {
  id: string;
  tenant_id: string;
  project_id: string;
  project_name?: string | null;
  project_number?: string | null;
  folder_id: string | null;
  template_id: string | null;
  state_code: string | null;
  state_name: string | null;
  waiver_type: string;
  title: string;
  description: string | null;
  status: "missing" | "uploaded" | "approved";
  storage_key: string | null;
  created_at: string;
  updated_at: string;
}

interface OutstandingSummary {
  count: number;
  projectCount: number;
  oldestDays: number | null;
}

type ModuleKey = "outstanding" | "received" | "approved" | "templates" | "settings";

const MODULES: Array<{ key: ModuleKey; label: string; icon: any; description: string }> = [
  { key: "outstanding", label: "Outstanding", icon: ShieldAlert,  description: "Missing waivers blocking pay apps — chase here every morning" },
  { key: "received",    label: "Received",    icon: Inbox,        description: "Uploaded by subs, awaiting your approval" },
  { key: "approved",    label: "Approved",    icon: CheckCircle2, description: "Fully cleared and attached to project jacket" },
  { key: "templates",   label: "Templates",   icon: FileText,     description: "50-state library — 200 statutory + generic forms" },
  { key: "settings",    label: "Settings",    icon: Settings,     description: "Seed templates, automation rules, reminder cadence" },
];

const TYPE_LABELS: Record<string, string> = {
  conditional_progress: "Cond. Progress",
  unconditional_progress: "Uncond. Progress",
  conditional_final: "Cond. Final",
  unconditional_final: "Uncond. Final",
};

function fmtAge(d: string): string {
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day";
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.floor(days/7)}w`;
  return `${Math.floor(days/30)}mo`;
}

function WaiverRow({ w, onUpdateStatus }: { w: LienWaiver; onUpdateStatus: (status: "missing"|"uploaded"|"approved") => void }) {
  const ageDays = Math.floor((Date.now() - new Date(w.created_at).getTime()) / 86400000);
  const isOld = ageDays > 14;
  return (
    <Card className={`transition-all ${isOld && w.status === "missing" ? "border-red-300 bg-red-50/30" : "hover:border-blue-300"}`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-semibold leading-tight">
              {w.title}
            </CardTitle>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              <Link href={`/projects/${w.project_id}`}>
                <span className="flex items-center gap-1 hover:text-blue-600 cursor-pointer">
                  <Building2 className="h-3 w-3"/>
                  {w.project_name || w.project_number || w.project_id.slice(0,8)}
                </span>
              </Link>
              {w.state_code && <span>{w.state_code}</span>}
              <span className="text-gray-400">{TYPE_LABELS[w.waiver_type] || w.waiver_type}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge className={
              w.status === "missing" ? "bg-amber-100 text-amber-800 border-amber-200"
              : w.status === "uploaded" ? "bg-blue-100 text-blue-800 border-blue-200"
              : "bg-green-100 text-green-800 border-green-200"
            }>
              {w.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center gap-4 text-xs text-gray-600">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3"/>
            {fmtAge(w.created_at)} ago
          </span>
          {isOld && w.status === "missing" && (
            <span className="text-red-600 font-semibold flex items-center gap-1">
              <AlertTriangle className="h-3 w-3"/>Overdue
            </span>
          )}
        </div>
        <div className="flex gap-2 pt-1">
          {w.status === "missing" && (
            <>
              <Button size="sm" onClick={() => onUpdateStatus("uploaded")} className="bg-blue-600 hover:bg-blue-700">
                <Upload className="h-3 w-3 mr-1"/>Mark received
              </Button>
              <Button size="sm" variant="outline" onClick={() => alert("Reminder send — wire to email service in Phase 3")}>
                Resend reminder
              </Button>
            </>
          )}
          {w.status === "uploaded" && (
            <>
              <Button size="sm" onClick={() => onUpdateStatus("approved")} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-3 w-3 mr-1"/>Approve
              </Button>
              <Button size="sm" variant="outline" onClick={() => onUpdateStatus("missing")} className="text-gray-600">
                Reject
              </Button>
            </>
          )}
          {w.status === "approved" && (
            <Button size="sm" variant="outline" onClick={() => onUpdateStatus("missing")}>
              Reset to missing
            </Button>
          )}
          {w.storage_key && (
            <Button size="sm" variant="ghost" asChild>
              <a href={`/api/uploads/${encodeURIComponent(w.storage_key)}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3 w-3 mr-1"/>View PDF
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SettingsModule() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const seedMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/lien-waivers/seed-templates", {});
      return r.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/lien-waivers"] });
      toast({ title: "Templates seeded", description: `${data.templateCount} templates available across 50 states.` });
    },
    onError: (e: any) => toast({ title: "Seed failed", description: e.message, variant: "destructive" }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5"/>Setup</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold mb-1">Seed 50-state template library</h4>
          <p className="text-xs text-gray-600 mb-2">
            Inserts 200 templates (50 states x 4 waiver types: conditional progress, unconditional progress, conditional final, unconditional final).
            Idempotent — safe to click twice. Required before assigning waivers to a project.
          </p>
          <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending}>
            <Sparkles className="h-4 w-4 mr-1"/>
            {seedMutation.isPending ? "Seeding..." : "Seed templates"}
          </Button>
        </div>
        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold mb-1">Phase 2 (coming)</h4>
          <ul className="text-xs text-gray-600 list-disc list-inside space-y-1">
            <li>Auto-generate waivers from pay-app metadata (state, sub roster, amount-through)</li>
            <li>Email subs with one-click sign link (Phase 3)</li>
            <li>Reminder cadence: T+2, T+4, T+6 days</li>
            <li>Pay-app packet auto-bundling when all waivers received</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplatesModule() {
  const { data: templates = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/lien-waivers/templates"],
    queryFn: async () => {
      const r = await fetch("/api/lien-waivers/templates");
      if (!r.ok) return [];
      return r.json();
    },
  });

  const grouped = useMemo(() => {
    const byState: Record<string, any[]> = {};
    for (const t of templates) {
      const key = `${t.state_code} - ${t.state_name}`;
      if (!byState[key]) byState[key] = [];
      byState[key].push(t);
    }
    return byState;
  }, [templates]);

  if (isLoading) return <div className="text-center py-12 text-gray-400">Loading templates...</div>;
  if (templates.length === 0) return (
    <Card>
      <CardContent className="text-center py-12 text-gray-400">
        <FileText className="h-10 w-10 mx-auto mb-3 opacity-30"/>
        <p>No templates yet. Go to Settings -> Seed templates.</p>
      </CardContent>
    </Card>
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">{templates.length} templates across {Object.keys(grouped).length} states.</p>
      {Object.entries(grouped).map(([state, items]) => (
        <Card key={state}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{state}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {items.map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 p-2 rounded border bg-gray-50">
                  <FileText className="h-3 w-3 text-gray-500"/>
                  <span>{TYPE_LABELS[t.waiver_type] || t.waiver_type}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function LienWaiversWorkspace() {
  const urlParams = new URLSearchParams(window.location.search);
  const initialModule = (urlParams.get("module") as ModuleKey) || "outstanding";
  const [activeModule, setActiveModule] = useState<ModuleKey>(initialModule);
  const [search, setSearch] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: outstanding } = useQuery<OutstandingSummary>({
    queryKey: ["/api/lien-waivers/outstanding"],
    queryFn: async () => {
      const r = await fetch("/api/lien-waivers/outstanding");
      if (!r.ok) return { count: 0, projectCount: 0, oldestDays: null };
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const { data: waivers = [], isLoading } = useQuery<LienWaiver[]>({
    queryKey: ["/api/lien-waivers", activeModule],
    queryFn: async () => {
      if (activeModule === "templates" || activeModule === "settings") return [];
      const statusMap: Record<string, string> = { outstanding: "missing", received: "uploaded", approved: "approved" };
      const s = statusMap[activeModule];
      const r = await fetch(`/api/lien-waivers?status=${s}`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "missing"|"uploaded"|"approved" }) => {
      const r = await apiRequest("PATCH", `/api/lien-waivers/${id}`, { status });
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/lien-waivers"] });
      qc.invalidateQueries({ queryKey: ["/api/lien-waivers/outstanding"] });
      toast({ title: "Status updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return waivers;
    const s = search.toLowerCase();
    return waivers.filter(w =>
      w.title?.toLowerCase().includes(s) ||
      w.project_name?.toLowerCase().includes(s) ||
      w.state_name?.toLowerCase().includes(s)
    );
  }, [waivers, search]);

  const counts = {
    outstanding: outstanding?.count ?? 0,
    received: 0,
    approved: 0,
    templates: 0,
    settings: 0,
  };

  const handleModuleSelect = (k: ModuleKey) => {
    setActiveModule(k);
    const u = new URL(window.location.href);
    u.searchParams.set("module", k);
    window.history.replaceState({}, "", u.toString());
  };

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      <aside className="w-64 border-r bg-white flex-shrink-0 overflow-y-auto">
        <div className="p-4 border-b">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600"/>Lien Waivers
          </h1>
          <p className="text-xs text-gray-500 mt-1">50-state compliance triage</p>
          {outstanding && outstanding.count > 0 && (
            <div className="mt-3 p-2 rounded bg-red-50 border border-red-200">
              <div className="text-xs font-semibold text-red-700">
                {outstanding.count} blocking {outstanding.projectCount} project{outstanding.projectCount === 1 ? "" : "s"}
              </div>
              {outstanding.oldestDays != null && (
                <div className="text-[10px] text-red-600 mt-0.5">Oldest: {outstanding.oldestDays}d</div>
              )}
            </div>
          )}
        </div>
        <nav className="p-2 space-y-0.5">
          {MODULES.map(m => {
            const Icon = m.icon;
            const isActive = activeModule === m.key;
            const count = counts[m.key];
            return (
              <button key={m.key} onClick={() => handleModuleSelect(m.key)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${
                  isActive ? "bg-amber-50 text-amber-800 font-semibold shadow-sm" : "text-gray-700 hover:bg-gray-50"
                }`}
                data-testid={`lien-nav-${m.key}`}>
                <Icon className="h-4 w-4 flex-shrink-0"/>
                <span className="flex-1 text-left">{m.label}</span>
                {count > 0 && m.key === "outstanding" && (
                  <Badge variant="secondary" className="text-[10px] h-5 bg-red-100 text-red-700">{count}</Badge>
                )}
              </button>
            );
          })}
        </nav>
        <div className="p-4 mt-4 text-xs text-gray-400">
          {MODULES.find(m => m.key === activeModule)?.description}
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                {(() => { const Icon = MODULES.find(m => m.key === activeModule)?.icon || ShieldAlert; return <Icon className="h-5 w-5 text-amber-600"/>; })()}
                {MODULES.find(m => m.key === activeModule)?.label}
                <span className="text-sm font-normal text-gray-400">({activeModule === "templates" || activeModule === "settings" ? "" : filtered.length})</span>
              </h2t>
        classNryKNngth})</spantemsge>
<span cla[]> = {            <Badge varib.            cla>
       U(ion({5ter   <p csettings: 0,
  };

  const handleModuleSelect = (k: ModuleK> mg"6l0(
 pcolblur bordme="pb-2:ule)?.d
c     s(:ulleKenorma(c_aivBadge>
      leSelectitlecbordme=".wb-2:u {(g0" 0"/>; })()}
       .waiver_type] que classN{(g0"Ilex-s U(ion({5ter  que classN{(g0"Ilex-s U(ion({5ter  que classE=}>
             yduleSelechlA? "") U<urn ify-lp{(g0"Ilex-s U(io50c?E-") U<urx i"c,(h  </aside>

      isAe="sm" "") U<urn ify-       cla>ex-s U(}omplui n <-.urx i"c,(h  </aside>

      isAe="sm" "") U<urn ify-       cla>ex-s U(}ompat({ title: "Update") U<urn if     "mi]> duleSelect = (k: Ms ionalU(io5mu title               quer    "mi]> duleSelmbg"|"uploaded"st Ico,huTee">
: Ms ionalU(io5mu titlet {
  Shie);
   n c Ttems.map((t: } morning" },
  { key: "received",    labO{ln
    q= "outssName="text-smt.f
     d shadow-
     g" ver8i0t>
 acti"", u.tow-
     g" 4>

 morning" },
  {N ===-cevEex-dulem", u.tow-
    haR* g"mion.iryClient("p-3">
        >
            <  { key: "rfCh != null d0Ex5ter  que classN{(g0"Ilex-s Ulex-1 overflow-y-autonter gap-2">
               tw.$n�fy-       clao   }
  :mN ===-cyassN{(tstanding.cae<Mod     w.$n $}g0"Ilex-ky-app packet aeoN{(g0"Iletext-le( g"mCv- U(ion({5ter  que cla   Res  "mupasiTudDS-}me="text-xsbc text-am>shrink-0 overflow-y-auto=           twd  twd  tb">
{ w: LienWai-c-.|1w.$n�fy-    }.42 <55572 (k: Ms ionalU(io5mu title               quer    "mi]> duleSelmbg"|"uploaded"st Ico,huTee">
: Ms ionalU(io5mu titlet {
  Shie);
   n c Ttems.map((t: } morning" },
  { key: "received",    labO{ln
    q= "outssName="text-smt.f
     d shadow-
     g" ver8i0t>
 orning" },
  { key: "