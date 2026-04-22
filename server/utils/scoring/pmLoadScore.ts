export interface PmLoadInput {
  activeProjectCount: number;
  totalContractValue: number;
  openActionItems: number;
  openRfiCount: number;
  pendingSubmittalCount: number;
  pendingChangeOrderCount: number;
}

export interface PmLoadConcern {
  name: string;
  rawScore: number;
  weight: number;
  weighted: number;
  detail: string;
}

export interface PmLoadResult {
  score: number;
  level: "manageable" | "busy" | "overloaded" | "critical";
  concerns: PmLoadConcern[];
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function levelFromScore(score: number): "manageable" | "busy" | "overloaded" | "critical" {
  if (score >= 80) return "critical";
  if (score >= 60) return "overloaded";
  if (score >= 35) return "busy";
  return "manageable";
}

export function pmLoadScore(input: PmLoadInput): PmLoadResult {
  const concerns: PmLoadConcern[] = [];

  const projWeight = 0.25;
  let projRaw = 0;
  if (input.activeProjectCount > 3) {
    projRaw = clamp((input.activeProjectCount - 3) * 20);
  }
  concerns.push({ name: "Active Projects", rawScore: projRaw, weight: projWeight, weighted: projRaw * projWeight, detail: `${input.activeProjectCount} active projects` });

  const valueWeight = 0.20;
  let valueRaw = 0;
  const millionThreshold = 5_000_000;
  if (input.totalContractValue > millionThreshold) {
    valueRaw = clamp(((input.totalContractValue - millionThreshold) / millionThreshold) * 50);
  }
  concerns.push({ name: "Total Contract Value", rawScore: valueRaw, weight: valueWeight, weighted: valueRaw * valueWeight, detail: `$${input.totalContractValue.toLocaleString()} under management` });

  const actionWeight = 0.15;
  const actionRaw = clamp(input.openActionItems * 5);
  concerns.push({ name: "Open Action Items", rawScore: actionRaw, weight: actionWeight, weighted: actionRaw * actionWeight, detail: `${input.openActionItems} open items` });

  const rfiSubWeight = 0.25;
  const backlogCount = input.openRfiCount + input.pendingSubmittalCount;
  const rfiSubRaw = clamp(backlogCount * 8);
  concerns.push({ name: "RFI/Submittal Backlog", rawScore: rfiSubRaw, weight: rfiSubWeight, weighted: rfiSubRaw * rfiSubWeight, detail: `${input.openRfiCount} RFIs + ${input.pendingSubmittalCount} submittals pending` });

  const coWeight = 0.15;
  const coRaw = clamp(input.pendingChangeOrderCount * 15);
  concerns.push({ name: "Pending Change Orders", rawScore: coRaw, weight: coWeight, weighted: coRaw * coWeight, detail: `${input.pendingChangeOrderCount} COs pending` });

  const score = clamp(Math.round(concerns.reduce((s, c) => s + c.weighted, 0)));
  return { score, level: levelFromScore(score), concerns };
}
