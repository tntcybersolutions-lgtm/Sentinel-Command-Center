/**
 * Sprint M2 — Daily Log
 *
 * Field-team page for capturing a day's work: weather, crew, equipment,
 * deliveries, visitors, narrative, photos, signature.
 *
 * - Mobile-first layout, dark theme matching the rest of Sentinel.
 * - Reuses StatusPill, CardTiered, SafeArea, useCountUp, usePullToRefresh.
 * - Uses MediaRecorder for the narrative mic (same pattern as voice-daily-log.tsx).
 * - Signature: <canvas> with pointer events; produces a data-URL.
 * - Submits to POST /api/daily-logs (in-memory store). Optimistic React Query.
 *
 * Route: /daily-log and /daily-log/:date
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, enqueuePhoto, getPhotoDisplayUrl } from "@/lib/offline-queue";
import { useProjectContext } from "@/nav/project-context";
import { useRoute, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Cloud,
  Sun,
  CloudRain,
  Wind,
  Users,
  Truck,
  UserCheck,
  Wrench,
  Camera,
  Mic,
  MicOff,
  Send,
  Save,
  Trash2,
  Plus,
  PenLine,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { StatusPill } from "@/components/ui/status-pill";
import { CardTiered } from "@/components/ui/card-tiered";
import { SafeArea } from "@/components/ui/safe-area";
import { useCountUp } from "@/hooks/use-count-up";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";

// ---------- Types (mirror daily-logs.routes.ts) ----------

type Trade =
  | "carpenter" | "electrician" | "plumber" | "drywall" | "painter"
  | "concrete" | "ironworker" | "mason" | "roofer" | "hvac"
  | "laborer" | "operator" | "foreman" | "super" | "other";

const TRADES: Trade[] = [
  "carpenter","electrician","plumber","drywall","painter",
  "concrete","ironworker","mason","roofer","hvac",
  "laborer","operator","foreman","super","other",
];

interface CrewEntry { trade: Trade; count: number; hours: number; contractor?: string; notes?: string }
interface Delivery { time: string; vendor: string; material: string; ticket?: string }
interface Visitor { time: string; name: string; company?: string; purpose?: string }
interface Equipment { label: string; hours?: number; operator?: string }
interface Weather { conditions?: string; high?: number; low?: number; precip?: number; wind?: number; source?: "auto" | "manual" }

interface DailyLog {
  id?: string;
  projectId: string;
  date: string;
  superName?: string;
  weather?: Weather;
  crew: CrewEntry[];
  equipment: Equipment[];
  deliveries: Delivery[];
  visitors: Visitor[];
  narrative?: string;
  delayHours?: number;
  delayReason?: string;
  photoUrls: string[];
  signature?: string;
  signedAt?: string;
  status: "draft" | "submitted" | "approved";
}

// ---------- Helpers ----------

const todayIso = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
};

function emptyDraft(date: string, projectId = "default"): DailyLog {
  return {
    projectId, date,
    crew: [], equipment: [], deliveries: [], visitors: [],
    photoUrls: [],
    status: "draft",
  };
}

// Sprint TK2 — thumb that resolves idb-photo:// placeholders to either a
// local Blob preview (offline / pending) or the uploaded objectPath.
function PhotoThumb({ url, index }: { url: string; index: number }) {
  const [src, setSrc] = useState(url);
  useEffect(() => {
    let live = true;
    let revoke: string | null = null;
    getPhotoDisplayUrl(url)
      .then((resolved) => {
        if (!live) return;
        setSrc(resolved);
        if (resolved.startsWith("blob:")) revoke = resolved;
      })
      .catch(() => { /* fall back to original url */ });
    return () => {
      live = false;
      if (revoke) { try { URL.revokeObjectURL(revoke); } catch { /* ignore */ } }
    };
  }, [url]);
  return <img src={src} alt={"photo-" + index} className="h-full w-full object-cover" />;
}

function weatherIcon(c?: string) {
  const x = (c || "").toLowerCase();
  if (x.includes("rain")) return CloudRain;
  if (x.includes("cloud")) return Cloud;
  if (x.includes("wind")) return Wind;
  return Sun;
}

// ---------- Page ----------

