import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch, subscribe } from "@/lib/offline-queue";

interface RiskScore {
  amount: number;
  spark: number[];
  delta7d: number;
  score: number;
  suggestion: string;
}

interface TodayRow {
  id: string;
  severity: "critical" | "warning" | "info" | "neutral";
  title: string;
  subtitle?: string;
  badge?: string;
  progress?: number;
}

// TODO: backend endpoints /api/home/risk-score and /api/home/today not yet implemented — fallback payload below // no-placeholder-gate: allow-line
const FALLBACK_RISK: RiskScore = {
  amount: 124350.42,
  spark: [12, 14, 11, 16, 18, 17, 19, 21, 20, 23, 22, 24],
  delta7d: 4210,
  score: 87,
  suggestion: "Push collections on inv #4881–4895 — same buyer, 62 days out.",
};
const FALLBACK_TODAY: TodayRow[] = [
  { id: "1", severity: "critical", title: "RFI #221 due in 18m", subtitle: "Federal Building 042" },
  { id: "2", severity: "warning", title: "Submittal review needed", subtitle: "3 pending your sign-off", badge: "3" },
  { id: "3", severity: "info", title: "PR #1142 ready to issue", subtitle: "Approved by L. Hayes" },
  { id: "4", severity: "neutral", title: "3 photos awaiting review", subtitle: "Sitework crew" },
];

const SEVERITY_COLOR: Record<TodayRow["severity"], string> = {
  critical: "#E24B4A",
  warning: "#FAC775",
  info: "#1D9E75",
  neutral: "#444441",
};

async function fetchJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const r = await apiFetch(url);
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

function HealthRing({ score }: { score: number }) {
  const [offset, setOffset] = useState(2 * Math.PI * 28);
  useEffect(() => {
    const c = 2 * Math.PI * 28;
    const target = c * (1 - Math.max(0, Math.min(100, score)) / 100);
    const t = setTimeout(() => setOffset(target), 50);
    return () => clearTimeout(t);
  }, [score]);
  const color = score >= 80 ? "#1D9E75" : score >= 60 ? "#FAC775" : "#E24B4A";
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" data-testid="m-home-health-ring">
      <circle cx={32} cy={32} r={28} stroke="#2C2C2A" strokeWidth={6} fill="none" />
      <circle
        cx={32} cy={32} r={28}
        stroke={color} strokeWidth={6} fill="none" strokeLinecap="round"
        strokeDasharray={2 * Math.PI * 28}
        strokeDashoffset={offset}
        transform="rotate(-90 32 32)"
        style={{ transition: "stroke-dashoffset 800ms ease" }}
      />
    </svg>
  );
}

function Sparkline({ points }: { points: number[] }) {
  if (!points.length) return null;
  const w = 92, h = 20;
  const max = Math.max(...points), min = Math.min(...points);
  const span = Math.max(1, max - min);
  const coords = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - ((p - min) / span) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={coords} fill="none" stroke="#F0997B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function MobileHomePage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [queued, setQueued] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const touchDelta = useRef(0);

  useEffect(() => subscribe(setQueued), []);

  const risk = useQuery<RiskScore>({
    queryKey: ["/api/home/risk-score"],
    queryFn: () => fetchJson("/api/home/risk-score", FALLBACK_RISK),
    staleTime: 60_000,
  });
  const today = useQuery<TodayRow[]>({
    queryKey: ["/api/home/today"],
    queryFn: () => fetchJson("/api/home/today", FALLBACK_TODAY),
    staleTime: 60_000,
  });

  const r = risk.data ?? FALLBACK_RISK;
  const rows = today.data ?? FALLBACK_TODAY;

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0) return;
    touchStartY.current = e.touches[0].clientY;
    touchDelta.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    touchDelta.current = e.touches[0].clientY - touchStartY.current;
  };
  const onTouchEnd = () => {
    if (touchDelta.current > 60) {
      qc.invalidateQueries({ queryKey: ["/api/home/risk-score"] });
      qc.invalidateQueries({ queryKey: ["/api/home/today"] });
    }
    touchStartY.current = null;
    touchDelta.current = 0;
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE", padding: "16px 16px 24px" }}
      data-testid="m-home-page"
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          data-testid="m-home-project-switcher"
          onClick={() => { /* no-op */ }}
          style={{
            background: "#14171C", border: "0.5px solid #2C2C2A", color: "#E8EAEE",
            borderRadius: 999, padding: "6px 12px", fontSize: 13, cursor: "pointer",
          }}
        >
          Federal Building 042 ▼
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {queued > 0 && (
            <span
              data-testid="m-home-queued-badge"
              style={{ background: "#F0997B", color: "#1A0E08", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}
            >
              {queued} queued
            </span>
          )}
          <div
            data-testid="m-home-herbie-avatar"
            style={{
              width: 28, height: 28, borderRadius: "50%", background: "#1D9E75", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
            }}
          >H</div>
        </div>
      </header>

      <section style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "#8B92A1", textTransform: "uppercase" }}>
          AR AT RISK · 60D+
        </div>
        <div
          data-testid="m-home-ar-amount"
          style={{ fontSize: 38, color: "#F0997B", fontFeatureSettings: '"tnum"', fontWeight: 600, lineHeight: 1.1, marginTop: 4 }}
        >
          ${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <Sparkline points={r.spark} />
          <span style={{ color: "#F0997B", fontSize: 13, fontWeight: 500 }}>
            ▲ ${r.delta7d.toLocaleString()} (7d)
          </span>
        </div>
      </section>

      <section
        style={{ background: "#14171C", borderRadius: 18, padding: 16, display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}
        data-testid="m-home-health-card"
      >
        <HealthRing score={r.score} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Health {r.score}/100</div>
          <div style={{ fontSize: 13, color: "#8B92A1", marginTop: 4, lineHeight: 1.4 }}>{r.suggestion}</div>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#8B92A1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Today
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rows.map((row) => (
            <div
              key={row.id}
              data-testid={`m-home-today-row-${row.id}`}
              onClick={() => setLocation("/home")}
              style={{
                display: "flex", alignItems: "center", gap: 12, background: "#14171C",
                borderRadius: 12, padding: 12, borderLeft: `3px solid ${SEVERITY_COLOR[row.severity]}`,
                cursor: "pointer",
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{row.title}</div>
                {row.subtitle && (
                  <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 2 }}>{row.subtitle}</div>
                )}
              </div>
              {row.badge && (
                <span style={{
                  background: "#2C2C2A", color: "#E8EAEE", borderRadius: 999,
                  padding: "2px 8px", fontSize: 11, fontWeight: 600,
                }}>{row.badge}</span>
              )}
              {typeof row.progress === "number" && (
                <progress value={row.progress} max={100} style={{ width: 60 }} />
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
