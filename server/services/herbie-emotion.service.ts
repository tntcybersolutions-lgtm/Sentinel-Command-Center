/**
 * server/services/herbie-emotion.service.ts
 *
 * Heuristic-first emotion classifier with a Haiku fallback for ambiguous
 * messages. Output feeds the system-prompt adaptation block - never echoed
 * to the user.
 *
 * Hard rule: this service must NEVER cause Herbie to narrate the user emotional
 * state back at them. See HERBIE.md "Read the room. Never say it."
 */

import type { ChatMessage } from "../../shared/types/chat";
import { llmProvider } from "./llm";

export type EmotionalState =
  | "calm"
  | "stressed"
  | "frustrated"
  | "confused"
  | "celebrating"
  | "urgent"
  | "discouraged";

export type EmotionSource = "heuristic" | "haiku" | "cache" | "default";

export interface EmotionalReading {
  state: EmotionalState;
  confidence: number;
  source: EmotionSource;
  signals: string[];
  classifiedAt: string;
}

export interface EmotionContext {
  prior: EmotionalReading | null;
  recent: ChatMessage[];
}

const CACHE_TTL_TURNS = 3;
const HEURISTIC_CONFIDENCE_FLOOR = 0.75;

const PROFANITY = /\b(fuck|fucking|fucked|shit|shitty|damn|hell|bullshit|crap|pissed|wtf|stfu)\b/i;
const URGENCY = /\b(asap|now|emergency|urgent|fire|down|broken|breaking|outage|crisis|stop\s*working|blocking)\b/i;
const STRESS = /\b(overwhelmed|too\s+much|drowning|behind|slammed|swamped|underwater|burnt?\s*out|exhausted)\b/i;
const DISCOURAGEMENT = /\b(giving\s+up|tried\s+everything|nothing\s+works|hopeless|stuck|cant\s+(do|figure)|no\s+idea|lost|defeated)\b/i;
const CELEBRATION = /\b(thanks|thank\s+you|appreciate|nice|love\s+it|awesome|finally|works|did\s+it|great|perfect|nailed\s+it|yes!?)\b/i;

interface SignalCounts {
  capsRatio: number;
  exclaims: number;
  questions: number;
  length: number;
  hasProfanity: boolean;
  hasUrgency: boolean;
  hasStress: boolean;
  hasDiscouragement: boolean;
  hasCelebration: boolean;
}

function countSignals(message: string): SignalCounts {
  const trimmed = message.trim();
  const letters = trimmed.replace(/[^A-Za-z]/g, "");
  const upper = trimmed.replace(/[^A-Z]/g, "").length;
  const capsRatio = letters.length > 0 ? upper / letters.length : 0;
  return {
    capsRatio,
    exclaims: (trimmed.match(/!/g) ?? []).length,
    questions: (trimmed.match(/\?/g) ?? []).length,
    length: trimmed.length,
    hasProfanity: PROFANITY.test(trimmed),
    hasUrgency: URGENCY.test(trimmed),
    hasStress: STRESS.test(trimmed),
    hasDiscouragement: DISCOURAGEMENT.test(trimmed),
    hasCelebration: CELEBRATION.test(trimmed),
  };
}

export function classifyHeuristic(message: string): EmotionalReading | null {
  const s = countSignals(message);
  const now = new Date().toISOString();

  if (s.capsRatio > 0.6 && s.length > 20 && (s.hasProfanity || s.exclaims >= 2)) {
    return { state: "frustrated", confidence: 0.9, source: "heuristic", signals: ["caps-ratio=" + s.capsRatio.toFixed(2), s.hasProfanity ? "profanity" : "exclaims=" + s.exclaims, "len=" + s.length], classifiedAt: now };
  }
  if (s.capsRatio > 0.4 && s.hasUrgency && s.exclaims >= 1) {
    return { state: "urgent", confidence: 0.85, source: "heuristic", signals: ["caps-ratio=" + s.capsRatio.toFixed(2), "urgency-word", "exclaims=" + s.exclaims], classifiedAt: now };
  }
  if (s.hasDiscouragement) {
    return { state: "discouraged", confidence: 0.8, source: "heuristic", signals: ["discouragement-word"], classifiedAt: now };
  }
  if (s.hasStress && s.length > 40) {
    return { state: "stressed", confidence: 0.8, source: "heuristic", signals: ["stress-word", "len=" + s.length], classifiedAt: now };
  }
  if (s.questions >= 2 && s.length < 100) {
    return { state: "confused", confidence: 0.75, source: "heuristic", signals: ["questions=" + s.questions, "len=" + s.length], classifiedAt: now };
  }
  if (s.hasCelebration && !s.hasProfanity && s.exclaims <= 1) {
    return { state: "celebrating", confidence: 0.8, source: "heuristic", signals: ["celebration-word"], classifiedAt: now };
  }
  return null;
}

