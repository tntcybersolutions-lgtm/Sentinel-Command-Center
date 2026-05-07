import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  Lightbulb,
  GitBranch,
  RefreshCw,
  Search,
  ChevronRight,
  Clock,
  User,
  FileText,
  MessageSquare,
  Zap,
  AlertCircle,
} from "lucide-react";

interface HerbieFact {
  id: string;
  tenantId: string;
  projectId?: string;
  subjectType: string;
  subjectId?: string;
  predicate: string;
  object?: string;
  objectJson?: Record<string, unknown>;
  sourceType: "document" | "message" | "user" | "herbie_extraction";
  sourceId?: string;
  confidence: number;
  extractedAt: string;
}
interface HerbieDecision {
  id: string;
  tenantId: string;
  projectId?: string;
  summary: string;
  rationale?: string;
  decidedBy: string;
  decidedAt: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}
interface HerbieRelationship {
  id: string;
  tenantId: string;
  projectId?: string;
  fromEntityType: string;
  fromEntityId: string;
  role: string;
  toEntityType: string;
  toEntityId: string;
  strength?: number;
}

function confidenceColor(c: number) {
  return c >= 0.85 ? "bg-green-500" : c >= 0.6 ? "bg-yellow-500" : "bg-red-500";
}

function sourceIcon(t: string) {
  if (t === "document") return <FileText className="h-3 w-3" />;
  if (t === "message") return <MessageSquare className="h-3 w-3" />;
  if (t === "user") return <User className="h-3 w-3" />;
  if (t === "herbie_extraction") return <Zap className="h-3 w-3" />;
  return <AlertCircle className="h-3 w-3" />;
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function buildMemoryQS(params: Record<string, string | undefined>) {
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") p[k] = v;
  }
  return new URLSearchParams(p).toString();
}

// ─── Facts Tab ───────────────────────────────────────────────────────────────

