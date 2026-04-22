/**
 * Removes any trailing " (Copy)" or " (Copy N)" tokens from a PO number.
 * Examples:
 *  - "ABC (Copy)" -> "ABC"
 *  - "ABC (Copy 2)" -> "ABC"
 *  - "ABC (Copy) (Copy) (Copy)" -> "ABC"
 *  - "ABC (Copy 2) (Copy)" -> "ABC"
 */
export function stripCopySuffix(poNumber: string): string {
  let s = (poNumber ?? "").trim();
  if (!s) return s;

  const tokenRegex = /\s*\(Copy(?:\s+(\d+))?\)\s*$/i;

  while (tokenRegex.test(s)) {
    s = s.replace(tokenRegex, "").trim();
  }

  return s;
}

/**
 * Creates a normalized copy label for a base PO number.
 * copyIndex=1 => "(Copy)"
 * copyIndex>=2 => "(Copy N)"
 */
export function formatCopySuffix(copyIndex: number): string {
  if (copyIndex <= 1) return " (Copy)";
  return ` (Copy ${copyIndex})`;
}

/**
 * Builds the next duplicate PO number given a base and a set of existing PO numbers
 * that share the same base.
 *
 * existingPoNumbers should include all variations already in DB, e.g.:
 *  - "ABC"
 *  - "ABC (Copy)"
 *  - "ABC (Copy 2)"
 */
export function getNextDuplicatePoNumber(
  originalPoNumber: string,
  existingPoNumbers: string[]
): string {
  const base = stripCopySuffix(originalPoNumber);
  const normalizedExisting = (existingPoNumbers ?? []).map(n => (n ?? "").trim());

  const copyRegex = new RegExp(`^${escapeRegExp(base)}\\s*\\(Copy(?:\\s+(\\d+))?\\)\\s*$`, "i");

  let maxCopy = 0;
  for (const n of normalizedExisting) {
    const m = n.match(copyRegex);
    if (!m) continue;
    const idx = m[1] ? parseInt(m[1], 10) : 1;
    if (!Number.isNaN(idx)) maxCopy = Math.max(maxCopy, idx);
  }

  const nextIdx = Math.max(1, maxCopy + 1);
  return base + formatCopySuffix(nextIdx);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
