export interface BidFitInput {
  naicsCodes: string[];
  allowedNaics: string[];
  setAsideCode: string | null;
  eligibleSetAsides: string[];
  locationState: string | null;
  preferredStates: string[];
  estimatedValue: number;
  bondingCapacity: number;
  pastPerformanceWins: number;
  pastPerformanceTotal: number;
  responseDueAt: string | null;
}

export interface BidFitFactor {
  name: string;
  rawScore: number;
  weight: number;
  weighted: number;
  detail: string;
}

export interface BidFitResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  factors: BidFitFactor[];
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

export function bidFitScore(input: BidFitInput): BidFitResult {
  const factors: BidFitFactor[] = [];

  const naicsWeight = 0.20;
  let naicsRaw = 0;
  if (input.allowedNaics.length === 0) {
    naicsRaw = 50;
  } else {
    const matched = input.naicsCodes.filter(c => input.allowedNaics.includes(c));
    naicsRaw = matched.length > 0 ? 100 : 10;
  }
  factors.push({ name: "NAICS Match", rawScore: naicsRaw, weight: naicsWeight, weighted: naicsRaw * naicsWeight, detail: `${input.naicsCodes.length} codes checked against ${input.allowedNaics.length} allowed` });

  const setAsideWeight = 0.10;
  let setAsideRaw = 50;
  if (input.setAsideCode && input.eligibleSetAsides.length > 0) {
    setAsideRaw = input.eligibleSetAsides.includes(input.setAsideCode) ? 100 : 20;
  } else if (!input.setAsideCode) {
    setAsideRaw = 70;
  }
  factors.push({ name: "Set-Aside Eligibility", rawScore: setAsideRaw, weight: setAsideWeight, weighted: setAsideRaw * setAsideWeight, detail: input.setAsideCode || "unrestricted" });

  const geoWeight = 0.15;
  let geoRaw = 50;
  if (input.preferredStates.length === 0) {
    geoRaw = 70;
  } else if (input.locationState && input.preferredStates.includes(input.locationState)) {
    geoRaw = 100;
  } else if (input.locationState) {
    geoRaw = 20;
  }
  factors.push({ name: "Geography", rawScore: geoRaw, weight: geoWeight, weighted: geoRaw * geoWeight, detail: input.locationState || "unknown" });

  const sizeWeight = 0.20;
  let sizeRaw = 50;
  if (input.bondingCapacity <= 0) {
    sizeRaw = 50;
  } else {
    const ratio = input.estimatedValue / input.bondingCapacity;
    if (ratio <= 0.5) sizeRaw = 100;
    else if (ratio <= 0.75) sizeRaw = 85;
    else if (ratio <= 1.0) sizeRaw = 60;
    else sizeRaw = 15;
  }
  factors.push({ name: "Contract Size vs Bonding", rawScore: sizeRaw, weight: sizeWeight, weighted: sizeRaw * sizeWeight, detail: `$${input.estimatedValue.toLocaleString()} / $${input.bondingCapacity.toLocaleString()} capacity` });

  const perfWeight = 0.20;
  let perfRaw = 50;
  if (input.pastPerformanceTotal > 0) {
    const winRate = input.pastPerformanceWins / input.pastPerformanceTotal;
    perfRaw = clamp(winRate * 100);
  }
  factors.push({ name: "Past Performance", rawScore: perfRaw, weight: perfWeight, weighted: perfRaw * perfWeight, detail: `${input.pastPerformanceWins}/${input.pastPerformanceTotal} wins` });

  const deadlineWeight = 0.15;
  let deadlineRaw = 50;
  if (input.responseDueAt) {
    const days = Math.ceil((new Date(input.responseDueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) deadlineRaw = 5;
    else if (days < 3) deadlineRaw = 25;
    else if (days < 7) deadlineRaw = 55;
    else if (days < 14) deadlineRaw = 75;
    else if (days < 30) deadlineRaw = 90;
    else deadlineRaw = 100;
  }
  factors.push({ name: "Deadline Proximity", rawScore: deadlineRaw, weight: deadlineWeight, weighted: deadlineRaw * deadlineWeight, detail: input.responseDueAt ? `due ${input.responseDueAt}` : "no deadline" });

  const score = clamp(Math.round(factors.reduce((s, f) => s + f.weighted, 0)));
  return { score, grade: gradeFromScore(score), factors };
}
