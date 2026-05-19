import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiFetch, subscribe } from "@/lib/offline-queue";
import { SyncSheet } from "@/components/sync-sheet";
import MobileTabBar from "@/components/mobile/m-tab-bar";

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
  href?: string;
}

const SEVERITY_COLOR: Record<TodayRow["severity"], string> = {
  critical: "#E24B4A",
  warning: "#FAC775",
  info: "#1D9E75",
  neutral: "#444441",
};

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
    .map((p, i) => `${(i / Math.max(1, points.length - 1)) * w},${h - ((p - min) / span) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline points={coords} fill="none" stroke="#F0997B" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Shimmer({ height, width = "100%", radius = 12 }: { height: number; width?: string | number; radius?: number }) {
  return (
    <div
      data-testid="m-home-shimmer"
      style={{
        height, width, borderRadius: radius,
        background: "linear-gradient(90deg,#14171C 0%,#1B1F26 50%,#14171C 100%)",
        backgroundSize: "200% 100%",
        animation: "mh-shimmer 1.4s ease-in-out infinite",
      }}
    >
      <style>{`@keyframes mh-shimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>
    </div>
  );
}

export default function MobileHomePage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const [queued, setQueued] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const touchStartY = useRef<number | null>(null);
  const touchDelta = useRef(0);

  useEffect(() => subscribe(setQueued), []);

  // Degraded fallbacks so the home screen never gets stuck in a skeleton when
  // the backend errors — we surface a neutral "service unavailable" state
  // instead, and the user can pull-to-refresh once the backend recovers.
  const RISK_FALLBACK: RiskScore = {
    amount: 0, spark: [0], delta7d: 0, score: 0,
    suggestion: "Live data unavailable — pull down to retry.",
  };
  const TODAY_FALLBACK: TodayRow[] = [{
    id: "offline",
    severity: "neutral",
    title: "Live data unavailable",
    subtitle: "Pull down to retry once you're back online.",
  }];

  const risk = useQuery<RiskScore>({
    queryKey: ["/api/home/risk-score"],
    queryFn: async () => {
      try {
        const r = await apiFetch("/api/home/risk-score");
        if (!r.ok) return RISK_FALLBACK;
        return (await r.json()) as RiskScore;
      } catch { return RISK_FALLBACK; }
    },
    staleTime: 60_000,
  });
  const today = useQuery<TodayRow[]>({
    queryKey: ["/api/home/today"],
    queryFn: async () => {
      try {
        const r = await apiFetch("/api/home/today");
        if (!r.ok) return TODAY_FALLBACK;
        return (await r.json()) as TodayRow[];
      } catch { return TODAY_FALLBACK; }
    },
    staleTime: 60_000,
  });

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

  const r = risk.data;
  const rows = today.data;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      style={{ background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE", padding: "16px 16px calc(80px + env(safe-area-inset-bottom)) 16px" }}
      data-testid="m-home-page"
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <button
          data-testid="m-home-project-switcher"
          onClick={() => setLocation("/projects/active")}
          style={{
            background: "#14171C", border: "0.5px solid #2C2C2A", color: "#E8EAEE",
            borderRadius: 999, padding: "6px 12px", fontSize: 13, cursor: "pointer",
          }}
        >
          All projects ▼
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {queued > 0 && (
            <button
              data-testid="m-home-queued-badge"
              onClick={() => setSheetOpen(true)}
              style={{ background: "#F0997B", color: "#1A0E08", borderRadius: 999, padding: "3px 10px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }}
            >
              {queued} queued
            </button>
          )}
          <button
            data-testid="m-home-herbie-avatar"
            onClick={() => setLocation("/automation/herbie")}
            style={{
              width: 28, height: 28, borderRadius: "50%", background: "#1D9E75", color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700,
              border: "none", cursor: "pointer",
            }}
          >H</button>
        </div>
      </header>

      <SyncSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />

      <section style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "#8B92A1", textTransform: "uppercase" }}>
          AR AT RISK · 60D+
        </div>
        {!r ? (
          <div style={{ marginTop: 8 }}><Shimmer height={42} /></div>
        ) : (
          <>
            <div
              data-testid="m-home-ar-amount"
              style={{ fontSize: 38, color: "#F0997B", fontFeatureSettings: '"tnum"', fontWeight: 600, lineHeight: 1.1, marginTop: 4 }}
            >
              ${r.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
              <Sparkline points={r.spark} />
              <span style={{ color: r.delta7d >= 0 ? "#F0997B" : "#1D9E75", fontSize: 13, fontWeight: 500 }}>
                {r.delta7d >= 0 ? "▲" : "▼"} ${Math.abs(r.delta7d).toLocaleString()} (7d)
              </span>
            </div>
          </>
        )}
      </section>

      <section style={{ marginBottom: 24 }} data-testid="m-home-health-card">
        {!r ? (
          <Shimmer height={96} radius={18} />
        ) : (
          <div style={{ background: "#14171C", borderRadius: 18, padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
            <HealthRing score={r.score} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Health {r.score}/100</div>
              <div style={{ fontSize: 13, color: "#8B92A1", marginTop: 4, lineHeight: 1.4 }}>{r.suggestion}</div>
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 style={{ fontSize: 13, fontWeight: 600, color: "#8B92A1", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
          Today
        </h2>
        {!rows ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Shimmer height={56} />
            <Shimmer height={56} />
            <Shimmer height={56} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((row) => (
              <div
                key={row.id}
                data-testid={`m-home-today-row-${row.id}`}
                onClick={() => row.href && setLocation(row.href)}
                style={{
                  display: "flex", alignItems: "center", gap: 12, background: "#14171C",
                  borderRadius: 12, padding: 12, borderLeft: `3px solid ${SEVERITY_COLOR[row.severity]}`,
                  cursor: row.href ? "pointer" : "default",
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
              </div>
            ))}
          </div>
        )}
      </section>
      <MobileTabBar active="home" />
    </div>
  );
}
