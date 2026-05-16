// ============================================================================
// card-tiered.tsx — Sprint 8.3
// ----------------------------------------------------------------------------
// Three explicit elevation tiers replacing the everything-is-the-same-slate
// card pattern. Reads as one visual hierarchy on the dashboard.
//
//   <CardTiered tier="hero">     // raised + shadow, primary numbers
//   <CardTiered tier="secondary"> // flat tinted card, lists / sections
//   <CardTiered tier="tertiary">  // outline only, ambient context
//
// Backed by the same primitive as Card (a div with rounded border) — opt-in,
// existing Card consumers untouched.
// ============================================================================

import * as React from "react";
import { cn } from "@/lib/utils";

export type CardTier = "hero" | "secondary" | "tertiary";

const TIER_STYLES: Record<CardTier, string> = {
  hero:
    "bg-zinc-900/80 border-zinc-700 shadow-lg shadow-black/40 " +
    "ring-1 ring-white/5 backdrop-blur-sm",
  secondary:
    "bg-zinc-900/40 border-zinc-800",
  tertiary:
    "bg-transparent border-zinc-800/60",
};

export interface CardTieredProps extends React.HTMLAttributes<HTMLDivElement> {
  tier?: CardTier;
}

export const CardTiered = React.forwardRef<HTMLDivElement, CardTieredProps>(
  ({ tier = "secondary", className, ...rest }, ref) => (
    <div
      ref={ref}
      data-testid="card-tiered"
      data-tier={tier}
      className={cn(
        "rounded-xl border p-4 transition-colors",
        TIER_STYLES[tier],
        className,
      )}
      {...rest}
    />
  ),
);
CardTiered.displayName = "CardTiered";

export default CardTiered;
