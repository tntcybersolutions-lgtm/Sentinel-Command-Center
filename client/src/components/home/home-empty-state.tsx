// ============================================================================
// home-empty-state.tsx — Zero-project new-account experience
// ----------------------------------------------------------------------------
// Renders when projects.length === 0. Replaces the entire home page contents
// instead of showing empty cards with "--" placeholders.
//
// Structure:
//   1. Big welcome hero with project-creation CTA
//   2. "What Sentinel does" 3-card grid (Punch / Daily Log / Money & RFI)
//   3. "Got data elsewhere?" import options (Procore / Buildertrend / CSV)
//   4. Bottom strip: "Take a 60-second tour" + "Watch a 2-minute demo"
//
// All visual styling matches the existing Sentinel dark palette. No external
// illustrations — uses lucide-react icons + Tailwind gradients only.
// ============================================================================

import { useLocation } from "wouter";
import {
  Sparkles,
  ListChecks,
  ClipboardList,
  DollarSign,
  FileText,
  Upload,
  Play,
  ArrowRight,
  Building2,
  Briefcase,
  FileSpreadsheet,
} from "lucide-react";

export interface HomeEmptyStateProps {
  className?: string;
}

export function HomeEmptyState({ className = "" }: HomeEmptyStateProps) {
  const [, navigate] = useLocation();

  return (
    <div data-testid="home-empty-state" className={`max-w-5xl mx-auto px-4 py-8 sm:py-12 ${className}`}>

      {/* ─── Welcome hero ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl ring-1 ring-violet-900/40 bg-gradient-to-br from-violet-950/40 via-zinc-950 to-zinc-950 p-6 sm:p-10">
        <div className="absolute -top-20 -right-20 h-64 w-64 rounded-full bg-violet-600/20 blur-3xl" aria-hidden />
        <div className="absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-fuchsia-600/10 blur-3xl" aria-hidden />

        <div className="relative">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-950/60 ring-1 ring-violet-900/60 text-xs font-medium text-violet-300 mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Welcome to Sentinel</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-zinc-100 leading-tight tracking-tight">
            One project to start.<br />
            <span className="text-violet-400">Everything in one place</span> from there.
          </h1>

          <p className="mt-4 text-base sm:text-lg text-zinc-400 max-w-2xl leading-relaxed">
            Punch lists, daily logs, drawings, RFIs, submittals, COIs, pay apps — all on one screen,
            with an AI assistant that watches for what needs your attention.
          </p>

          <div className="mt-7 flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => navigate("/projects/new")}
              data-testid="empty-state-create-project"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-900/50 transition"
            >
              <Sparkles className="h-4 w-4" />
              <span>Create your first project</span>
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate("/welcome")}
              data-testid="empty-state-take-tour"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-medium text-zinc-300 bg-zinc-900/60 hover:bg-zinc-800/60 ring-1 ring-zinc-800 transition"
            >
              <Play className="h-4 w-4" />
              <span>Take a 60-second tour</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── What Sentinel does (3 cards) ───────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
          What you'll do here
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <FeatureCard
            icon={ListChecks}
            iconColor="text-amber-300"
            iconBg="bg-amber-950/60"
            title="Punch & Observations"
            description="Photo + assignee + severity, swipe to advance, voice-capture from the field."
            href="/punch-list"
            cta="Open punch list"
          />
          <FeatureCard
            icon={ClipboardList}
            iconColor="text-sky-300"
            iconBg="bg-sky-950/60"
            title="Daily Log"
            description="Weather, manpower, deliveries, photos — captured by voice in 30 seconds."
            href="/m-daily-log"
            cta="See daily log"
          />
          <FeatureCard
            icon={DollarSign}
            iconColor="text-emerald-300"
            iconBg="bg-emerald-950/60"
            title="Money & RFI"
            description="Pay apps, lien waivers, COIs, RFI ball-in-court — all surfaced before they slip."
            href="/financial/overview"
            cta="See financials"
          />
        </div>
      </div>

      {/* ─── Already have data elsewhere? ───────────────────────────────── */}
      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3 px-1">
          Already running another tool?
        </h2>
        <div className="rounded-2xl ring-1 ring-zinc-800 bg-zinc-950/40 p-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-zinc-900 flex items-center justify-center">
              <Upload className="h-4.5 w-4.5 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Import your existing projects</h3>
              <p className="text-xs text-zinc-400 mt-0.5">Bring history over so you're not starting from zero.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <ImportButton
              icon={Building2}
              label="Import from Procore"
              href="/import/procore"
            />
            <ImportButton
              icon={Briefcase}
              label="Import from Buildertrend"
              href="/import/buildertrend"
            />
            <ImportButton
              icon={FileSpreadsheet}
              label="Import from CSV"
              href="/import/csv"
            />
          </div>
        </div>
      </div>

      {/* ─── Bottom strip ───────────────────────────────────────────────── */}
      <div className="mt-8 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between p-4 rounded-2xl ring-1 ring-zinc-800 bg-zinc-950/40">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-violet-950/40 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-violet-300" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-200">Need a hand? Herbie can walk you through.</div>
            <div className="text-xs text-zinc-500">Or watch a 2-minute demo to see Sentinel in action.</div>
          </div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={() => navigate("/welcome")}
            className="px-3 py-2 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 ring-1 ring-zinc-800"
          >
            Watch demo
          </button>
          <button
            type="button"
            onClick={() => navigate("/herbie")}
            className="px-3 py-2 rounded-lg text-xs font-medium text-violet-200 bg-violet-950/60 hover:bg-violet-900/60 ring-1 ring-violet-900/40"
          >
            Ask Herbie
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function FeatureCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  description,
  href,
  cta,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className="text-left rounded-2xl ring-1 ring-zinc-800 bg-zinc-950/40 p-4 hover:ring-zinc-700 hover:bg-zinc-900/40 transition group"
    >
      <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
        <Icon className={`h-5 w-5 ${iconColor}`} />
      </div>
      <h3 className="text-sm font-semibold text-zinc-100 mb-1">{title}</h3>
      <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
      <div className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-zinc-500 group-hover:text-violet-300 transition">
        <span>{cta}</span>
        <ArrowRight className="h-3 w-3" />
      </div>
    </button>
  );
}

function ImportButton({
  icon: Icon,
  label,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
}) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate(href)}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg ring-1 ring-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/60 hover:ring-zinc-700 transition text-left"
    >
      <Icon className="h-4 w-4 text-zinc-400 flex-shrink-0" />
      <span className="text-xs font-medium text-zinc-200 truncate">{label}</span>
    </button>
  );
}

export default HomeEmptyState;
—
