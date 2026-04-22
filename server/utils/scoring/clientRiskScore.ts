export interface ClientRiskInput {
  paymentHistoryDays: number[];
  outstandingInvoices: number;
  totalOutstandingAmount: number;
  contractValue: number;
  changeOrderCount: number;
  changeOrderDisputedCount: number;
  projectCount: number;
  completedProjects: number;
  averagePayDays: number;
  hasRetainageDispute: boolean;
  communicationResponseDays: number;
}

export interface ClientRiskFactor {
  name: string;
  rawScore: number;
  weight: number;
  weighted: number;
  detail: string;
}

export interface ClientRiskResult {
  score: number;
  level: "low" | "moderate" | "elevated" | "high" | "critical";
  factors: ClientRiskFactor[];
}

export function clientRiskScore(input: ClientRiskInput): ClientRiskResult {
  const factors: ClientRiskFactor[] = [];

  const payDays = input.averagePayDays;
  let payScore: number;
  if (payDays <= 30) payScore = 10;
  else if (payDays <= 45) payScore = 30;
  else if (payDays <= 60) payScore = 55;
  else if (payDays <= 90) payScore = 75;
  else payScore = 95;
  factors.push({
    name: "Payment Speed",
    rawScore: payScore,
    weight: 0.30,
    weighted: payScore * 0.30,
    detail: `Average ${payDays} days to pay. ${payDays > 60 ? "Chronic slow payer." : payDays > 45 ? "Slower than industry avg." : "Acceptable."}`,
  });

  const outstandingRatio = input.contractValue > 0
    ? (input.totalOutstandingAmount / input.contractValue) * 100
    : 0;
  let arScore: number;
  if (outstandingRatio <= 5) arScore = 10;
  else if (outstandingRatio <= 15) arScore = 30;
  else if (outstandingRatio <= 30) arScore = 55;
  else if (outstandingRatio <= 50) arScore = 75;
  else arScore = 90;
  factors.push({
    name: "Outstanding AR Ratio",
    rawScore: arScore,
    weight: 0.25,
    weighted: arScore * 0.25,
    detail: `${outstandingRatio.toFixed(1)}% of contract value outstanding ($${Math.round(input.totalOutstandingAmount).toLocaleString()}).`,
  });

  const coTotal = input.changeOrderCount || 1;
  const disputeRatio = input.changeOrderDisputedCount / coTotal;
  let coScore: number;
  if (disputeRatio <= 0.05) coScore = 10;
  else if (disputeRatio <= 0.15) coScore = 30;
  else if (disputeRatio <= 0.30) coScore = 55;
  else if (disputeRatio <= 0.50) coScore = 75;
  else coScore = 90;
  factors.push({
    name: "CO Dispute Rate",
    rawScore: coScore,
    weight: 0.20,
    weighted: coScore * 0.20,
    detail: `${(disputeRatio * 100).toFixed(0)}% of change orders disputed (${input.changeOrderDisputedCount}/${input.changeOrderCount}).`,
  });

  const completionRate = input.projectCount > 0
    ? input.completedProjects / input.projectCount
    : 1;
  let trackScore: number;
  if (completionRate >= 0.9) trackScore = 10;
  else if (completionRate >= 0.7) trackScore = 30;
  else if (completionRate >= 0.5) trackScore = 55;
  else trackScore = 80;
  factors.push({
    name: "Project Completion Rate",
    rawScore: trackScore,
    weight: 0.10,
    weighted: trackScore * 0.10,
    detail: `${(completionRate * 100).toFixed(0)}% of projects completed (${input.completedProjects}/${input.projectCount}).`,
  });

  let retainageScore = input.hasRetainageDispute ? 80 : 10;
  factors.push({
    name: "Retainage Disputes",
    rawScore: retainageScore,
    weight: 0.10,
    weighted: retainageScore * 0.10,
    detail: input.hasRetainageDispute ? "Active retainage dispute — high collection risk." : "No retainage disputes.",
  });

  let commScore: number;
  if (input.communicationResponseDays <= 2) commScore = 10;
  else if (input.communicationResponseDays <= 5) commScore = 25;
  else if (input.communicationResponseDays <= 10) commScore = 50;
  else commScore = 80;
  factors.push({
    name: "Communication Responsiveness",
    rawScore: commScore,
    weight: 0.05,
    weighted: commScore * 0.05,
    detail: `Average ${input.communicationResponseDays} day response time on RFIs/submittals.`,
  });

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.weighted, 0));
  const clamped = Math.max(0, Math.min(100, totalScore));

  let level: ClientRiskResult["level"];
  if (clamped <= 20) level = "low";
  else if (clamped <= 40) level = "moderate";
  else if (clamped <= 60) level = "elevated";
  else if (clamped <= 80) level = "high";
  else level = "critical";

  return { score: clamped, level, factors };
}
