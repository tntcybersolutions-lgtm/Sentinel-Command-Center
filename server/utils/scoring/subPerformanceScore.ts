export interface SubPerformanceInput {
  onTimeDeliveries: number;
  totalDeliveries: number;
  reworkIncidents: number;
  totalWorkOrders: number;
  safetyViolations: number;
  insuranceCurrent: boolean;
  insuranceExpiresDays: number | null;
  avgResponseDays: number;
}

export interface SubPerformanceFlag {
  name: string;
  rawScore: number;
  weight: number;
  weighted: number;
  detail: string;
}

export interface SubPerformanceResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  flags: SubPerformanceFlag[];
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function gradeFromScore(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

export function subPerformanceScore(input: SubPerformanceInput): SubPerformanceResult {
  const flags: SubPerformanceFlag[] = [];

  const otWeight = 0.25;
  let otRaw = 50;
  if (input.totalDeliveries > 0) {
    otRaw = clamp((input.onTimeDeliveries / input.totalDeliveries) * 100);
  }
  flags.push({ name: "On-Time Delivery", rawScore: otRaw, weight: otWeight, weighted: otRaw * otWeight, detail: `${input.onTimeDeliveries}/${input.totalDeliveries} on time` });

  const qualWeight = 0.25;
  let qualRaw = 100;
  if (input.totalWorkOrders > 0) {
    const defectRate = input.reworkIncidents / input.totalWorkOrders;
    qualRaw = clamp(100 - defectRate * 200);
  }
  flags.push({ name: "Quality (Rework)", rawScore: qualRaw, weight: qualWeight, weighted: qualRaw * qualWeight, detail: `${input.reworkIncidents} rework incidents out of ${input.totalWorkOrders} work orders` });

  const safetyWeight = 0.20;
  const safetyRaw = clamp(100 - input.safetyViolations * 30);
  flags.push({ name: "Safety Compliance", rawScore: safetyRaw, weight: safetyWeight, weighted: safetyRaw * safetyWeight, detail: `${input.safetyViolations} violations` });

  const insWeight = 0.15;
  let insRaw = 100;
  if (!input.insuranceCurrent) {
    insRaw = 0;
  } else if (input.insuranceExpiresDays !== null) {
    if (input.insuranceExpiresDays <= 15) insRaw = 30;
    else if (input.insuranceExpiresDays <= 30) insRaw = 60;
    else if (input.insuranceExpiresDays <= 60) insRaw = 80;
  }
  flags.push({ name: "Insurance Status", rawScore: insRaw, weight: insWeight, weighted: insRaw * insWeight, detail: input.insuranceCurrent ? `expires in ${input.insuranceExpiresDays ?? "N/A"} days` : "expired" });

  const respWeight = 0.15;
  let respRaw = 100;
  if (input.avgResponseDays > 5) respRaw = 20;
  else if (input.avgResponseDays > 3) respRaw = 50;
  else if (input.avgResponseDays > 1) respRaw = 80;
  flags.push({ name: "Responsiveness", rawScore: respRaw, weight: respWeight, weighted: respRaw * respWeight, detail: `avg ${input.avgResponseDays} day response` });

  const score = clamp(Math.round(flags.reduce((s, f) => s + f.weighted, 0)));
  return { score, grade: gradeFromScore(score), flags };
}
