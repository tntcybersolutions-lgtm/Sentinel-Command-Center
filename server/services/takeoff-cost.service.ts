// Server-side cost computation for takeoff quantities.
//
// Single source of truth for `extendedCost`. The UI used to compute this
// inline (quantity * unitCost) and POST the result; we now compute it here
// so the value is consistent regardless of caller.

export interface TakeoffCostInputs {
  quantity: string | number | null | undefined;
  unitCost?: string | number | null;
  laborRate?: string | number | null;
  laborHours?: string | number | null;
  wasteFactor?: string | number | null;
}

function num(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function computeTakeoffExtendedCost(input: TakeoffCostInputs): string {
  const quantity = num(input.quantity);
  const unitCost = num(input.unitCost);
  const laborRate = num(input.laborRate);
  const laborHours = num(input.laborHours);
  const wasteFactor = num(input.wasteFactor);

  const materialCost = quantity * unitCost;
  const laborCost = laborRate * laborHours;
  const subtotal = materialCost + laborCost;
  const withWaste = subtotal * (1 + wasteFactor / 100);

  return withWaste.toFixed(2);
}
