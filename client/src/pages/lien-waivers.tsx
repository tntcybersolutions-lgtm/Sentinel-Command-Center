import { useState, useEffect, useMemo } from "react";
import { useRoute } from "wouter";

/** ---------- Types matching server/lien-waivers.ts ---------- */
type WaiverStatus = "missing" | "requested" | "received" | "approved" | "rejected";
type WaiverType =
  | "conditional_progress"
  | "unconditional_progress"
  | "conditional_final"
  | "unconditional_final";

interface WaiverRow {
  id: string;
  project_id: string;
  project_name?: string;
  folder_id: string;
  template_id: string;
  state_code: string;
  state_name: string;
  waiver_type: WaiverType;
  title: string;
  description: string | null;
  status: WaiverStatus;
  amount?: number | null;
  through_date?: string | null;
  requested_at: string;
  signed_at?: string | null;
  approved_at?: string | null;
  notes?: string | null;
}

interface TemplateRow {
  id: string;
  state_code: string;
  state_name: string;
  waiver_type: WaiverType;
  title: string;
  description: string | null;
}

const MODULES = [
  { key: "outstanding", label: "Outstanding", desc: "Waivers requested but not yet returned" },
  { key: "received", label: "Received", desc: "Returned by sub, pending your review" },
  { key: "approved", label: "Approved", desc: "Fully cleared" },
  { key: "templates", label: "Templates", desc: "50-state library, 200 templates" },
  { key: "settings", label: "Settings", desc: "Seed templates, defaults" },
] as const;

const WAIVER_TYPE_LABEL: Record<WaiverType, string> = {
  conditional_progress: "Conditional Progress",
  unconditional_progress: "Unconditional Progress",
  conditional_final: "Conditional Final",
  unconditional_final: "Unconditional Final",
};

