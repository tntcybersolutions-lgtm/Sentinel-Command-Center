export type DeltaResult = {
  deltaPercent: number | null;
  deltaLabel: string | null;
  direction: "up" | "down" | "flat" | null;
};

/**
 * Computes percent delta between current and previous metric values.
 * Handles:
 *  - Seeded baseline snapshots
 *  - Zero previous values
 *  - Negative values (if ever used)
 *  - Null safety
 */
export function computeDelta(
  current: number | null | undefined,
  previous: number | null | undefined,
  options?: {
    previousIsSeeded?: boolean;
    currentIsSeeded?: boolean;
  }
): DeltaResult {
  const previousIsSeeded = options?.previousIsSeeded ?? false;
  const currentIsSeeded = options?.currentIsSeeded ?? false;

  if (current == null || previous == null) {
    return {
      deltaPercent: null,
      deltaLabel: "Baseline",
      direction: null,
    };
  }

  if (previousIsSeeded || (previousIsSeeded && currentIsSeeded)) {
    return {
      deltaPercent: null,
      deltaLabel: "Baseline",
      direction: null,
    };
  }

  if (previous === 0 && current > 0) {
    return {
      deltaPercent: null,
      deltaLabel: "New",
      direction: "up",
    };
  }

  if (previous === 0 && current === 0) {
    return {
      deltaPercent: 0,
      deltaLabel: null,
      direction: "flat",
    };
  }

  const rawDelta = ((current - previous) / Math.abs(previous)) * 100;

  let direction: "up" | "down" | "flat";
  if (rawDelta > 0) direction = "up";
  else if (rawDelta < 0) direction = "down";
  else direction = "flat";

  return {
    deltaPercent: roundToTwo(rawDelta),
    deltaLabel: null,
    direction,
  };
}

function roundToTwo(n: number): number {
  return Math.round(n * 100) / 100;
}
