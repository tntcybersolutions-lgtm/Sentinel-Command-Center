import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  Shield,
  CheckSquare,
  FileQuestion,
  FileText,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useLocation } from "wouter";

interface DigestItem {
  severity: "critical" | "high" | "medium" | "low";
  category: "coi" | "approval" | "rfi" | "submittal";
  headline: string;
  detail?: string;
  entity?: { type: string; id: string };
  suggestedAction?: string;
}

interface HerbieDigest {
  tenantId: string;
  projectId?: string;
  generatedAt: string;
  totals: { critical: number; high: number; medium: number; low: number };
  items: DigestItem[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:text-red-400 dark:border-red-900",
  high: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-900",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950/30 dark:text-yellow-400 dark:border-yellow-900",
  low: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-900",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  coi: <Shield className="h-3.5 w-3.5" />,
  approval: <CheckSquare className="h-3.5 w-3.5" />,
  rfi: <FileQuestion className="h-3.5 w-3.5" />,
  submittal: <FileText className="h-3.5 w-3.5" />,
};

function SeverityBar({ totals }: { totals: HerbieDigest["totals"] }) {
  const total = totals.critical + totals.high + totals.medium + totals.low;
  if (total === 0) return null;
  return (
    <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
      {totals.critical > 0 && (
        <div className="bg-red-500" style={{ width: `${(totals.critical / total) * 100}%` }} title={`${totals.critical} critical`} />
      )}
      {totals.high > 0 && (
        <div className="bg-orange-500" style={{ width: `${(totals.high / total) * 100}%` }} title={`${totals.high} high`} />
      )}
      {totals.medium > 0 && (
        <div className="bg-yellow-500" style={{ width: `${(totals.medium / total) * 100}%` }} title={`${totals.medium} medium`} />
      )}
      {totals.low > 0 && (
        <div className="bg-blue-400" style={{ width: `${(totals.low / total) * 100}%` }} title={`${totals.low} low`} />
      )}
    </div>
  );
}

function DigestItemCard({ item }: { item: DigestItem }) {
  return (
    <div className={`rounded-lg border p-3 ${SEVERITY_COLORS[item.severity] ?? ""}`}>
      <div className="flex items-start gap-2">
        <div className="mt-0.5 shrink-0">{CATEGORY_ICONS[item.category] ?? <AlertCircle className="h-3.5 w-3.5" />}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{item.headline}</span>
            <Badge variant="outline" className="text-xs capitalize border-current">
              {item.category}
            </Badge>
          </div>
          {item.detail && (
            <p className="text-xs mt-0.5 opacity-80 line-clamp-2">{item.detail}</p>
          )}
          {item.suggestedAction && (
            <p className="text-xs mt-1 font-medium opacity-90">→ {item.suggestedAction}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HerbieDigestPage() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: digest, isLoading, error, dataUpdatedAt } = useQuery<HerbieDigest>({
    queryKey: ["/api/herbie/digest"],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/digest").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["/api/herbie/digest"] });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Building Herbie digest…
        </div>
      </div>
    );
  }

  if (error || !digest) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 p-4 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-400">Failed to build digest</p>
            <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">
              {(error as Error)?.message ?? "Unknown error"}
            </p>
          </div>
          <Button variant="outline" size="sm" className="ml-auto" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const { totals, items } = digest;
  const totalItems = totals.critical + totals.high + totals.medium + totals.low;
  const criticalAndHigh = totals.critical + totals.high;

  const criticalItems = items.filter((i) => i.severity === "critical");
  const highItems = items.filter((i) => i.severity === "high");
  const mediumItems = items.filter((i) => i.severity === "medium");
  const lowItems = items.filter((i) => i.severity === "low");

  const fmtTime = (d: string) => {
    try {
      return new Date(d).toLocaleString("en-US", {
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
      });
    } catch { return d; }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <TrendingUp className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Herbie Digest</h1>
            <p className="text-sm text-muted-foreground">
              Cross-project attention summary — {totalItems} item{totalItems !== 1 ? "s" : ""} requiring review
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dataUpdatedAt > 0 && (
            <span className="text-xs text-muted-foreground">
              Updated {fmtTime(new Date(dataUpdatedAt).toISOString())}
            </span>
          )}
          <Button variant="outline" size="sm" className="gap-2" onClick={refresh}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Critical", count: totals.critical, color: "border-red-500 dark:border-red-700", textColor: "text-red-600 dark:text-red-400" },
          { label: "High", count: totals.high, color: "border-orange-500 dark:border-orange-700", textColor: "text-orange-600 dark:text-orange-400" },
          { label: "Medium", count: totals.medium, color: "border-yellow-500 dark:border-yellow-700", textColor: "text-yellow-600 dark:text-yellow-400" },
          { label: "Low", count: totals.low, color: "border-blue-400 dark:border-blue-700", textColor: "text-blue-600 dark:text-blue-400" },
        ].map((s) => (
          <Card key={s.label} className={`border-l-4 ${s.color}`}>
            <CardContent className="pt-3 pb-3">
              <p className={`text-2xl font-bold ${s.textColor}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Severity bar */}
      {totalItems > 0 && (
        <div className="space-y-1">
          <SeverityBar totals={totals} />
          <p className="text-xs text-muted-foreground">
            {criticalAndHigh > 0 && (
              <span className="text-red-500 font-medium">{criticalAndHigh} high-priority</span>
            )}
            {criticalAndHigh > 0 && mediumItems.length + lowItems.length > 0 && " + "}
            {mediumItems.length + lowItems.length > 0 && (
              <span>{mediumItems.length + lowItems.length} lower-priority</span>
            )}
            {" items across all projects"}
          </p>
        </div>
      )}

      {totalItems === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-muted-foreground gap-2">
            <CheckSquare className="h-8 w-8 opacity-40" />
            <p className="text-sm font-medium">All clear!</p>
            <p className="text-xs">No items require your attention right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {criticalItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" /> Critical ({criticalItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {criticalItems.map((item, i) => (
                  <DigestItemCard key={i} item={item} />
                ))}
              </CardContent>
            </Card>
          )}

          {highItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-orange-600 dark:text-orange-400">
                  <AlertCircle className="h-4 w-4" /> High ({highItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {highItems.map((item, i) => (
                  <DigestItemCard key={i} item={item} />
                ))}
              </CardContent>
            </Card>
          )}

          {mediumItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                  <AlertCircle className="h-4 w-4" /> Medium ({mediumItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {mediumItems.map((item, i) => (
                  <DigestItemCard key={i} item={item} />
                ))}
              </CardContent>
            </Card>
          )}

          {lowItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-400">
                  <AlertCircle className="h-4 w-4" /> Low ({lowItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {lowItems.map((item, i) => (
                  <DigestItemCard key={i} item={item} />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <p className="text-xs text-center text-muted-foreground">
        Digest generated at {fmtTime(digest.generatedAt)} · Auto-refreshes every 10 minutes
      </p>
    </div>
  );
}
