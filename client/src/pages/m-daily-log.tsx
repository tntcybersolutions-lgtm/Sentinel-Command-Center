/**
 * Sprint M5: Mobile daily-log page.
 *
 * Mobile-optimized field journal: weather, crew, equipment, deliveries, visitors,
 * narrative, photos. GPS auto-stamped on submit (FW4 capture helper).
 *
 * Wires to /api/daily-logs (POST creates draft, PATCH updates, status flip submits).
 * Idempotent per project+date so re-saves overwrite the draft, not duplicate.
 */
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import MobileTabBar from "@/components/mobile/m-tab-bar";
import { apiFetch } from "@/lib/offline-queue";

type WeatherT = { conditions?: string; high?: number; low?: number; precip?: number; wind?: number };
type CrewEntry = { trade: string; count: number; hours: number; contractor?: string; notes?: string };
type EquipEntry = { label: string; hours?: number; operator?: string };
type DeliveryEntry = { time: string; vendor: string; material: string; ticket?: string };
type VisitorEntry = { time: string; name: string; company?: string; purpose?: string };

const TRADES = ["carpenter","electrician","plumber","drywall","painter","concrete","ironworker","mason","roofer","hvac","laborer","operator","foreman","super","other"];

/** FW4: best-effort geolocation — never blocks save */
function captureGps(): Promise<{ latitude?: number; longitude?: number; geoAccuracy?: number }> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve({});
    let done = false;
    const finish = (val: any) => { if (!done) { done = true; resolve(val); } };
    setTimeout(() => finish({}), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => finish({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        geoAccuracy: pos.coords.accuracy ?? undefined,
      }),
      () => finish({}),
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 0 }
    );
  });
}

const TODAY = () => new Date().toISOString().slice(0, 10);

