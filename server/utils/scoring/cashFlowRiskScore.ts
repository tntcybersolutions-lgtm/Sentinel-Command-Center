export interface CashFlowRiskInput {
  arCurrent: number;
  ar30: number;
  ar60: number;
  ar90Plus: number;
  totalBillings: number;
  totalCostsToDate: number;
  retentionHeld: number;
  totalContractValue: number;
  upcomingPayAppsDays: number[];
  backlogMonths: number;
}

export interface CashFlowAlert {
  name: string;
  rawScore: number;
  weight: number;
  weighted: number;
  detail: string;
}

export interface CashFlowRiskResult {
  score: number;
  level: "healthy" | "watch" | "stressed" | "critical";
  alerts: CashFlowAlert[];
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function levelFromScore(score: number): "healthy" | "watch" | "stressed" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 55) return "stressed";
  if (score >= 30) return "watch";
  return "healthy";
}

export function cashFlowRiskScore(input: CashFlowRiskInput): CashFlowRiskResult {
  const alerts: CashFlowAlert[] = [];

  const totalAR = input.arCurrent + input.ar30 + input.ar60 + input.ar90Plus;
  const agingWeight = 0.30;
  let agingRaw = 0;
  if (totalAR > 0) {
    const weightedAging = (input.ar30 * 1 + input.ar60 * 2 + input.ar90Plus * 4) / totalAR;
    agingRaw = clamp(weightedAging * 25);
  }
  alerts.push({ name: "AR Aging", rawScore: agingRaw, weight: agingWeight, weighted: agingRaw * agingWeight, detail: `90+: $${input.ar90Plus.toLocaleString()}, 60: $${input.ar60.toLocaleString()}, 30: $${input.ar30.toLocaleString()}` });

  const overbillWeight = 0.20;
  let overbillRaw = 0;
  if (input.totalCostsToDate > 0) {
    const ratio = input.totalBillings / input.totalCostsToDate;
    if (ratio > 1.15) overbillRaw = clamp((ratio - 1.0) * 200);
  }
  alerts.push({ name: "Overbilling Ratio", rawScore: overbillRaw, weight: overbillWeight, weighted: overbillRaw * overbillWeight, detail: `billed $${input.totalBillings.toLocaleString()} vs costs $${input.totalCostsToDate.toLocaleString()}` });

  const retWeight = 0.15;
  let retRaw = 0;
  if (input.totalContractValue > 0) {
    const retPct = input.retentionHeld / input.totalContractValue;
    if (retPct > 0.10) retRaw = clamp(retPct * 300);
    else if (retPct > 0.05) retRaw = clamp(retPct * 150);
  }
  alerts.push({ name: "Retention Held", rawScore: retRaw, weight: retWeight, weighted: retRaw * retWeight, detail: `$${input.retentionHeld.toLocaleString()} held of $${input.totalContractValue.toLocaleString()}` });

  const payAppWeight = 0.20;
  const urgentPayApps = input.upcomingPayAppsDays.filter(d => d <= 7);
  const payAppRaw = clamp(urgentPayApps.length * 25);
  alerts.push({ name: "Upcoming Pay App Deadlines", rawScore: payAppRaw, weight: payAppWeight, weighted: payAppRaw * payAppWeight, detail: `${urgentPayApps.length} pay apps due within 7 days` });

  const backlogWeight = 0.15;
  let backlogRaw = 0;
  if (input.backlogMonths < 3) backlogRaw = clamp((3 - input.backlogMonths) * 33);
  alerts.push({ name: "Backlog Months", rawScore: backlogRaw, weight: backlogWeight, weighted: backlogRaw * backlogWeight, detail: `${input.backlogMonths} months of backlog` });

  const score = clamp(Math.round(alerts.reduce((s, a) => s + a.weighted, 0)));
  return { score, level: levelFromScore(score), alerts };
}
