// ============================================================================
// use-pull-to-refresh.ts — Sprint 8.6
// ----------------------------------------------------------------------------
// Touch-only pull-to-refresh gesture. Only activates when the scroll container
// is at the top, only on coarse pointers (mobile). Calls onRefresh when the
// pull crosses the threshold, returns a `pullY` and `state` for the consumer
// to render the indicator.
//
// Usage:
//   const { pullY, state, bind } = usePullToRefresh({
//     onRefresh: () => queryClient.invalidateQueries(...),
//   });
//   return <div {...bind}>{state === "refreshing" && <Spinner />}{...}</div>;
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";

type State = "idle" | "pulling" | "armed" | "refreshing";

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<unknown> | void;
  /** Pixels of pull required to arm the refresh. Default 70. */
  threshold?: number;
  /** Max pixels the indicator can be pulled. Default 120. */
  max?: number;
  /** Disable on coarse-only pointers? Default true. */
  touchOnly?: boolean;
}

export interface UsePullToRefreshReturn {
  pullY: number;
  state: State;
  bind: {
    onTouchStart: (e: React.TouchEvent) => void;
    onTouchMove: (e: React.TouchEvent) => void;
    onTouchEnd: () => void;
  };
}

function isCoarse() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

export function usePullToRefresh(
  opts: UsePullToRefreshOptions,
): UsePullToRefreshReturn {
  const { onRefresh, threshold = 70, max = 120, touchOnly = true } = opts;
  const [pullY, setPullY] = useState(0);
  const [state, setState] = useState<State>("idle");
  const startYRef = useRef<number | null>(null);
  const enabledRef = useRef<boolean>(false);

  useEffect(() => {
    enabledRef.current = !touchOnly || isCoarse();
  }, [touchOnly]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabledRef.current) return;
    if (state === "refreshing") return;
    // Only engage at scroll-top of the scrolling ancestor.
    const target = e.currentTarget as HTMLElement;
    const scroller = findScroller(target);
    if (scroller && scroller.scrollTop > 0) return;
    startYRef.current = e.touches[0]?.clientY ?? null;
    setState("pulling");
  }, [state]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (state === "refreshing" || startYRef.current == null) return;
    const dy = (e.touches[0]?.clientY ?? 0) - startYRef.current;
    if (dy <= 0) {
      setPullY(0);
      setState("pulling");
      return;
    }
    // Rubber-band: easing past threshold so pull feels physical.
    const eased = dy < threshold ? dy : threshold + (dy - threshold) * 0.4;
    const clamped = Math.min(max, eased);
    setPullY(clamped);
    setState(clamped >= threshold ? "armed" : "pulling");
  }, [state, threshold, max]);

  const onTouchEnd = useCallback(() => {
    if (state === "armed") {
      setState("refreshing");
      setPullY(threshold);
      Promise.resolve(onRefresh()).finally(() => {
        setState("idle");
        setPullY(0);
        startYRef.current = null;
      });
    } else {
      setState("idle");
      setPullY(0);
      startYRef.current = null;
    }
  }, [state, threshold, onRefresh]);

  return {
    pullY,
    state,
    bind: { onTouchStart, onTouchMove, onTouchEnd },
  };
}

function findScroller(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el;
  while (cur && cur !== document.body) {
    const style = window.getComputedStyle(cur);
    if (/(auto|scroll)/.test(style.overflowY)) return cur;
    cur = cur.parentElement;
  }
  return document.scrollingElement as HTMLElement | null;
}

export default usePullToRefresh;
