/**
 * Sprint L3-C â Swipe gestures on Punch cards
 *
 * Wraps a card with horizontal-drag detection. Swipe RIGHT past threshold â
 * onSwipeRight (advance status). Swipe LEFT past threshold â onSwipeLeft
 * (back). A colored cue slides in behind the card to show what the swipe will
 * do (green check for advance, amber arrow for back). Haptic ping on release.
 *
 * Uses framer-motion's drag handlers â already a project dep.
 *
 * Pointer-fine devices (mouse) get drag too but with a higher threshold so
 * accidental click-drags don't fire actions.
 *
 * Usage:
 *   <SwipeCard
 *     onSwipeRight={() => advance(item.id)}
 *     onSwipeLeft={() => back(item.id)}
 *     rightLabel="Advance"
 *     leftLabel="Back"
 *     disabled={item.status === "closed"}
 *   >
 *     <PunchCardBody item={item} />
 *   </SwipeCard>
 */

import { type ReactNode, useState, useRef } from "react";
import { motion, type PanInfo } from "framer-motion";
import { CheckCircle2, ArrowLeft } from "lucide-react";

const TRIGGER_PX = 90;   // distance past which the action commits
const MAX_DRAG = 160;    // hard stop for the drag
const VELOCITY = 600;    // px/s â fast flick also commits even if short

export interface SwipeCardProps {
  children: ReactNode;
  onSwipeRight?: () => void;
  onSwipeLeft?: () => void;
  rightLabel?: string;
  leftLabel?: string;
  disabled?: boolean;
  className?: string;
}

function triggerHaptic(pattern: number | number[] = 12) {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      (navigator as any).vibrate(pattern);
    }
  } catch {
    /* ignore */
  }
}

export function SwipeCard({
  children,
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Advance",
  leftLabel = "Back",
  disabled = false,
  className = "",
}: SwipeCardProps) {
  // Track current drag offset so we can size the colored cue behind the card
  const [x, setX] = useState(0);
  const lastHapticDir = useRef<"right" | "left" | null>(null);

  const handleDrag = (_e: PointerEvent | TouchEvent | MouseEvent, info: PanInfo) => {
    // Constrain to max
    const constrained = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, info.offset.x));
    setX(constrained);

    // Light haptic when we cross the trigger threshold (first time per direction)
    if (constrained >= TRIGGER_PX && lastHapticDir.current !== "right") {
      triggerHaptic(8);
      lastHapticDir.current = "right";
    } else if (constrained <= -TRIGGER_PX && lastHapticDir.current !== "left") {
      triggerHaptic(8);
      lastHapticDir.current = "left";
    } else if (constrained > -TRIGGER_PX && constrained < TRIGGER_PX) {
      lastHapticDir.current = null;
    }
  };

  const handleDragEnd = (
    _e: PointerEvent | TouchEvent | MouseEvent,
    info: PanInfo,
  ) => {
    const committedRight =
      (info.offset.x >= TRIGGER_PX || info.velocity.x > VELOCITY) &&
      !!onSwipeRight;
    const committedLeft =
      (info.offset.x <= -TRIGGER_PX || info.velocity.x < -VELOCITY) &&
      !!onSwipeLeft;

    if (committedRight) {
      triggerHaptic([15, 30, 15]);
      onSwipeRight!();
    } else if (committedLeft) {
      triggerHaptic([15, 30, 15]);
      onSwipeLeft!();
    }
    setX(0);
    lastHapticDir.current = null;
  };

  // Visible cue size + intensity scales with x
  const ratio = Math.min(1, Math.abs(x) / TRIGGER_PX);
  const rightOpacity = x > 0 ? Math.min(1, ratio) : 0;
  const leftOpacity = x < 0 ? Math.min(1, ratio) : 0;
  const past = Math.abs(x) >= TRIGGER_PX;

  if (disabled) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div className={`relative overflow-hidden rounded-xl ${className}`}>
      {/* Right (Advance) cue â under the card, revealed on right swipe */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-start pl-4"
        style={{
          background: past && x > 0
            ? "linear-gradient(90deg, rgb(16, 185, 129) 0%, rgba(16,185,129,0.6) 100%)"
            : "linear-gradient(90deg, rgba(16,185,129,0.45) 0%, rgba(16,185,129,0.12) 100%)",
          opacity: rightOpacity,
          transition: "background 100ms",
        }}
      >
        <div className="flex items-center gap-2 text-white text-xs font-semibold">
          <CheckCircle2 className="h-4 w-4" />
          <span>{rightLabel}</span>
        </div>
      </div>

      {/* Left (Back) cue */}
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end pr-4"
        style={{
          background: past && x < 0
            ? "linear-gradient(270deg, rgb(245, 158, 11) 0%, rgba(245,158,11,0.6) 100%)"
            : "linear-gradient(270deg, rgba(245,158,11,0.45) 0%, rgba(245,158,11,0.12) 100%)",
          opacity: leftOpacity,
          transition: "background 100ms",
        }}
      >
        <div className="flex items-center gap-2 text-white text-xs font-semibold">
          <ArrowLeft className="h-4 w-4" />
          <span>{leftLabel}</span>
        </div>
      </div>

      {/* Card itself, draggable horizontally */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -MAX_DRAG, right: MAX_DRAG }}
        dragElastic={0.15}
        dragMomentum={false}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        animate={{ x: 0 }}
        transition={{ type: "spring", stiffness: 600, damping: 38 }}
        style={{ touchAction: "pan-y" }}
        data-testid="swipe-card"
      >
        {children}
      </motion.div>
    </div>
  );
}

export default SwipeCard;
