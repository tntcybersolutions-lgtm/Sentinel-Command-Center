import { useEffect, useRef, useState, type ReactNode } from "react";
import * as haptics from "@/lib/haptics";

const REVEAL_PX = 88;
const TRIGGER_PX = 60;
const DAMP = 0.45;

export type SwipeAction = { label: string; color: string; onAction: () => void };

export default function SwipeRow({
  leftAction, rightAction, children, disabled = false,
}: {
  leftAction?: SwipeAction; rightAction?: SwipeAction;
  children: ReactNode; disabled?: boolean;
}) {
  const [dx, setDx] = useState(0);
  const startX = useRef<number | null>(null);
  const lastHaptic = useRef<"left" | "right" | null>(null);

  function onTouchStart(e: React.TouchEvent) {
    if (disabled) return;
    startX.current = e.touches[0].clientX;
    lastHaptic.current = null;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startX.current == null || disabled) return;
    const raw = e.touches[0].clientX - startX.current;
    const damped = Math.abs(raw) > REVEAL_PX
      ? Math.sign(raw) * (REVEAL_PX + (Math.abs(raw) - REVEAL_PX) * DAMP)
      : raw;
    if (damped > 0 && !leftAction) return;
    if (damped < 0 && !rightAction) return;
    setDx(damped);
    if (damped > TRIGGER_PX && lastHaptic.current !== "right") {
      haptics.select(); lastHaptic.current = "right";
    } else if (damped < -TRIGGER_PX && lastHaptic.current !== "left") {
      haptics.select(); lastHaptic.current = "left";
    }
  }
  function onTouchEnd() {
    if (startX.current == null) { setDx(0); return; }
    if (dx > TRIGGER_PX && leftAction) { haptics.success(); leftAction.onAction(); }
    else if (dx < -TRIGGER_PX && rightAction) { haptics.success(); rightAction.onAction(); }
    startX.current = null;
    setDx(0);
  }
  useEffect(() => () => { startX.current = null; }, []);

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: 16 }}>
      {leftAction && (
        <div style={{
          position: "absolute", inset: 0, background: leftAction.color,
          display: "flex", alignItems: "center", paddingLeft: 16,
          color: "#fff", fontSize: 13, fontWeight: 500, pointerEvents: "none",
        }}>{leftAction.label}</div>
      )}
      {rightAction && (
        <div style={{
          position: "absolute", inset: 0, background: rightAction.color,
          display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 16,
          color: "#fff", fontSize: 13, fontWeight: 500, pointerEvents: "none",
        }}>{rightAction.label}</div>
      )}
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
        style={{
          transform: "translateX(" + dx + "px)",
          transition: startX.current == null ? "transform 200ms ease-out" : "none",
          position: "relative", zIndex: 1, touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
