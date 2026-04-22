import type { HomePriority } from "../../shared/schema";

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function computeScore(params: {
  dueAt?: Date | null;
  ageDays?: number | null;
  dollarValue?: number | null;
  missingCount?: number | null;
  isOverdueApproval?: boolean;
  isAiTaskStalled?: boolean;
  hasNoBidProject?: boolean;
}): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (params.dueAt) {
    const days = Math.ceil((params.dueAt.getTime() - Date.now()) / 86400000);
    if (days <= 0) { score += 110; reasons.push("Past due"); }
    else if (days <= 1) { score += 90; reasons.push("Due within 24 hours"); }
    else if (days <= 3) { score += 70; reasons.push("Due within 72 hours"); }
    else if (days <= 7) { score += 35; reasons.push("Due within 7 days"); }
  }

  if (params.isOverdueApproval) { score += 85; reasons.push("Approval overdue"); }

  if (params.missingCount && params.missingCount > 0) {
    const add = params.missingCount >= 10 ? 70 : params.missingCount >= 5 ? 55 : 35;
    score += add;
    reasons.push(`Missing artifacts (${params.missingCount})`);
  }

  if (params.hasNoBidProject) { score += 45; reasons.push("Needs bid project created"); }
  if (params.isAiTaskStalled) { score += 35; reasons.push("AI task pending / stalled"); }

  if (params.dollarValue && params.dollarValue > 0) {
    const add = clamp(Math.round(params.dollarValue / 500000), 5, 55);
    score += add;
    reasons.push("High value impact");
  }

  return { score, reasons: reasons.length ? reasons : ["Normal priority"] };
}

export function priorityFromScore(score: number): HomePriority {
  if (score >= 140) return "critical";
  if (score >= 95) return "high";
  if (score >= 60) return "medium";
  return "low";
}
