/**
 * DXF entity -> SVG path conversion.
 *
 * Pure geometry, deliberately kept out of the React component so it can be
 * verified directly. Covers the entity types a floor plan or site plan is
 * actually drawn with: LINE, LWPOLYLINE, POLYLINE, CIRCLE and ARC.
 *
 * Unsupported entity types (TEXT, HATCH, SPLINE, INSERT/blocks) are **skipped,
 * not approximated**. A drawn line that is not really in the drawing is far
 * worse than a missing one when somebody is measuring off it.
 */

export type DxfPath = { d: string };

export type DxfBounds = {
  minX: number;
  minY: number;
  /** Width of the model extents, never zero (SVG viewBox would collapse). */
  w: number;
  h: number;
};

/** The subset of dxf-parser's entity shape this converter reads. */
export type DxfEntity = {
  type?: string;
  vertices?: { x: number; y: number }[];
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  shape?: boolean;
  closed?: boolean;
};

export function entitiesToPaths(entities: DxfEntity[]): {
  paths: DxfPath[];
  box: DxfBounds;
  /** Entity types present in the file that this converter does not draw. */
  skipped: string[];
} {
  const paths: DxfPath[] = [];
  const skipped = new Set<string>();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const track = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  };

  for (const e of entities) {
    switch (e?.type) {
      case "LINE": {
        const v = e.vertices ?? [];
        if (v.length < 2) break;
        track(v[0].x, v[0].y);
        track(v[1].x, v[1].y);
        paths.push({ d: `M ${v[0].x} ${v[0].y} L ${v[1].x} ${v[1].y}` });
        break;
      }

      case "LWPOLYLINE":
      case "POLYLINE": {
        const v = e.vertices ?? [];
        if (v.length < 2) break;
        for (const p of v) track(p.x, p.y);
        const d =
          `M ${v[0].x} ${v[0].y} ` +
          v.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ") +
          (e.shape || e.closed ? " Z" : "");
        paths.push({ d });
        break;
      }

      case "CIRCLE": {
        const { center, radius } = e;
        if (!center || !Number.isFinite(radius as number)) break;
        const r = radius as number;
        track(center.x - r, center.y - r);
        track(center.x + r, center.y + r);
        // SVG paths have no circle primitive — two half arcs close the loop.
        paths.push({
          d:
            `M ${center.x - r} ${center.y} ` +
            `A ${r} ${r} 0 1 0 ${center.x + r} ${center.y} ` +
            `A ${r} ${r} 0 1 0 ${center.x - r} ${center.y}`,
        });
        break;
      }

      case "ARC": {
        const { center, radius } = e;
        if (!center || !Number.isFinite(radius as number)) break;
        const r = radius as number;
        // dxf-parser reports angles in radians, counter-clockwise.
        const a0 = e.startAngle ?? 0;
        const a1 = e.endAngle ?? 0;
        const x0 = center.x + r * Math.cos(a0);
        const y0 = center.y + r * Math.sin(a0);
        const x1 = center.x + r * Math.cos(a1);
        const y1 = center.y + r * Math.sin(a1);

        let sweep = a1 - a0;
        while (sweep < 0) sweep += Math.PI * 2;
        const largeArc = sweep > Math.PI ? 1 : 0;

        // Bounding the arc by its full circle is deliberately conservative:
        // it can overstate the extents, which harmlessly pads the viewBox,
        // whereas understating them would clip real geometry off the sheet.
        track(center.x - r, center.y - r);
        track(center.x + r, center.y + r);

        paths.push({ d: `M ${x0} ${y0} A ${r} ${r} 0 ${largeArc} 1 ${x1} ${y1}` });
        break;
      }

      default:
        if (e?.type) skipped.add(e.type);
        break;
    }
  }

  if (!Number.isFinite(minX)) {
    return { paths, box: { minX: 0, minY: 0, w: 1, h: 1 }, skipped: Array.from(skipped) };
  }

  return {
    paths,
    box: {
      minX,
      minY,
      w: Math.max(maxX - minX, 1e-6),
      h: Math.max(maxY - minY, 1e-6),
    },
    skipped: Array.from(skipped),
  };
}
