/**
 * Sprint L3-D — useMultiSelect: long-press to start, tap to toggle
 *
 * Headless hook that any list page can wire into its rows. Long-press (600ms
 * default) on a row enters multi-select mode and selects that row. Once in
 * multi-select mode, plain taps toggle row membership. Tap outside (or call
 * clear()) exits.
 *
 * Returns:
 *   - selected: Set<id>           (active selection)
 *   - mode: boolean               (multi-select active?)
 *   - bind(id): object            (spread onto each row's container)
 *   - toggle(id): void
 *   - clear(): void
 *   - selectAll(ids): void
 *
 * Usage:
 *   const ms = useMultiSelect();
 *   {items.map(it =>
 *     <div key={it.id} {...ms.bind(it.id)} aria-selected={ms.selected.has(it.id)}>
 *       …row…
 *     </div>
 *   )}
 *   {ms.mode && <BulkActionBar count={ms.selected.size} onCancel={ms.clear} … />}
 */

import { useState, useCallback, useRef, useEffect } from "react";

export interface UseMultiSelectOptions {
  /** Hold duration before multi-select mode activates. Default 600ms. */
  longPressMs?: number;
  /** Fire a haptic ping when mode activates. Default true. */
  haptic?: boolean;
}

export function useMultiSelect<TId extends string = string>(
  opts: UseMultiSelectOptions = {},
) {
  const longPressMs = opts.longPressMs ?? 600;
  const useHaptic = opts.haptic !== false;

  const [selected, setSelected] = useState<Set<TId>>(() => new Set());
  const [mode, setMode] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moveBlockedRef = useRef(false); // suppress click after long-press

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => () => clearTimer(), []);

  const triggerHaptic = useCallback(() => {
    if (!useHaptic) return;
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        (navigator as any).vibrate(18);
      }
    } catch {
      /* ignore */
    }
  }, [useHaptic]);

  const toggle = useCallback((id: TId) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Auto-exit mode when last item removed
      if (next.size === 0) setMode(false);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setSelected(new Set());
    setMode(false);
  }, []);

  const selectAll = useCallback((ids: TId[]) => {
    setSelected(new Set(ids));
    if (ids.length > 0) setMode(true);
  }, []);

  // Bind handlers for a single row. Returns props you spread on the row's
  // outer element.
  const bind = useCallback(
    (id: TId) => {
      const startLongPress = () => {
        moveBlockedRef.current = false;
        clearTimer();
        timerRef.current = setTimeout(() => {
          if (!mode) {
            triggerHaptic();
            setMode(true);
            setSelected((prev) => {
              const next = new Set(prev);
              next.add(id);
              return next;
            });
            moveBlockedRef.current = true;
          }
        }, longPressMs);
      };
      const cancelLongPress = () => clearTimer();
      const onTap = (e: React.MouseEvent | React.TouchEvent) => {
        if (moveBlockedRef.current) {
          // Suppress the immediate click that follows a long-press
          e.stopPropagation();
          moveBlockedRef.current = false;
          return;
        }
        if (mode) {
          e.stopPropagation();
          e.preventDefault();
          toggle(id);
        }
      };
      return {
        onPointerDown: startLongPress,
        onPointerUp: cancelLongPress,
        onPointerCancel: cancelLongPress,
        onPointerLeave: cancelLongPress,
        // Move > a few px should cancel long-press to allow scrolling
        onPointerMove: (e: React.PointerEvent) => {
          // movementX/Y can be > 0 from finger jitter; only cancel on big moves
          if (Math.abs(e.movementY) > 4 || Math.abs(e.movementX) > 4) {
            cancelLongPress();
          }
        },
        onClick: onTap,
        // ARIA / data
        "aria-selected": mode ? selected.has(id) : undefined,
        "data-multi-selected": mode && selected.has(id) ? "true" : undefined,
      } as const;
    },
    [longPressMs, mode, selected, toggle, triggerHaptic],
  );

  return {
    selected,
    mode,
    count: selected.size,
    toggle,
    clear,
    selectAll,
    bind,
  };
}

export default useMultiSelect;
