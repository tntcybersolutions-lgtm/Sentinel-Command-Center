function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function daysBetween(aIso: string | null, bIso: string | null): number {
  if (!aIso || !bIso) return 0;
  const a = new Date(aIso);
  const b = new Date(bIso);
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export interface ScoringWeights {
  urgencyWeight: number;
  impactWeight: number;
  riskWeight: number;
  agingWeight: number;
  meetingWeight: number;
  behavioralWeight: number;
}

export interface WorkItem {
  id: string;
  type: string;
  title: string;
  status: string;
  priority?: string;
  project?: string;
  due_ts?: string | null;
  created_ts: string;
  updated_ts?: string;
  last_activity_ts?: string | null;
  carried_over?: boolean | number;
  revenue_tier?: string;
  sla_hours?: number | null;
  meeting_linked_ts?: string | null;
}

export interface ScoringContext {
  nowIso: string;
  userBehavior?: {
    snoozeRate?: number;
  };
}

export interface ScoreResult {
  score: number;
  band: "critical" | "strategic" | "routine";
  components: {
    urgency: number;
    impact: number;
    risk: number;
    aging: number;
    meeting: number;
    behavioral: number;
  };
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  urgencyWeight: 1.0,
  impactWeight: 1.0,
  riskWeight: 1.0,
  agingWeight: 1.0,
  meetingWeight: 1.0,
  behavioralWeight: 1.0,
};

export function scoreItem(
  item: WorkItem,
  context: ScoringContext,
  weights?: ScoringWeights | null
): ScoreResult {
  const nowIso = context.nowIso;
  const now = new Date(nowIso);
  const ageDays = daysBetween(item.created_ts, nowIso);

  let urgency = 0;
  if (item.due_ts) {
    const due = new Date(item.due_ts);
    const diffHrs = (due.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (diffHrs < 0) urgency = 25;
    else if (diffHrs <= 24) urgency = 20;
    else if (diffHrs <= 48) urgency = 10;
    else urgency = 5;
  }

  const impactMap: Record<string, number> = { high: 20, medium: 12, low: 5 };
  const impact = impactMap[item.revenue_tier || "medium"] ?? 12;

  let risk = 0;
  const lastActDays = item.last_activity_ts
    ? daysBetween(item.last_activity_ts, nowIso)
    : null;

  if (lastActDays !== null) {
    if (lastActDays > 10) risk = Math.max(risk, 20);
    else if (lastActDays > 7) risk = Math.max(risk, 15);
    else if (lastActDays > 3) risk = Math.max(risk, 8);
  }

  if (item.sla_hours) {
    const openHours =
      (new Date(nowIso).getTime() - new Date(item.created_ts).getTime()) /
      (1000 * 60 * 60);
    if (openHours > item.sla_hours) risk = Math.max(risk, 20);
    else if (openHours > item.sla_hours * 0.75) risk = Math.max(risk, 14);
  }

  const thresh =
    item.type === "rfi" ? 7 : item.type === "submittal" ? 14 : 10;
  const aging = clamp(Math.round((ageDays / thresh) * 15), 0, 15);

  let meeting = 0;
  if (item.meeting_linked_ts) {
    const mt = new Date(item.meeting_linked_ts);
    const hrs = (mt.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hrs >= 0 && hrs <= 24) meeting = 10;
    else if (hrs > 24 && hrs <= 168) meeting = 5;
  }

  let behavioral = 0;
  if (item.carried_over) behavioral += 5;
  if (context.userBehavior) {
    const { snoozeRate = 0 } = context.userBehavior;
    if (snoozeRate > 0.35) behavioral += 3;
    if (snoozeRate < 0.1) behavioral -= 2;
  }
  behavioral = clamp(behavioral, -10, 10);

  const w = weights || DEFAULT_WEIGHTS;

  const raw =
    w.urgencyWeight * urgency +
    w.impactWeight * impact +
    w.riskWeight * risk +
    w.agingWeight * aging +
    w.meetingWeight * meeting +
    w.behavioralWeight * behavioral;

  const score = clamp(Math.round(raw), 0, 100);
  const band: "critical" | "strategic" | "routine" =
    score >= 61 ? "critical" : score >= 31 ? "strategic" : "routine";

  return {
    score,
    band,
    components: { urgency, impact, risk, aging, meeting, behavioral },
  };
}