const STATUS_BADGE: Record<WaiverStatus, string> = {
  missing: "bg-amber-100 text-amber-800 border-amber-200",
  requested: "bg-amber-100 text-amber-800 border-amber-200",
  received: "bg-blue-100 text-blue-800 border-blue-200",
  approved: "bg-green-100 text-green-800 border-green-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

/** ---------- Page ---------- */
export default function LienWaivers() {
  const [, params] = useRoute<{ module?: string }>("/lien-waivers/:module");
  const activeModule = params?.module || "outstanding";

  return (
    <div className="flex h-full min-h-screen bg-gray-50">
      <aside className="w-64 shrink-0 border-r border-gray-200 bg-white">
        <div className="px-5 py-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">Lien Waivers</h1>
          <p className="text-xs text-gray-500 mt-1">Cross-project compliance</p>
        </div>
        <nav className="py-2">
          {MODULES.map((m) => {
            const href = m.key === "outstanding" ? "/lien-waivers" : `/lien-waivers/${m.key}`;
            const isActive =
              (m.key === "outstanding" && (activeModule === "outstanding" || !params?.module)) ||
              activeModule === m.key;
            return (
              <a
                key={m.key}
                href={href}
                data-testid={`lw-nav-${m.key}`}
                className={
                  "block px-5 py-3 border-l-4 transition-colors " +
                  (isActive
                    ? "border-amber-500 bg-amber-50 text-amber-900"
                    : "border-transparent text-gray-700 hover:bg-gray-50")
                }
              >
                <div className="font-medium text-sm">{m.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{m.desc}</div>
              </a>
            );
          })}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          {activeModule === "outstanding" && <WaiverList status="missing" key="missing" />}
          {activeModule === "received" && <WaiverList status="received" key="received" />}
          {activeModule === "approved" && <WaiverList status="approved" key="approved" />}
          {activeModule === "templates" && <TemplatesView />}
          {activeModule === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}

/** ---------- WaiverList (Outstanding / Received / Approved) ---------- */
function WaiverList({ status }: { status: WaiverStatus }) {
  const [projectId, setProjectId] = useState<string>("");
  const [rows, setRows] = useState<WaiverRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!projectId) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/lien-waivers?projectId=${encodeURIComponent(projectId)}&status=${status}`,
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "load failed");
      setRows(Array.isArray(j.rows) ? j.rows : []);
    } catch (e: any) {
      setError(e?.message || "load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [projectId, status]);

  async function changeStatus(id: string, next: WaiverStatus) {
    try {
      const r = await fetch(`/api/lien-waivers/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || "update failed");
      }
      load();
    } catch (e: any) {
      alert(e?.message || "update failed");
    }
  }

  const overdue = useMemo(() => {
    if (status !== "missing") return [] as WaiverRow[];
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return rows.filter((r) => {
      const t = r.requested_at ? new Date(r.requested_at).getTime() : 0;
      return t && t < cutoff;
    });
  }, [rows, status]);

  const title =
    status === "missing"
      ? "Outstanding"
      : status === "received"
      ? "Received"
      : "Approved";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-1">
            {status === "missing" && "Requested but not yet returned"}
            {status === "received" && "Returned by sub — review and approve"}
            {status === "approved" && "Fully cleared waivers"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="Project ID"
            data-testid="lw-project-input"
            className="px-3 py-2 border border-gray-300 rounded text-sm w-64"
          />
          <button
            onClick={load}
            data-testid="lw-refresh"
            className="px-3 py-2 bg-gray-800 text-white rounded text-sm hover:bg-gray-900"
          >
            Refresh
          </button>
        </div>
      </div>

      {status === "missing" && overdue.length > 0 && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          <strong>{overdue.length}</strong> waiver{overdue.length === 1 ? "" : "s"} overdue
          (&gt; 14 days since request).
        </div>
      )}

      {!projectId && (
        <div className="text-sm text-gray-500 py-12 text-center border border-dashed border-gray-300 rounded">
          Enter a Project ID above to view waivers.
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-gray-500 py-8 text-center">Loading...</div>}

      {!loading && projectId && rows.length === 0 && (
        <div className="text-sm text-gray-500 py-12 text-center border border-dashed border-gray-300 rounded">
          No {title.toLowerCase()} waivers for this project.
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-700">State</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Title</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Requested</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-2 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">{r.state_code}</td>
                  <td className="px-4 py-3 text-gray-700">{WAIVER_TYPE_LABEL[r.waiver_type]}</td>
                  <td className="px-4 py-3 text-gray-900">{r.title}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {r.requested_at ? new Date(r.requested_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        "inline-flex px-2 py-0.5 rounded text-xs border " + STATUS_BADGE[r.status]
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {status === "missing" && (
                      <button
                        onClick={() => changeStatus(r.id, "received")}
                        data-testid={`lw-mark-received-${r.id}`}
                        className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 mr-1"
                      >
                        Mark Received
                      </button>
                    )}
                    {status === "received" && (
                      <>
                        <button
                          onClick={() => changeStatus(r.id, "approved")}
                          data-testid={`lw-approve-${r.id}`}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 mr-1"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => changeStatus(r.id, "rejected")}
                          data-testid={`lw-reject-${r.id}`}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    {status === "approved" && (
                      <span className="text-xs text-gray-400">Closed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** ---------- Templates view ---------- */
function TemplatesView() {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<string>("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch("/api/lien-waivers/templates");
        const j = await r.json();
        if (cancel) return;
        if (!r.ok) throw new Error(j?.error || "load failed");
        setRows(Array.isArray(j.rows) ? j.rows : []);
      } catch (e: any) {
        if (!cancel) setError(e?.message || "load failed");
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const filtered = stateFilter
    ? rows.filter((r) => r.state_code === stateFilter)
    : rows;
  const states = Array.from(new Set(rows.map((r) => r.state_code))).sort();

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Templates</h2>
          <p className="text-sm text-gray-500 mt-1">
            {rows.length} template{rows.length === 1 ? "" : "s"} loaded
            {rows.length === 0 && " — run Seed Templates from Settings to populate."}
          </p>
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          data-testid="lw-state-filter"
          className="px-3 py-2 border border-gray-300 rounded text-sm"
        >
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      {loading && <div className="text-sm text-gray-500 py-8 text-center">Loading...</div>}

      {!loading && filtered.length === 0 && (
        <div className="text-sm text-gray-500 py-12 text-center border border-dashed border-gray-300 rounded">
          No templates found. Go to Settings and click Seed Templates.
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-700">State</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Type</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Title</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {r.state_code} <span className="text-xs text-gray-500">{r.state_name}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{WAIVER_TYPE_LABEL[r.waiver_type]}</td>
                  <td className="px-4 py-3 text-gray-900">{r.title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** ---------- Settings view ---------- */
function SettingsView() {
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function seed() {
    setSeeding(true);
    setResult(null);
    setError(null);
    try {
      const r = await fetch("/api/lien-waivers/templates/seed", { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "seed failed");
      setResult(`Seeded ${j.count} templates.`);
    } catch (e: any) {
      setError(e?.message || "seed failed");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-1">Settings</h2>
      <p className="text-sm text-gray-500 mb-6">One-time setup and defaults.</p>

      <div className="bg-white rounded-lg border border-gray-200 p-5 max-w-2xl">
        <h3 className="font-semibold text-gray-900 mb-2">Seed Templates</h3>
        <p className="text-sm text-gray-600 mb-4">
          Populates this tenant with 200 templates (50 states &times; 4 waiver types). Safe to run
          repeatedly; existing templates are not duplicated.
        </p>
        <button
          onClick={seed}
          disabled={seeding}
          data-testid="lw-seed-button"
          className="px-4 py-2 bg-amber-600 text-white rounded text-sm hover:bg-amber-700 disabled:opacity-50"
        >
          {seeding ? "Seeding..." : "Seed Templates"}
        </button>
        {result && (
          <div className="mt-3 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
            {result}
          </div>
        )}
        {error && (
          <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm text-red-800">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
