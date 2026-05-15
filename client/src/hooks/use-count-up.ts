// ============================================================================
// use-count-up.ts — Sprint 8.4
// ----------------------------------------------------------------------------
// Animated count-up for hero metrics. Eases from `from` to `to` over `duration`
// ms using requestAnimationFrame and an ease-out-cubic curve.
//
// Usage:
//   const value = useCountUp(payAppsDue, { duration: 700 });
//   <span>{formatCurrency(value, true)}</span>
//
// Notes:
//   • Respects prefers-reduced-motion — snaps to target with no animation.
//   • Resets and re-animates when `to` changes (e.g. data refetch).
//   • Returns a number; format on the consumer side.
// ============================================================================

import { useEffect, useRef, useState } from "react";

export interface UseCountUpOptions {
  /** Total animation duration in ms. Default 700. */
  duration?: number;
  /** Starting value. Default 0. */
  from?: number;
  /** Skip animation entirely. Default false. */
  disabled?: boolean;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

export function useCountUp(
  to: number | null | undefined,
  opts: UseCountUpOptions = {},
): number {
  const { duration = 700, from = 0, disabled } = opts;

  const target = typeof to === "number" && Number.isFinite(to) ? to : null;
  const [value, setValue] = useState<number>(target ?? from);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const originRef = useRef<number>(from);

  useEffect(() => {
    if (target == null) {
      setValue(from);
      return;
    }
    if (disabled || prefersReducedMotion() || duration <= 0) {
      setValue(target);
      return;
    }

    originRef.current = value;
    startRef.current = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const next = originRef.current + (target - originRef.current) * eased;
      setValue(next);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        setValue(target);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration, disabled, from]);

  return value;
}

export default useCountUp;