interface CacheCheckArgs {
  prior: EmotionalReading;
  priorMessage?: string;
  newMessage: string;
}

export function shouldInvalidateCache(args: CacheCheckArgs): boolean {
  const prior = args.prior;
  const now = new Date().getTime();
  const priorTime = new Date(prior.classifiedAt).getTime();
  const ageMs = now - priorTime;
  if (ageMs > 60 * 60 * 1000) return true;
  const priorSignals = args.priorMessage ? countSignals(args.priorMessage) : null;
  const newSignals = countSignals(args.newMessage);
  if (priorSignals) {
    if (Math.abs(newSignals.length - priorSignals.length) / Math.max(priorSignals.length, 1) > 0.5) return true;
    if ((priorSignals.capsRatio > 0.4) !== (newSignals.capsRatio > 0.4)) return true;
    if (priorSignals.hasProfanity !== newSignals.hasProfanity) return true;
  }
  return false;
}

const HAIKU_SYSTEM_PROMPT = `You classify the emotional state of the LAST user message in a construction project-management chat. Choose ONE state:

- calm: neutral, professional, no strong emotion
- stressed: feels overwhelmed, behind, or strained
- frustrated: angry, venting, fed up
- confused: lost, asking for clarification
- celebrating: pleased, grateful, marking a win
- urgent: needs action right now, time pressure
- discouraged: defeated, hopeless

Output ONLY a JSON object: {"state": "<state>", "confidence": 0.0-1.0, "signals": ["short", "phrases"]}.
No prose. No code fences.`;

async function classifyWithHaiku(message: string, recent: ChatMessage[]): Promise<EmotionalReading> {
  const recentSummary = recent.slice(-3).map((m) => m.role + ": " + m.content.slice(0, 200)).join("\n");
  const userPrompt = "Recent context:\n" + recentSummary + "\n\nLAST user message:\n" + message + "\n\nClassify the LAST user message.";
  const raw = await llmProvider.complete({ tier: "cheap", system: HAIKU_SYSTEM_PROMPT, messages: [{ role: "user", content: userPrompt }], maxTokens: 80 });
  const text = (raw.text ?? "").trim();
  try {
    const obj = JSON.parse(text) as { state: string; confidence: number; signals?: string[] };
    if (isEmotionalState(obj.state)) {
      return { state: obj.state, confidence: clamp01(obj.confidence ?? 0.6), source: "haiku", signals: Array.isArray(obj.signals) ? obj.signals.slice(0, 5) : [], classifiedAt: new Date().toISOString() };
    }
  } catch {}
  return { state: "calm", confidence: 0.4, source: "default", signals: ["haiku-parse-fallback"], classifiedAt: new Date().toISOString() };
}

function isEmotionalState(v: unknown): v is EmotionalState {
  return typeof v === "string" && ["calm","stressed","frustrated","confused","celebrating","urgent","discouraged"].includes(v);
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export async function readEmotion(message: string, ctx: EmotionContext): Promise<EmotionalReading> {
  const heur = classifyHeuristic(message);
  if (heur && heur.confidence >= HEURISTIC_CONFIDENCE_FLOOR) return heur;

  if (ctx.prior && !shouldInvalidateCache({ prior: ctx.prior, priorMessage: ctx.recent.at(-1)?.content, newMessage: message })) {
    return { ...ctx.prior, source: "cache", classifiedAt: new Date().toISOString() };
  }

  return classifyWithHaiku(message, ctx.recent);
}

const ADAPTATION_BY_STATE: Record<EmotionalState, string> = {
  calm: "Use the default voice from HERBIE.md.",
  stressed: "User is stressed. Cut your response length by 30%. Lead with the single most important next action. Skip preamble.",
  frustrated: "User is frustrated. Skip I-understand phrases. Move straight to the fix. If Herbie made the mistake, own it in one short sentence then solve it.",
  confused: "User is confused. Slow down. Define jargon inline the first time. Use bullets if more than three points.",
  celebrating: "User is pleased. One brief beat of warmth (six words or less), then move on. No emoji unless they used one first.",
  urgent: "User needs action immediately. Lead with the action. Reasoning available on follow-up.",
  discouraged: "User feels defeated. Do not be chipper. Acknowledge the situation in one short line, then offer one concrete forward step.",
};

export function renderAdaptationBlock(reading: EmotionalReading): string {
  const guidance = ADAPTATION_BY_STATE[reading.state];
  return "<!-- emotion-adaptation: " + reading.state + " (" + reading.source + ", c=" + reading.confidence.toFixed(2) + ") -->\n" + guidance + "\n\nHard rule: never narrate the user emotional state back at them. Adapt silently.";
}
