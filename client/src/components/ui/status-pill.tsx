undefined// ============================================================================
// status-pill.tsx — Sprint 8.2
// ----------------------------------------------------------------------------
// Replaces the 6×6 colored-dot + label pattern with a single integrated pill:
// filled tinted background + icon + label. Three visual cues at once, matches
// the risk-band palette already in use across home-assistant.tsx and bid
// pages (red / amber / yellow / emerald / sky / zinc).
//
// Drop-in usage:
//   <StatusPill status="active" />
//   <StatusPill status="at-risk" label="At Risk" />
//   <StatusPill status="complete" icon={CheckCircle2} />
//
// Or map a numeric risk score directly:
//   <StatusPill.FromRiskScore score={72} />
// ============================================================================

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  CircleAlert,
  CircleDot,
  Clock,
  Pause,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Token map ────────────────────────────────────────────────────────────────
// Tone → (bg, border, text, default icon, default label). Tones intentionally
// mirror riskBand() in home-assistant.tsx so the dashboard reads as one system.

export type StatusTone =
  | "critical"
  | "warning"
  | "watch"
  | "ok"
  | "info"
  | "paused"
  | "neutral";

const TONE_STYLES: Record<
  StatusTone,
  { bg: string; border: string; text: string; icon: LucideIcon; label: string }
> = {
  critical: {
    bg: "bg-red-950/40",
    border: "border-red-900/60",
    text: "text-red-200",
    icon: CircleAlert,
    label: "Critical",
  },
  warning: {
    bg: "bg-amber-950/40",
    border: "border-amber-900/60",
    text: "text-amber-200",
    icon: AlertTriangle,
    label: "At risk",
  },
  watch: {
    bg: "bg-yellow-950/40",
    border: "border-yellow-900/60",
    text: "text-yellow-200",
    icon: CircleDot,
    label: "Watch",
  },
  ok: {
    bg: "bg-emerald-950/40",
    border: "border-emerald-900/60",
    text: "text-emerald-200",
    icon: CheckCircle2,
    label: "Active",
  },
  info: {
    bg: "bg-sky-950/40",
    border: "border-sky-900/60",
    text: "text-sky-200",
    icon: Circle,
    label: "Open",
  },
  paused: {
    bg: "bg-zinc-900/60",
    border: "border-zinc-700",
    text: "text-zinc-200",
    icon: Pause,
    label: "On hold",
  },
  neutral: {
    bg: "bg-zinc-900/40",
    border: "border-zinc-700",
    text: "text-zinc-300",
    icon: Circle,
    label: "Unknown",
  },
};

// ── String → tone resolver ───────────────────────────────────────────────────
// Maps the project's actual status strings (from bids / projects / tasks) onto
// the tone tokens. Keep this loose — new strings just fall to "neutral".

const STATUS_ALIASES: Record<string, StatusTone> = {
  active: "ok",
  in_progress: "ok",
  in_review: "info",
  open: "info",
  pending: "info",
  submitted: "info",
  on_hold: "paused",
  paused: "paused",
  draft: "neutral",
  unscored: "neutral",
  closed: "neutral",
  archived: "neutral",
  complete: "ok",
  completed: "ok",
  approved: "ok",
  rejected: "critical",
  cancelled: "critical",
  canceled: "critical",
  overdue: "critical",
  blocked: "critical",
  at_risk: "warning",
  "at-risk": "warning",
  watch: "watch",
  stable: "ok",
  high_attention: "warning",
  critical: "critical",
};

function resolveTone(status: string | null | undefined): StatusTone {
  if (!status) return "neutral";
  const k = status.toLowerCase().trim().replace(/\s+/g, "_");
  return STATUS_ALIASES[k] ?? "neutral";
}

// ── Size variants ────────────────────────────────────────────────────────────

const SIZE_STYLES = {
  sm: "px-2 py-0.5 text-[11px] gap-1 [&_svg]:h-3 [&_svg]:w-3",
  md: "px-2.5 py-1 text-xs gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5",
  lg: "px-3 py-1.5 text-sm gap-2 [&_svg]:h-4 [&_svg]:w-4",
} as const;

export type StatusPillSize = keyof typeof SIZE_STYLES;

// ── Component ────────────────────────────────────────────────────────────────

export interface StatusPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Free-form status string (e.g. "active", "on_hold", "at-risk"). */
  status?: string | null;
  /** Override the auto-resolved tone. */
  tone?: StatusTone;
  /** Override the displayed label. Defaults to the tone's label or the status string title-cased. */
  label?: string;
  /** Override the leading icon. */
  icon?: LucideIcon;
  /** Pill size. Default: md. */
  size?: StatusPillSize;
  /** Hide the icon. */
  hideIcon?: boolean;
}

function titleCase(s: string) {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

export function StatusPill({
  status,
  tone: toneOverride,
  label: labelOverride,
  icon: IconOverride,
  size = "md",
  hideIcon,
  className,
  ...rest
}: StatusPillProps) {
  const tone = toneOverride ?? resolveTone(status);
  const styles = TONE_STYLES[tone];
  const Icon = IconOverride ?? styles.icon;
  const label =
    labelOverride ??
    (status ? titleCase(status) : styles.label);

  return (
    <span
      data-testid="status-pill"
      data-tone={tone}
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border font-medium",
        styles.bg,
        styles.border,
        styles.text,
        SIZE_STYLES[size],
        className,
      )}
      {...rest}
    >
      {!hideIcon && <Icon aria-hidden="true" />}
      <span>{label}</span>
    </span>
  );
}

// ── Sub-component: risk-score → pill ─────────────────────────────────────────
// Mirrors riskBand() in home-assistant.tsx so the pill stays in lockstep with
// the risk-score chip used elsewhere on the dashboard.

export interface FromRiskScoreProps
  extends Omit<StatusPillProps, "status" | "tone" | "label"> {
  score: number | null | undefined;
}

function FromRiskScore({ score, ...rest }: FromRiskScoreProps) {
  if (score == null) {
    return <StatusPill tone="neutral" label="Unscored" {...rest} />;
  }
  if (score >= 80) return <StatusPill tone="critical" label="Critical" icon={CircleAlert} {...rest} />;
  if (score >= 60) return <StatusPill tone="warning" label="High Attention" icon={AlertTriangle} {...rest} />;
  if (score >= 40) return <StatusPill tone="watch" label="Watch" icon={Clock} {...rest} />;
  return <StatusPill tone="ok" label="Stable" icon={CheckCircle2} {...rest} />;
}

StatusPill.FromRiskScore = FromRiskScore;

export default StatusPill;