export default function MobileDailyLogPage() {
  const [, setLocation] = useLocation();
  const [projectId] = useState("default");
  const [date] = useState(TODAY);
  const [superName, setSuperName] = useState("");
  const [weather, setWeather] = useState<WeatherT>({ conditions: "Clear" });
  const [crew, setCrew] = useState<CrewEntry[]>([]);
  const [equip, setEquip] = useState<EquipEntry[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryEntry[]>([]);
  const [visitors, setVisitors] = useState<VisitorEntry[]>([]);
  const [narrative, setNarrative] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [logId, setLogId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Load existing draft for today
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch(`/api/daily-logs?projectId=${projectId}&date=${date}&status=draft`);
        if (cancelled || !r.ok) return;
        const list = await r.json();
        const draft = (Array.isArray(list) ? list : [])[0];
        if (draft) {
          setLogId(draft.id);
          setSuperName(draft.superName ?? "");
          setWeather(draft.weather ?? { conditions: "Clear" });
          setCrew(draft.crew ?? []);
          setEquip(draft.equipment ?? []);
          setDeliveries(draft.deliveries ?? []);
          setVisitors(draft.visitors ?? []);
          setNarrative(draft.narrative ?? "");
          setPhotoUrls(draft.photoUrls ?? []);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [projectId, date]);

  async function save(status: "draft" | "submitted" = "draft") {
    setErr(null);
    if (status === "submitted") setSubmitting(true); else setSaving(true);
    try {
      const gps = await captureGps();
      const body = {
        projectId, date, superName: superName || undefined,
        weather, crew, equipment: equip, deliveries, visitors,
        narrative: narrative || undefined, photoUrls,
        latitude: gps.latitude ?? null,
        longitude: gps.longitude ?? null,
        geoAccuracy: gps.geoAccuracy ?? null,
        status,
      };
      const r = await apiFetch("/api/daily-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || `HTTP ${r.status}`);
      }
      const saved = await r.json();
      setLogId(saved.id);
      setSavedAt(new Date().toLocaleTimeString());
      if (status === "submitted") setLocation("/m-home");
    } catch (e: any) {
      setErr(String(e.message || e));
    } finally {
      setSaving(false);
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="m-daily-log-page"
      style={{
        background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE",
        padding: "16px 16px calc(96px + env(safe-area-inset-bottom)) 16px",
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Daily Log</h1>
        <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 4 }}>
          {date}{savedAt ? ` · saved ${savedAt}` : logId ? " · draft loaded" : ""}
        </div>
      </header>

      {err && (
        <div data-testid="m-daily-err" style={{ background: "#3a1818", border: "1px solid #6b2424", color: "#ffb0b0", padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {err}
        </div>
      )}

      <Field label="Superintendent">
        <input data-testid="m-daily-super" value={superName} onChange={(e) => setSuperName(e.target.value)} style={inputStyle} />
      </Field>

      <Field label="Weather">
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8 }}>
          <input data-testid="m-daily-weather-cond" placeholder="Conditions" value={weather.conditions ?? ""} onChange={(e) => setWeather({ ...weather, conditions: e.target.value })} style={inputStyle} />
          <input data-testid="m-daily-weather-high" placeholder="High °F" type="number" value={weather.high ?? ""} onChange={(e) => setWeather({ ...weather, high: e.target.value ? Number(e.target.value) : undefined })} style={inputStyle} />
          <input data-testid="m-daily-weather-low" placeholder="Low °F" type="number" value={weather.low ?? ""} onChange={(e) => setWeather({ ...weather, low: e.target.value ? Number(e.target.value) : undefined })} style={inputStyle} />
        </div>
      </Field>

      <Field label={`Crew (${crew.length})`}>
        {crew.map((c, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 32px", gap: 6, marginBottom: 6 }}>
            <select value={c.trade} onChange={(e) => setCrew(crew.map((x, j) => j === i ? { ...x, trade: e.target.value } : x))} style={inputStyle}>
              {TRADES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="number" placeholder="#" value={c.count} onChange={(e) => setCrew(crew.map((x, j) => j === i ? { ...x, count: Number(e.target.value) } : x))} style={inputStyle} />
            <input type="number" placeholder="hrs" value={c.hours} onChange={(e) => setCrew(crew.map((x, j) => j === i ? { ...x, hours: Number(e.target.value) } : x))} style={inputStyle} />
            <button onClick={() => setCrew(crew.filter((_, j) => j !== i))} style={delBtn}>×</button>
          </div>
        ))}
        <button data-testid="m-daily-add-crew" onClick={() => setCrew([...crew, { trade: "laborer", count: 1, hours: 8 }])} style={addBtn}>+ Add crew</button>
      </Field>

      <Field label={`Equipment (${equip.length})`}>
        {equip.map((eq, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 32px", gap: 6, marginBottom: 6 }}>
            <input placeholder="Label" value={eq.label} onChange={(e) => setEquip(equip.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} style={inputStyle} />
            <input type="number" placeholder="hrs" value={eq.hours ?? ""} onChange={(e) => setEquip(equip.map((x, j) => j === i ? { ...x, hours: e.target.value ? Number(e.target.value) : undefined } : x))} style={inputStyle} />
            <button onClick={() => setEquip(equip.filter((_, j) => j !== i))} style={delBtn}>×</button>
          </div>
        ))}
        <button data-testid="m-daily-add-equip" onClick={() => setEquip([...equip, { label: "" }])} style={addBtn}>+ Add equipment</button>
      </Field>

      <Field label={`Deliveries (${deliveries.length})`}>
        {deliveries.map((d, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 2fr 32px", gap: 6, marginBottom: 6 }}>
            <input placeholder="HH:MM" value={d.time} onChange={(e) => setDeliveries(deliveries.map((x, j) => j === i ? { ...x, time: e.target.value } : x))} style={inputStyle} />
            <input placeholder="Vendor — material" value={d.vendor + (d.material ? " — " + d.material : "")} onChange={(e) => {
              const parts = e.target.value.split(/\s*—\s*/);
              setDeliveries(deliveries.map((x, j) => j === i ? { ...x, vendor: parts[0] || "", material: parts[1] || "" } : x));
            }} style={inputStyle} />
            <button onClick={() => setDeliveries(deliveries.filter((_, j) => j !== i))} style={delBtn}>×</button>
          </div>
        ))}
        <button data-testid="m-daily-add-delivery" onClick={() => setDeliveries([...deliveries, { time: "", vendor: "", material: "" }])} style={addBtn}>+ Add delivery</button>
      </Field>

      <Field label="Narrative">
        <textarea data-testid="m-daily-narrative" value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={6} placeholder="What happened today? Productivity, blockers, safety, decisions…" style={{ ...inputStyle, fontFamily: "inherit", resize: "vertical" }} />
      </Field>

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button data-testid="m-daily-save" disabled={saving || submitting} onClick={() => save("draft")} style={saveBtn}>
          {saving ? "Saving…" : "Save draft"}
        </button>
        <button data-testid="m-daily-submit" disabled={saving || submitting} onClick={() => save("submitted")} style={submitBtn}>
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>

      <MobileTabBar active="daily" />
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#14171C", border: "0.5px solid #2C2C2A", color: "#E8EAEE",
  borderRadius: 8, padding: "10px 12px", fontSize: 14, width: "100%", boxSizing: "border-box",
};
const addBtn: React.CSSProperties = {
  background: "transparent", border: "0.5px dashed #2C2C2A", color: "#1D9E75",
  borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer", width: "100%",
};
const delBtn: React.CSSProperties = {
  background: "#2a1818", border: "0.5px solid #6b2424", color: "#ffb0b0",
  borderRadius: 8, fontSize: 16, cursor: "pointer",
};
const saveBtn: React.CSSProperties = {
  flex: 1, background: "#14171C", border: "0.5px solid #2C2C2A", color: "#E8EAEE",
  borderRadius: 10, padding: "12px 16px", fontSize: 15, fontWeight: 500, cursor: "pointer",
};
const submitBtn: React.CSSProperties = {
  flex: 1, background: "#1D9E75", border: "none", color: "#fff",
  borderRadius: 10, padding: "12px 16px", fontSize: 15, fontWeight: 600, cursor: "pointer",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: "#8B92A1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}