function FactsTab({ projectId }: { projectId?: string }) {
  const [search, setSearch] = useState("");
  const [subjectType, setSubjectType] = useState("all");
  const qc = useQueryClient();

  const qs = buildMemoryQS({
    projectId,
    subjectType: subjectType !== "all" ? subjectType : undefined,
    limit: "100",
  });

  const { data: facts = [], isLoading } = useQuery<HerbieFact[]>({
    queryKey: ["/api/herbie/memory/facts", projectId, subjectType],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/memory/facts?" + qs).then((r) => r.json()),
  });

  const subjectTypes = Array.from(new Set(facts.map((f) => f.subjectType)));
  const filtered = facts.filter(
    (f) =>
      !search ||
      f.predicate.toLowerCase().includes(search.toLowerCase()) ||
      (f.object ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search facts..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={subjectType} onValueChange={setSubjectType}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Subject type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {subjectTypes.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            qc.invalidateQueries({ queryKey: ["/api/herbie/memory/facts"] })
          }
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading facts…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">No facts found.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((fact) => (
            <Card key={fact.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs font-mono">
                        {fact.subjectType}
                        {fact.subjectId ? ":" + fact.subjectId.slice(0, 8) : ""}
                      </Badge>
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="font-medium text-sm text-primary">
                        {fact.predicate}
                      </span>
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate max-w-xs">
                        {fact.object ??
                          (fact.objectJson
                            ? JSON.stringify(fact.objectJson).slice(0, 80)
                            : "—")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        {sourceIcon(fact.sourceType)}
                        {fact.sourceType}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {fmtDate(fact.extractedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={"h-2 w-2 rounded-full " + confidenceColor(fact.confidence)}
                      />
                      <span className="text-xs font-mono">
                        {Math.round(fact.confidence * 100)}%
                      </span>
                    </div>
                    {fact.projectId && (
                      <Badge variant="secondary" className="text-xs">
                        project
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} of {facts.length} facts
      </p>
    </div>
  );
}

// ─── Decisions Tab ────────────────────────────────────────────────────────────

function DecisionsTab({ projectId }: { projectId?: string }) {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();

  const qs = buildMemoryQS({ projectId, limit: "100" });
  const { data: decisions = [], isLoading } = useQuery<HerbieDecision[]>({
    queryKey: ["/api/herbie/memory/decisions", projectId],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/memory/decisions?" + qs).then((r) =>
        r.json()
      ),
  });

  const filtered = decisions.filter(
    (d) =>
      !search ||
      d.summary.toLowerCase().includes(search.toLowerCase()) ||
      d.decidedBy.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search decisions..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            qc.invalidateQueries({
              queryKey: ["/api/herbie/memory/decisions"],
            })
          }
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">
          Loading decisions…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No decisions recorded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((dec) => (
            <Card key={dec.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="pt-3 pb-3">
                <p className="font-medium text-sm">{dec.summary}</p>
                {dec.rationale && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {dec.rationale}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {dec.decidedBy}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {fmtDate(dec.decidedAt)}
                  </span>
                  {dec.relatedEntityType && (
                    <Badge variant="outline" className="text-xs">
                      {dec.relatedEntityType}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} of {decisions.length} decisions
      </p>
    </div>
  );
}

// ─── Relationships Tab ────────────────────────────────────────────────────────

function RelationshipsTab({ projectId }: { projectId?: string }) {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("all");
  const qc = useQueryClient();

  const qs = buildMemoryQS({ projectId, role: role !== "all" ? role : undefined });
  const { data: rels = [], isLoading } = useQuery<HerbieRelationship[]>({
    queryKey: ["/api/herbie/memory/relationships", projectId, role],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/memory/relationships?" + qs).then((r) =>
        r.json()
      ),
  });

  const roles = Array.from(new Set(rels.map((r) => r.role)));
  const filtered = rels.filter(
    (r) =>
      !search ||
      r.role.toLowerCase().includes(search.toLowerCase()) ||
      r.fromEntityType.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search relationships..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          onClick={() =>
            qc.invalidateQueries({
              queryKey: ["/api/herbie/memory/relationships"],
            })
          }
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No relationships found.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((rel) => (
            <Card key={rel.id} className="hover:bg-muted/50 transition-colors">
              <CardContent className="pt-3 pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-xs font-mono">
                    {rel.fromEntityType}:{rel.fromEntityId.slice(0, 8)}
                  </Badge>
                  <span className="text-xs font-medium text-primary px-1">
                    —[{rel.role}]→
                  </span>
                  <Badge variant="outline" className="text-xs font-mono">
                    {rel.toEntityType}:{rel.toEntityId.slice(0, 8)}
                  </Badge>
                  {rel.strength != null && (
                    <Badge variant="secondary" className="text-xs ml-auto">
                      strength {Math.round(rel.strength * 100)}%
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} of {rels.length} relationships
      </p>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HerbieMemoryInspector() {
  const [projectId, setProjectId] = useState("");

  const { data: facts = [] } = useQuery<HerbieFact[]>({
    queryKey: ["/api/herbie/memory/facts", "stats"],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/memory/facts?limit=1000").then((r) =>
        r.json()
      ),
  });
  const { data: decisions = [] } = useQuery<HerbieDecision[]>({
    queryKey: ["/api/herbie/memory/decisions", "stats"],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/memory/decisions?limit=1000").then((r) =>
        r.json()
      ),
  });
  const { data: rels = [] } = useQuery<HerbieRelationship[]>({
    queryKey: ["/api/herbie/memory/relationships", "stats"],
    queryFn: () =>
      apiRequest("GET", "/api/herbie/memory/relationships").then((r) =>
        r.json()
      ),
  });

  const filterId = projectId.trim() || undefined;

  const statCards = [
    {
      label: "Facts",
      value: facts.length,
      icon: <Lightbulb className="h-5 w-5 text-yellow-500" />,
      border: "border-yellow-200 dark:border-yellow-900",
    },
    {
      label: "Decisions",
      value: decisions.length,
      icon: <Brain className="h-5 w-5 text-purple-500" />,
      border: "border-purple-200 dark:border-purple-900",
    },
    {
      label: "Relationships",
      value: rels.length,
      icon: <GitBranch className="h-5 w-5 text-blue-500" />,
      border: "border-blue-200 dark:border-blue-900",
    },
  ];

  return (
    <div className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Brain className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Herbie Memory Inspector
            </h1>
            <p className="text-sm text-muted-foreground">
              Browse facts, decisions, and relationships Herbie has learned
            </p>
          </div>
        </div>
        <Input
          placeholder="Filter by project ID…"
          className="w-60 font-mono text-sm"
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className={s.border + " border-2"}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                {s.icon}
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="facts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="facts" className="gap-2">
            <Lightbulb className="h-4 w-4" /> Facts{" "}
            <Badge variant="secondary" className="ml-1">
              {facts.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="decisions" className="gap-2">
            <Brain className="h-4 w-4" /> Decisions{" "}
            <Badge variant="secondary" className="ml-1">
              {decisions.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="relationships" className="gap-2">
            <GitBranch className="h-4 w-4" /> Relationships{" "}
            <Badge variant="secondary" className="ml-1">
              {rels.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="facts">
          <FactsTab projectId={filterId} />
        </TabsContent>
        <TabsContent value="decisions">
          <DecisionsTab projectId={filterId} />
        </TabsContent>
        <TabsContent value="relationships">
          <RelationshipsTab projectId={filterId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