export default function DailyLogPage() {
  const [, params] = useRoute("/daily-log/:date");
  const [, setLocation] = useLocation();
  const date = params?.date || todayIso();
  const queryClient = useQueryClient();
  const { selectedProjectId } = useProjectContext();
  const projectId = selectedProjectId || "default";

  // Fetch existing log for this date (draft preferred)
  const { data: existing, isLoading } = useQuery<DailyLog[]>({
    queryKey: ["/api/daily-logs", { date, projectId }],
    queryFn: async () => {
      const r = await fetch(`/api/daily-logs?date=${date}&projectId=${encodeURIComponent(projectId)}`);
      if (!r.ok) throw new Error("Failed to load");
      return r.json();
    },
  });

  const seeded = useMemo(() => {
    if (!existing || existing.length === 0) return emptyDraft(date, projectId);
    // Prefer draft over submitted for editing
    const draft = existing.find((x) => x.status === "draft");
    return draft || existing[0];
  }, [existing, date, projectId]);

  const [log, setLog] = useState<DailyLog>(seeded);
  useEffect(() => setLog(seeded), [seeded]);

  // Pull-to-refresh
  const { containerRef, pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/daily-logs", { date }] });
    },
  });

  // Sprint TK4 — if a freshly-drawn signature is still a data: URL,
  // push it through the photo queue so the daily_logs row stores a tiny
  // objectPath reference instead of a 50-200KB inline base64 blob.
  // Replays auto-swap idb-photo://<id> for the real path.
  const prepareForSave = useCallback(async (payload: DailyLog): Promise<DailyLog> => {
    if (!payload.signature || !payload.signature.startsWith("data:")) return payload;
    try {
      const blob = await (await fetch(payload.signature)).blob();
      const { placeholderUrl } = await enqueuePhoto(blob, {
        filename: "signature-" + payload.date + ".png",
        contentType: "image/png",
        context: "daily-log-sig:" + payload.date,
      });
      const updated = { ...payload, signature: placeholderUrl };
      setLog((p) => ({ ...p, signature: placeholderUrl }));
      return updated;
    } catch (e) {
      console.warn("[daily-log] signature upload failed, sending inline", e);
      return payload;
    }
  }, []);

  // Save mutation (POST always — backend upserts drafts)
  const saveMutation = useMutation({
    mutationFn: async (payload: DailyLog) => {
      const prepared = await prepareForSave(payload);
      const r = await apiFetch(`/api/daily-logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prepared),
      });
      if (!r.ok) throw new Error("Save failed");
      return r.json() as Promise<DailyLog>;
    },
    onSuccess: (saved) => {
      setLog(saved);
      queryClient.invalidateQueries({ queryKey: ["/api/daily-logs"] });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (payload: DailyLog) => {
      const prepared = await prepareForSave(payload);
      const final = { ...prepared, status: "submitted" as const };
      // If we have an id, PATCH; otherwise POST then PATCH
      let id = payload.id;
      if (!id) {
        const created = await apiFetch(`/api/daily-logs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(final),
        }).then((r) => r.json());
        id = created.id;
      } else {
        await apiFetch(`/api/daily-logs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "submitted", signedAt: new Date().toISOString() }),
        });
      }
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daily-logs"] });
      setLocation("/daily-log");
    },
  });

  // Auto-pull weather on mount if not set
  useEffect(() => {
    if (log.weather && log.weather.source) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
          const r = await fetch(url);
          if (!r.ok) return;
          const j = await r.json();
          const w: Weather = {
            conditions: j.current_weather?.weathercode === 0 ? "Sunny" : "Partly Cloudy",
            high: Math.round(j.daily?.temperature_2m_max?.[0] ?? j.current_weather?.temperature ?? 0),
            low: Math.round(j.daily?.temperature_2m_min?.[0] ?? j.current_weather?.temperature ?? 0),
            precip: Number(j.daily?.precipitation_sum?.[0] ?? 0),
            wind: Math.round(j.current_weather?.windspeed ?? 0),
            source: "auto",
          };
          setLog((p) => ({ ...p, weather: w }));
        } catch {}
      },
      () => {},
      { timeout: 8000, maximumAge: 60 * 60 * 1000 },
    );
  }, [log.weather]);

  // Voice capture for narrative
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        // Send to a (hypothetical) transcription endpoint; if missing, just attach a note
        try {
          const fd = new FormData();
          fd.append("audio", blob, "narrative.webm");
          const r = await fetch("/api/transcribe", { method: "POST", body: fd });
          if (r.ok) {
            const { text } = await r.json();
            setLog((p) => ({ ...p, narrative: ((p.narrative || "") + (p.narrative ? "\n" : "") + text).trim() }));
            return;
          }
        } catch {}
        // Fallback: paste a placeholder so the user notices and types
        setLog((p) => ({ ...p, narrative: ((p.narrative || "") + "\n[voice memo recorded — transcription unavailable]").trim() }));
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      console.error(e);
    }
  };
  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  // ---------- Sub-components for repeatable rows ----------

  function CrewRow({ idx }: { idx: number }) {
    const c = log.crew[idx];
    const setRow = (patch: Partial<CrewEntry>) =>
      setLog((p) => ({ ...p, crew: p.crew.map((x, i) => (i === idx ? { ...x, ...patch } : x)) }));
    const remove = () => setLog((p) => ({ ...p, crew: p.crew.filter((_, i) => i !== idx) }));
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
        <select
          aria-label="Trade"
          className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700"
          value={c.trade}
          onChange={(e) => setRow({ trade: e.target.value as Trade })}
        >
          {TRADES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input
          type="number" min={0} aria-label="Count"
          className="w-16 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700"
          value={c.count}
          onChange={(e) => setRow({ count: +e.target.value })}
          placeholder="qty"
        />
        <span className="text-xs text-slate-500">×</span>
        <input
          type="number" min={0} max={24} step={0.5} aria-label="Hours"
          className="w-16 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700"
          value={c.hours}
          onChange={(e) => setRow({ hours: +e.target.value })}
          placeholder="hrs"
        />
        <input
          type="text" aria-label="Contractor"
          className="flex-1 min-w-[120px] rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700"
          value={c.contractor || ""}
          onChange={(e) => setRow({ contractor: e.target.value })}
          placeholder="Contractor (optional)"
        />
        <button onClick={remove} aria-label="Remove crew row" className="rounded p-1 text-rose-400 hover:bg-rose-950/40">
          <Trash2 size={16} />
        </button>
      </div>
    );
  }

  function DeliveryRow({ idx }: { idx: number }) {
    const d = log.deliveries[idx];
    const setRow = (patch: Partial<Delivery>) =>
      setLog((p) => ({ ...p, deliveries: p.deliveries.map((x, i) => (i === idx ? { ...x, ...patch } : x)) }));
    const remove = () => setLog((p) => ({ ...p, deliveries: p.deliveries.filter((_, i) => i !== idx) }));
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
        <input type="time" aria-label="Time" className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={d.time} onChange={(e) => setRow({ time: e.target.value })} />
        <input type="text" aria-label="Vendor" placeholder="Vendor" className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={d.vendor} onChange={(e) => setRow({ vendor: e.target.value })} />
        <input type="text" aria-label="Material" placeholder="Material" className="flex-1 min-w-[140px] rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={d.material} onChange={(e) => setRow({ material: e.target.value })} />
        <input type="text" aria-label="Ticket" placeholder="Ticket #" className="w-28 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={d.ticket || ""} onChange={(e) => setRow({ ticket: e.target.value })} />
        <button onClick={remove} aria-label="Remove delivery row" className="rounded p-1 text-rose-400 hover:bg-rose-950/40"><Trash2 size={16} /></button>
      </div>
    );
  }

  function VisitorRow({ idx }: { idx: number }) {
    const v = log.visitors[idx];
    const setRow = (patch: Partial<Visitor>) =>
      setLog((p) => ({ ...p, visitors: p.visitors.map((x, i) => (i === idx ? { ...x, ...patch } : x)) }));
    const remove = () => setLog((p) => ({ ...p, visitors: p.visitors.filter((_, i) => i !== idx) }));
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
        <input type="time" aria-label="Time" className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={v.time} onChange={(e) => setRow({ time: e.target.value })} />
        <input type="text" aria-label="Name" placeholder="Name" className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={v.name} onChange={(e) => setRow({ name: e.target.value })} />
        <input type="text" aria-label="Company" placeholder="Company" className="rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={v.company || ""} onChange={(e) => setRow({ company: e.target.value })} />
        <input type="text" aria-label="Purpose" placeholder="Purpose" className="flex-1 min-w-[140px] rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={v.purpose || ""} onChange={(e) => setRow({ purpose: e.target.value })} />
        <button onClick={remove} aria-label="Remove visitor row" className="rounded p-1 text-rose-400 hover:bg-rose-950/40"><Trash2 size={16} /></button>
      </div>
    );
  }

  function EquipmentRow({ idx }: { idx: number }) {
    const eq = log.equipment[idx];
    const setRow = (patch: Partial<Equipment>) =>
      setLog((p) => ({ ...p, equipment: p.equipment.map((x, i) => (i === idx ? { ...x, ...patch } : x)) }));
    const remove = () => setLog((p) => ({ ...p, equipment: p.equipment.filter((_, i) => i !== idx) }));
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-2">
        <input type="text" aria-label="Equipment" placeholder="Equipment" className="flex-1 min-w-[140px] rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={eq.label} onChange={(e) => setRow({ label: e.target.value })} />
        <input type="number" min={0} max={24} step={0.5} aria-label="Hours" placeholder="hrs" className="w-20 rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={eq.hours ?? ""} onChange={(e) => setRow({ hours: e.target.value === "" ? undefined : +e.target.value })} />
        <input type="text" aria-label="Operator" placeholder="Operator" className="flex-1 min-w-[120px] rounded bg-slate-800 px-2 py-1 text-sm text-slate-100 border border-slate-700" value={eq.operator || ""} onChange={(e) => setRow({ operator: e.target.value })} />
        <button onClick={remove} aria-label="Remove equipment row" className="rounded p-1 text-rose-400 hover:bg-rose-950/40"><Trash2 size={16} /></button>
      </div>
    );
  }

  // ---------- Signature Pad ----------

  const sigRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  const sigPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = sigRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
  };
  const sigDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = true;
    lastPtRef.current = sigPoint(e);
  };
  const sigMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const c = sigRef.current!;
    const ctx = c.getContext("2d")!;
    const p = sigPoint(e);
    ctx.strokeStyle = "#E8EAEE";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(lastPtRef.current!.x, lastPtRef.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPtRef.current = p;
  };
  const sigUp = () => {
    drawingRef.current = false;
    lastPtRef.current = null;
    const c = sigRef.current!;
    setLog((p) => ({ ...p, signature: c.toDataURL("image/png") }));
  };
  const sigClear = () => {
    const c = sigRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setLog((p) => ({ ...p, signature: undefined }));
  };

  // ---------- Stats ----------

  const totalHours = log.crew.reduce((sum, c) => sum + c.count * c.hours, 0);
  const totalCrew = log.crew.reduce((sum, c) => sum + c.count, 0);
  const totalCrewCount = useCountUp(totalCrew);
  const totalHoursCount = useCountUp(Math.round(totalHours));
  const totalDeliveriesCount = useCountUp(log.deliveries.length);
  const totalVisitorsCount = useCountUp(log.visitors.length);

  const WIcon = weatherIcon(log.weather?.conditions);
  const submitted = log.status !== "draft";

  return (
    <SafeArea sides={["top", "bottom"]} className="min-h-screen bg-slate-950 text-slate-100">
      <div ref={containerRef as any} className="relative">
        {/* Pull-to-refresh indicator */}
        {pullDistance > 0 && (
          <div className="pointer-events-none absolute left-0 right-0 top-0 flex justify-center" style={{ transform: `translateY(${pullDistance - 24}px)` }}>
            <div className={`rounded-full bg-emerald-700/30 px-3 py-1 text-xs ${isRefreshing ? "animate-spin" : ""}`}>↻</div>
          </div>
        )}

        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-emerald-400" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">Daily Log</h1>
                <p className="text-xs text-slate-400">{fmtDate(date)}</p>
              </div>
            </div>
            <StatusPill status={submitted ? "submitted" : "draft"} />
          </div>
        </header>

        <main className="px-4 py-4 space-y-4 max-w-3xl mx-auto">

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <CardTiered tier="secondary" className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Crew</div>
              <div className="text-2xl font-bold tabular-nums">{totalCrewCount}</div>
            </CardTiered>
            <CardTiered tier="secondary" className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Man-hours</div>
              <div className="text-2xl font-bold tabular-nums">{totalHoursCount}</div>
            </CardTiered>
            <CardTiered tier="secondary" className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Deliveries</div>
              <div className="text-2xl font-bold tabular-nums">{totalDeliveriesCount}</div>
            </CardTiered>
            <CardTiered tier="secondary" className="p-3">
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Visitors</div>
              <div className="text-2xl font-bold tabular-nums">{totalVisitorsCount}</div>
            </CardTiered>
          </div>

          {/* Weather */}
          <CardTiered tier="hero" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><WIcon size={16} /> Weather</h2>
              <span className="text-[10px] uppercase tracking-wide text-slate-500">
                {log.weather?.source === "auto" ? "auto-pulled" : "manual"}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <input className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-sm" placeholder="Conditions" value={log.weather?.conditions || ""} onChange={(e) => setLog((p) => ({ ...p, weather: { ...p.weather, conditions: e.target.value, source: "manual" } }))} />
              <input type="number" className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-sm" placeholder="High °F" value={log.weather?.high ?? ""} onChange={(e) => setLog((p) => ({ ...p, weather: { ...p.weather, high: +e.target.value, source: "manual" } }))} />
              <input type="number" className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-sm" placeholder="Low °F" value={log.weather?.low ?? ""} onChange={(e) => setLog((p) => ({ ...p, weather: { ...p.weather, low: +e.target.value, source: "manual" } }))} />
              <input type="number" step={0.01} className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-sm" placeholder='Precip "' value={log.weather?.precip ?? ""} onChange={(e) => setLog((p) => ({ ...p, weather: { ...p.weather, precip: +e.target.value, source: "manual" } }))} />
              <input type="number" className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-sm" placeholder="Wind mph" value={log.weather?.wind ?? ""} onChange={(e) => setLog((p) => ({ ...p, weather: { ...p.weather, wind: +e.target.value, source: "manual" } }))} />
            </div>
          </CardTiered>

          {/* Crew */}
          <CardTiered tier="secondary" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Users size={16} /> Crew on site</h2>
              <button onClick={() => setLog((p) => ({ ...p, crew: [...p.crew, { trade: "laborer", count: 1, hours: 8 }] }))} className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-1 font-semibold flex items-center gap-1"><Plus size={12} />Add</button>
            </div>
            <div className="space-y-2">
              {log.crew.length === 0 && <p className="text-xs text-slate-500">No crew entries yet.</p>}
              {log.crew.map((_, i) => <CrewRow key={i} idx={i} />)}
            </div>
          </CardTiered>

          {/* Equipment */}
          <CardTiered tier="secondary" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Wrench size={16} /> Equipment</h2>
              <button onClick={() => setLog((p) => ({ ...p, equipment: [...p.equipment, { label: "" }] }))} className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-1 font-semibold flex items-center gap-1"><Plus size={12} />Add</button>
            </div>
            <div className="space-y-2">
              {log.equipment.length === 0 && <p className="text-xs text-slate-500">No equipment yet.</p>}
              {log.equipment.map((_, i) => <EquipmentRow key={i} idx={i} />)}
            </div>
          </CardTiered>

          {/* Deliveries */}
          <CardTiered tier="secondary" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Truck size={16} /> Deliveries</h2>
              <button onClick={() => setLog((p) => ({ ...p, deliveries: [...p.deliveries, { time: "08:00", vendor: "", material: "" }] }))} className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-1 font-semibold flex items-center gap-1"><Plus size={12} />Add</button>
            </div>
            <div className="space-y-2">
              {log.deliveries.length === 0 && <p className="text-xs text-slate-500">No deliveries logged.</p>}
              {log.deliveries.map((_, i) => <DeliveryRow key={i} idx={i} />)}
            </div>
          </CardTiered>

          {/* Visitors */}
          <CardTiered tier="secondary" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><UserCheck size={16} /> Visitors</h2>
              <button onClick={() => setLog((p) => ({ ...p, visitors: [...p.visitors, { time: "09:00", name: "" }] }))} className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-1 font-semibold flex items-center gap-1"><Plus size={12} />Add</button>
            </div>
            <div className="space-y-2">
              {log.visitors.length === 0 && <p className="text-xs text-slate-500">No visitors logged.</p>}
              {log.visitors.map((_, i) => <VisitorRow key={i} idx={i} />)}
            </div>
          </CardTiered>

          {/* Narrative + Voice */}
          <CardTiered tier="secondary" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><PenLine size={16} /> Narrative</h2>
              <button
                onMouseDown={(e) => { e.preventDefault(); startRecording(); }}
                onMouseUp={() => recording && stopRecording()}
                onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                onTouchEnd={() => recording && stopRecording()}
                className={`text-xs rounded px-2 py-1 font-semibold flex items-center gap-1 ${recording ? "bg-rose-600 hover:bg-rose-500" : "bg-slate-700 hover:bg-slate-600"}`}
                aria-pressed={recording}
              >
                {recording ? <MicOff size={12} /> : <Mic size={12} />}
                {recording ? "Recording…" : "Hold to speak"}
              </button>
            </div>
            <textarea
              className="w-full min-h-[140px] rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-100"
              placeholder="What happened on site today? Work performed, deliveries, weather impact, incidents, decisions, lookahead…"
              value={log.narrative || ""}
              onChange={(e) => setLog((p) => ({ ...p, narrative: e.target.value }))}
            />

            {/* Delay */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input type="number" min={0} max={24} step={0.5} className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-sm" placeholder="Delay hours (if any)" value={log.delayHours ?? ""} onChange={(e) => setLog((p) => ({ ...p, delayHours: e.target.value === "" ? undefined : +e.target.value }))} />
              <input className="rounded bg-slate-900 border border-slate-800 px-2 py-1 text-sm" placeholder="Reason (weather / RFI / sub no-show)" value={log.delayReason || ""} onChange={(e) => setLog((p) => ({ ...p, delayReason: e.target.value }))} />
            </div>

            {(log.delayHours ?? 0) > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded bg-amber-950/40 border border-amber-900/60 p-2 text-amber-200 text-xs">
                <AlertTriangle size={14} className="mt-[2px]" />
                <span>{log.delayHours}h delay logged. Owner notification may be required per contract.</span>
              </div>
            )}
          </CardTiered>

          {/* Photos placeholder */}
          <CardTiered tier="secondary" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Camera size={16} /> Photos</h2>
              <label className="text-xs rounded bg-emerald-700 hover:bg-emerald-600 px-2 py-1 font-semibold cursor-pointer flex items-center gap-1">
                <Plus size={12} /> Capture
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={async (e) => {
                    const files = Array.from(e.target.files || []);
                    // Sprint TK2 — stash each captured photo in IDB via enqueuePhoto.
                    // Returns a stable \`idb-photo://<id>\` placeholder that we store
                    // in photoUrls; the queue uploads in the background and the
                    // placeholder is auto-rewritten to the real objectPath on the
                    // next save replay. Captures survive going offline.
                    for (const f of files) {
                      try {
                        const { placeholderUrl } = await enqueuePhoto(f, { context: "daily-log:" + date });
                        setLog((p) => ({ ...p, photoUrls: [...p.photoUrls, placeholderUrl] }));
                      } catch (err) {
                        console.error("[daily-log] enqueuePhoto failed", err);
                      }
                    }
                  }}
                />
              </label>
            </div>
            {log.photoUrls.length === 0 ? (
              <p className="text-xs text-slate-500">No photos yet. Hit Capture to use the camera.</p>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {log.photoUrls.map((u, i) => (
                  <div key={u + i} className="relative aspect-square overflow-hidden rounded border border-slate-800">
                    <PhotoThumb url={u} index={i} />
                    <button onClick={() => setLog((p) => ({ ...p, photoUrls: p.photoUrls.filter((_, j) => j !== i) }))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-rose-300 hover:bg-black/80"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </CardTiered>

          {/* Signature */}
          <CardTiered tier="secondary" className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-2"><CheckCircle2 size={16} /> Signature</h2>
              <button onClick={sigClear} className="text-xs rounded bg-slate-700 hover:bg-slate-600 px-2 py-1 font-semibold">Clear</button>
            </div>
            <div className="rounded border border-slate-800 bg-slate-900/60 p-1">
              <canvas
                ref={sigRef}
                width={640}
                height={180}
                className="w-full touch-none rounded bg-slate-950"
                onPointerDown={sigDown}
                onPointerMove={sigMove}
                onPointerUp={sigUp}
                onPointerLeave={sigUp}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              Sign with finger or stylus. Signature is captured as part of the submitted log.
            </p>
          </CardTiered>

          {/* Actions */}
          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 flex gap-2">
            <button
              onClick={() => saveMutation.mutate(log)}
              disabled={saveMutation.isPending || submitted}
              className="flex-1 rounded-lg bg-slate-700 hover:bg-slate-600 px-3 py-2 text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Save size={14} /> Save draft
            </button>
            <button
              onClick={() => submitMutation.mutate(log)}
              disabled={submitMutation.isPending || submitted || log.crew.length === 0}
              className="flex-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 px-3 py-2 text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50"
              title={log.crew.length === 0 ? "Add at least one crew entry before submitting" : ""}
            >
              <Send size={14} /> {submitted ? "Submitted" : "Submit"}
            </button>
          </div>

          {isLoading && <p className="text-xs text-slate-500 text-center">Loading existing log for this day…</p>}
        </main>
      </div>
    </SafeArea>
  );
}
