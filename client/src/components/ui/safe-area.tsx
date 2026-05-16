// ============================================================================
// safe-area.tsx — Sprint 8.9
// ----------------------------------------------------------------------------
// Wrapper that pads its content by the device safe-area insets (notch, dynamic
// island, gesture bar). Backed by CSS env(safe-area-inset-*) so it's a no-op
// on devices without insets.
//
//   <SafeArea sides="all">       // top + right + bottom + left
//   <SafeArea sides="top">       // hero header only
//   <SafeArea sides="bottom">    // bottom nav / action bar
//
// On the html element you'll also want:
//   <meta name="viewport" content="viewport-fit=cover, ..." />
// ============================================================================

import * as React from "react";
import { cn } from "@/lib/utils";

type Side = "top" | "right" | "bottom" | "left";

export interface SafeAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  sides?: "all" | Side | Side[];
  /** Extra padding to add ON TOP of the safe-area inset. Default 0. */
  extra?: number;
  as?: keyof JSX.IntrinsicElements;
}

function sideStyles(side: Side, extra: number): React.CSSProperties {
  const v = extra ? `calc(env(safe-area-inset-${side}, 0px) + ${extra}px)` : `env(safe-area-inset-${side}, 0px)`;
  switch (side) {
    case "top": return { paddingTop: v };
    case "right": return { paddingRight: v };
    case "bottom": return { paddingBottom: v };
    case "left": return { paddingLeft: v };
  }
}

export function SafeArea({
  sides = "all",
  extra = 0,
  as = "div",
  className,
  style,
  children,
  ...rest
}: SafeAreaProps) {
  const Comp = as as React.ElementType;
  const sideList: Side[] =
    sides === "all"
      ? ["top", "right", "bottom", "left"]
      : Array.isArray(sides) ? sides : [sides];

  const css = sideList.reduce<React.CSSProperties>(
    (acc, s) => ({ ...acc, ...sideStyles(s, extra) }),
    {},
  );

  return (
    <Comp
      data-testid="safe-area"
      data-sides={sideList.join("-")}
      className={cn(className)}
      style={{ ...css, ...style }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

export default SafeArea;
