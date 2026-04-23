// Roadmap Feature 7 — "Powered by Sentinel + Herbie" footer.
//
// Every client-facing artifact (portal pages, shareable project views,
// generated PDFs' web surfaces) gets this footer as a passive referral
// driver — that's the Phase 1 win condition from CLAUDE.md / ROADMAP.md.

import { cn } from "@/lib/utils";

export interface PoweredByFooterProps {
  className?: string;
  // When "muted", the footer is subtle (muted-foreground, smaller);
  // "brand" shows the product name more prominently on client-facing
  // pages like the portal. Default is "muted".
  variant?: "muted" | "brand";
}

export function PoweredByFooter({
  className,
  variant = "muted",
}: PoweredByFooterProps) {
  return (
    <footer
      className={cn(
        "w-full border-t",
        variant === "brand"
          ? "py-6 text-center text-sm text-muted-foreground"
          : "py-3 text-center text-xs text-muted-foreground",
        className,
      )}
      data-testid="powered-by-footer"
    >
      {variant === "brand" ? (
        <div className="space-y-1">
          <div>This is a secure portal. All access is logged and audited.</div>
          <div>
            Powered by{" "}
            <span className="font-medium text-foreground">Sentinel</span>
            {" + "}
            <span className="font-medium text-foreground">Herbie</span>
          </div>
        </div>
      ) : (
        <div>
          Powered by{" "}
          <span className="font-medium">Sentinel + Herbie</span>
        </div>
      )}
    </footer>
  );
}
