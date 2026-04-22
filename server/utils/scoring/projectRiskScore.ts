export interface ProjectRiskInput {
  openRfis: { id: string; ageDays: number }[];
  submittalRejects: number;
  totalSubmittals: number;
  pendingChangeOrders: { id: string; ageDays: number }[];
  scheduleVarianceDays: number;
  pmActiveProjectCount: number;
}

export interface RiskFactor {
  name: string;
  rawScore: number;
  weight: number;
  weighted: number;
  detail: string;
}

export interface ProjectRiskResult {
  score: number;
  level: "low" | "moderate" | "high" | "critical";
  risks: RiskFactor[];
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function levelFromScore(score: number): "low" | "moderate" | "high" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 35) return "moderate";
  return "low";
}

export function projectRiskScore(input: ProjectRiskInput): ProjectRiskResult {
  const risks: RiskFactor[] = [];

  const rfiWeight = 0.25;
  const agingRfis = input.openRfis.filter(r => r.ageDays > 10);
  const rfiRaw = clamp(agingRfis.length * 20);
  risks.push({ name: "Open RFIs Aging", rawScore: rfiRaw, weight: rfiWeight, weighted: rfiRaw * rfiWeight, detail: `${agingRfis.length} of ${input.openRfis.length} RFIs aging >10 days` });

  const submitWeight = 0.15;
  const rejectRate = input.totalSubmittals > 0 ? input.submittalRejects / input.totalSubmittals : 0;
  const submitRaw = clamp(rejectRate * 200);
  risks.push({ name: "Submittal Rejects", rawScore: submitRaw, weight: submitWeight, weighted: submitRaw * submitWeight, detail: `${input.submittalRejects}/${input.totalSubmittals} rejected` });

  const coWeight = 0.20;
  const lagCOs = input.pendingChangeOrders.filter(co => co.ageDays > 14);
  const coRaw = clamp(lagCOs.length * 25);
  risks.push({ name: "CO Approval Lag", rawScore: coRaw, weight: coWeight, weighted: coRaw * coWeight, detail: `${lagCOs.length} COs pending >14 days` });

  const schedWeight = 0.25;
  let schedRaw = 0;
  if (input.scheduleVarianceDays > 0) {
    schedRaw = clamp(input.scheduleVarianceDays * 5);
  }
  risks.push({ name: "Schedule Variance", rawScore: schedRaw, weight: schedWeight, weighted: schedRaw * schedWeight, detail: `${input.scheduleVarianceDays} days behind` });

  const pmWeight = 0.15;
  let pmRaw = 0;
  if (input.pmActiveProjectCount > 3) {
    pmRaw = clamp((input.pmActiveProjectCount - 3) * 20);
  }
  risks.push({ name: "PM Load", rawScore: pmRaw, weight: pmWeight, weighted: pmRaw * pmWeight, detail: `${input.pmActiveProjectCount} active projects` });

  const score = clamp(Math.round(risks.reduce((s, r) => s + r.weighted, 0)));
  return { score, level: levelFromScore(score), risks };
}
