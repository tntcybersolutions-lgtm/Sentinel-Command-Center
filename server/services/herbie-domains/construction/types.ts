/**
 * server/services/herbie-domains/construction/types.ts
 *
 * Interfaces for the construction-deep domain modules. Every module file
 * (roles, trades, sectors) exports a default DomainModule that
 * conforms to this shape.
 */

import type { RoleId, TradeId, SectorId } from "../../../../shared/construction-taxonomy";

/** What axis this module sits on. The composer uses this to enforce ordering. */
export type DomainAxis = "core" | "role" | "trade" | "sector";

/** A short, machine-recognizable cue Herbie should watch for from this audience. */
export interface ProactiveTrigger {
  /** Slug like coi-expiry-30d - must be unique across the whole codebase. */
  id: string;
  /** Human-readable description (used in audit logs + dev UI). */
  description: string;
  /** Which Herbie tool(s) the trigger calls. */
  tools: string[];
}

/** Voice tweaks specific to this audience. Bounded - cannot override HERBIE.md persona. */
export interface VoiceNudge {
  axis:
    | "shorter"
    | "longer"
    | "more-jargon"
    | "less-jargon"
    | "more-formal"
    | "more-casual"
    | "lead-with-numbers"
    | "lead-with-action"
    | "lead-with-cite";
  when?: string;
}

/** A hint about which Herbie tools matter most for this audience. */
export interface ToolHint {
  tool: string;
  why: string;
  weight: "primary" | "secondary" | "rarely";
}

/** A single domain module - universal shape for roles, trades, sectors, and core. */
export interface DomainModule {
  id: RoleId | TradeId | SectorId | "core";
  axis: DomainAxis;
  label: string;
  prompt: string;
  glossary: Record<string, string>;
  proactiveTriggers?: ProactiveTrigger[];
  voiceNudges?: VoiceNudge[];
  toolHints?: ToolHint[];
  stub?: boolean;
}

/** Composer input. */
export interface CompositionRequest {
  userRole: RoleId | null;
  primaryTrade: TradeId;
  projectSector: SectorId;
}

/** Composer output. */
export interface CompositionResult {
  prompt: string;
  glossary: Record<string, string>;
  proactiveTriggers: ProactiveTrigger[];
  voiceNudges: VoiceNudge[];
  toolHints: ToolHint[];
  loaded: string[];
  hasStubs: boolean;
}
