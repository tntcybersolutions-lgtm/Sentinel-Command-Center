// client/src/components/swipe-row.tsx
// Sprint 6: swipeable row with reveal actions.
// Swipe LEFT to reveal a primary action (e.g. Approve).
// Swipe RIGHT to reveal a secondary action (e.g. Dismiss).
// Plain touch math; no library.
//
// Usage:
//   <SwipeRow
//     leftAction={{ label: "Dismiss", color: "#5F5E5A", onAction: () => ... }}
//     rightAction={{ label: "Approve", color: "#1D9E75", onAction: () => ... }}
//   >
//     <div>...row content...</div>
//   </SwipeRow>

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as haptics from "@/lib/haptics";

const REVEAL_PX = 88;       // distance at which the reveal is fully visible
const TRIGGER_PX = 60;      // past this on release, the action fires
const DAMP = 0.45;          // how much past the threshold continues to drag

export type SwipeAction = {
  label: string;
  color: string;             // background of the reveal panel
  onAction: () => void;
};

export default function SwipeRow({
  leftAction,
  rightAction,
  children,
  disabled = false,
}: {
  leftAction?: SwipeAction;       // shown when user swipes RIGHT (finger drags right -> reveals on the LEFT side)
  rightAction?: SwipeAction;      // shown when user swipes LEFT
  children: ReactNode;
  disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const lastHaptic = useRef<"left" | "right" | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    lastHaptic.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null || disabled) return;
    const raw = e.touches[0].clientX - startX.current;
    // damped beyond reveal width
    const damped = Math.abs(raw) > REVEAL_PX
      ? Math.sign(raw) * (REVEAL_PX + (Math.abs(raw) - REVEAL_PX) * DAMP)
      : raw;
    // disable a direction if no action provided for it
    if (damped > 0 && !leftAction) return;
    if (damped < 0 && !rightAction) return;
    setDx(damped);

    // haptic on threshold cross
    if (damped > TRIGGER_PX && lastHaptic.current !== "right") {
      haptics.select();
      lastHaptic.current = "right";
    } else if (damped < -TRIGGER_PX && lastHaptic.current !== "left") {
      haptics.select();
      lastHaptic.current = "left";
    }
  }

  function onTouchEnd() {
    if (startX.current == null) { setDx(0); return; }
    if (dx > TRIGGER_PX && leftAction) {
      haptics.success();
      leftAction.onAction();
    } else if (dx < -TRIGGER_PX && rightAction) {
      haptics.success();
      rightAction.onAction();
    }
    startX.current = null;
    setDx(0);
  }

  // Snap back when component unmounts mid-swipe
  useEffect(() => () => { startX.current = null; }, []);

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16 }}>
      {leftAction && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: leftAction.color,
            display: "flex",
            alignItems: "center",
            paddingLeft: 16,
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          {leftAction.label}
        </div>
      )}
      {rightAction && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: rightAction.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 16,
            color: "#fff",
            fontSize: 13,
            fontWeight: 500,
            pointerEvents: "none",
          }}
        >
          {rightAction.label}
        </div>
      )}
      <div
        ref={ref}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: "translateX(" + dx + "px)",
          transition: startX.current == null ? "transform 200ms ease-out" : "none",
          position: "relative",
          zIndex: 1,
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
