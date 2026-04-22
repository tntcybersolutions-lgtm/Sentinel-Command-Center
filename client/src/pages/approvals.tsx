import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { entityLabel as entityLabelFn } from "@/lib/labels";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  MessageSquare,
  FileText,
  Mail,
  Send,
  ChevronDown,
  ChevronUp,
  Filter,
  ExternalLink,
  Search,
  ArrowUpDown,
  Handshake,
  UserCheck,
  Target,
  FolderTree,
  ClipboardCheck,
  ShieldAlert,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ApprovalRequest {
  id: string;
  entityType: string;
  entityId: string;
  actionType: string;
  title: string;
  description: string;
  entityName: string;
  agencyName: string;
  dollarValue: number | null;
  deadline: string | null;
  naicsCodes: string[];
  setAside: string;
  solNumber: string;
  herbieReason: string;
  requiredRole: string;
  fitScore: number | null;
  requestedBy: string;
  requestedByType: "herbie" | "user";
  priority: "high" | "urgent" | "normal" | "low";
  status: "pending" | "approved" | "denied";
  context: Record<string, any>;
  createdAt: string;
  expiresAt: string | null;
}

interface ApprovalStats {
  pending: number;
  approvedToday: number;
  deniedToday: number;
  urgent: number;
  totalValue: number;
}

type SortField = "priority" | "deadline" | "value" | "created";

function formatDollars(value: number | null): string {
  if (!value) return "—";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toLocaleString()}`;
}

function getTimeSince(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? "Just now" : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function getDaysUntil(dateStr: string | null): { text: string; urgent: boolean } | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff < 0) return { text: "Overdue", urgent: true };
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return { text: `${hours}h left`, urgent: true };
  const days = Math.floor(hours / 24);
  if (days <= 3) return { text: `${days}d left`, urgent: true };
  return { text: `${days}d left`, urgent: false };
}

function getEntityIcon(entityType: string, actionType: string) {
  switch (entityType) {
    case "bid_decision":
    case "bid_project":
      return actionType === "bid_submission" ? <Send className="h-5 w-5" /> : <FileText className="h-5 w-5" />;
    case "email":
      return <Mail className="h-5 w-5" />;
    case "teaming_agreement":
      return <Handshake className="h-5 w-5" />;
    case "vendor":
      return <UserCheck className="h-5 w-5" />;
    default:
      return <MessageSquare className="h-5 w-5" />;
  }
}

function getEntityLabel(entityType: string): string {
  const overrides: Record<string, string> = {
    bid_project: "Bid Submission",
    teaming_agreement: "Teaming",
    vendor: "Vendor Review",
  };
  if (overrides[entityType]) return overrides[entityType];
  return entityLabelFn(entityType);
}

function getEntityRoute(entityType: string, entityId: string): string | null {
  switch (entityType) {
    case "bid_decision":
    case "bid_project":
      return `/bid-jacket/${entityId}`;
    case "vendor":
      return "/vendors";
    case "email":
      return null;
    case "teaming_agreement":
      return null;
    default:
      return null;
  }
}

function priorityWeight(p: string): number {
  switch (p) {
    case "urgent": return 4;
    case "high": return 3;
    case "normal": return 2;
    case "low": return 1;
    default: return 0;
  }
}

function toActionLabel(actionType: string): string {
  switch ((actionType || "").toLowerCase()) {
    case "jacket_build": return "Bid Setup";
    case "bid_submission": return "Bid Submission Review";
    case "send_email": return "Client Communication";
    case "vendor_create": return "Vendor Approval";
    default: return "Review Item";
  }
}

function toActionVerb(actionType: string): string {
  switch ((actionType || "").toLowerCase()) {
    case "jacket_build": return "Initialize Bid Structure";
    case "bid_submission": return "Review Submission Package";
    case "send_email": return "Approve Message";
    case "vendor_create": return "Approve Vendor Profile";
    default: return "Review";
  }
}

function actionGlyph(actionType: string) {
  switch ((actionType || "").toLowerCase()) {
    case "jacket_build": return <FolderTree className="h-4 w-4" />;
    case "bid_submission": return <ClipboardCheck className="h-4 w-4" />;
    case "send_email": return <Send className="h-4 w-4" />;
    default: return <ShieldAlert className="h-4 w-4" />;
  }
}

function proBadgePriority(priority: ApprovalRequest["priority"]) {
  switch (priority) {
    case "urgent": return <Badge variant="destructive">Urgent</Badge>;
    case "high": return <Badge variant="destructive">High Priority</Badge>;
    case "low": return <Badge variant="outline">Low Priority</Badge>;
    default: return <Badge variant="secondary">Standard</Badge>;
  }
}

function proBadgeStatus(status: ApprovalRequest["status"]) {
  switch (status) {
    case "approved": return <Badge variant="secondary">Approved</Badge>;
    case "denied": return <Badge variant="destructive">Denied</Badge>;
    default: return <Badge variant="outline">Pending</Badge>;
  }
}

function riskBadge(fitScore: number | null) {
  if (fitScore == null) return <Badge variant="outline">Standard Review</Badge>;
  const score = Math.round(fitScore);
  if (score >= 75) return <Badge variant="destructive">{`High Risk \u2014 Score ${score}`}</Badge>;
  if (score >= 50) return <Badge variant="secondary">{`Moderate Risk \u2014 Score ${score}`}</Badge>;
  return <Badge variant="outline">{`Low Risk \u2014 Score ${score}`}</Badge>;
}

function cleanProjectName(a: ApprovalRequest): string {
  if (a.entityName && a.entityName.trim()) return a.entityName.trim();
  const t = (a.title || "").trim();
  const idx = t.indexOf(":");
  if (idx !== -1 && t.slice(idx + 1).trim()) return t.slice(idx + 1).trim();
  return t || "Untitled Project";
}

function professionalSummary(a: ApprovalRequest): string {
  const reason = (a.herbieReason || "").trim();
  const name = cleanProjectName(a);
  if (reason) return reason;
  switch ((a.actionType || "").toLowerCase()) {
    case "jacket_build":
      return `Prepare the bid workspace for \u201c${name}\u201d by creating the required folder structure and initializing baseline artifacts.`;
    case "bid_submission":
      return `Review the submission package for \u201c${name}\u201d to confirm scope coverage, compliance items, and final deliverables.`;
    case "send_email":
      return `Review and approve the outbound message associated with \u201c${name}\u201d.`;
    case "vendor_create":
      return `Review and approve the vendor profile request associated with \u201c${name}\u201d.`;
    default:
      return `Review the requested item for \u201c${name}\u201d and either approve or send back with notes.`;
  }
}

type ApprovalCardProps = {
  approval: ApprovalRequest;
  expandedId: string | null;
  setExpandedId: React.Dispatch<React.SetStateAction<string | null>>;
  notes: Record<string, string>;
  setNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  approveMutation: { mutate: (args: { id: string; note: string }) => void; isPending: boolean };
  denyMutation: { mutate: (args: { id: string; note: string }) => void; isPending: boolean };
};

function ApprovalCardDocument({
  approval,
  expandedId,
  setExpandedId,
  notes,
  setNotes,
  approveMutation,
  denyMutation,
}: ApprovalCardProps) {
  const [, navigate] = useLocation();

  const isExpanded = expandedId === approval.id;
  const currentNote = notes[approval.id] || "";

  const actionLabel = useMemo(() => toActionLabel(approval.actionType), [approval.actionType]);
  const actionVerb = useMemo(() => toActionVerb(approval.actionType), [approval.actionType]);
  const projectName = useMemo(() => cleanProjectName(approval), [approval]);
  const summary = useMemo(() => professionalSummary(approval), [approval]);
  const entityLabel = useMemo(() => getEntityLabel(approval.entityType), [approval.entityType]);
  const route = useMemo(() => getEntityRoute(approval.entityType, approval.entityId), [approval.entityType, approval.entityId]);
  const requested = useMemo(() => getTimeSince(approval.createdAt), [approval.createdAt]);
  const due = useMemo(() => getDaysUntil(approval.deadline), [approval.deadline]);
  const dueDateText = useMemo(() => (approval.deadline ? new Date(approval.deadline).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : null), [approval.deadline]);
  const createdDateTime = useMemo(() => new Date(approval.createdAt).toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" }), [approval.createdAt]);
  const isMutating = approveMutation.isPending || denyMutation.isPending;

  return (
    <Card
      className={cn("border-muted/50 bg-card/40 backdrop-blur-sm", due?.urgent && "ring-1 ring-red-500/40")}
      data-testid={`approval-card-${approval.id}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg border border-muted/60 bg-muted/20">
              {getEntityIcon(approval.entityType, approval.actionType)}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <h3 className="text-base font-semibold leading-5 truncate" data-testid={`text-approval-title-${approval.id}`}>
                  {projectName}
                </h3>
                {proBadgePriority(approval.priority)}
                {proBadgeStatus(approval.status)}
              </div>

              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{actionLabel}</Badge>
                {riskBadge(approval.fitScore)}
                {approval.setAside ? <Badge variant="secondary">{approval.setAside}</Badge> : null}
                {approval.naicsCodes?.length ? (
                  <Badge variant="secondary">{`NAICS ${approval.naicsCodes.slice(0, 2).join(", ")}${approval.naicsCodes.length > 2 ? "\u2026" : ""}`}</Badge>
                ) : null}
              </div>

              <p className="mt-2 text-sm text-muted-foreground" data-testid={`text-approval-summary-${approval.id}`}>{summary}</p>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground" data-testid={`text-approval-meta-${approval.id}`}>
                <span data-testid={`text-approval-requested-${approval.id}`}>{`Requested ${requested} (${createdDateTime})`}</span>
                {approval.deadline ? (
                  <span>{`Deadline ${dueDateText}`}{due?.text ? ` \u2022 ${due.text}` : ""}</span>
                ) : (
                  <span>No deadline provided</span>
                )}
                {approval.agencyName ? <span>{approval.agencyName}</span> : null}
                <span>{approval.dollarValue ? `Estimated ${formatDollars(approval.dollarValue)}` : "Estimated value not set"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {route ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); navigate(route); }}
                title="Open item"
                data-testid={`button-view-entity-${approval.id}`}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setExpandedId(isExpanded ? null : approval.id)}
              aria-expanded={isExpanded}
              title={isExpanded ? "Collapse" : "Expand"}
              data-testid={`approval-toggle-${approval.id}`}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>

      {isExpanded ? (
        <>
          <Separator className="opacity-40" />
          <CardContent className="pt-4" data-testid={`approval-detail-${approval.id}`}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-muted/60 bg-muted/10 p-4">
                <div className="text-xs font-semibold tracking-wide text-muted-foreground">DECISION</div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-muted/60 bg-background/30">
                    {actionGlyph(approval.actionType)}
                  </span>
                  <div className="text-sm font-semibold">{actionVerb}</div>
                </div>
                <div className="mt-2 text-sm text-muted-foreground">{summary}</div>

                <div className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground">WHY THIS IS IN YOUR QUEUE</div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {approval.herbieReason?.trim()
                    ? approval.herbieReason.trim()
                    : "This item requires review due to automation rules and/or missing required artifacts."}
                </div>

                {approval.requiredRole?.trim() ? (
                  <>
                    <div className="mt-4 text-xs font-semibold tracking-wide text-muted-foreground">REQUIRED APPROVER ROLE</div>
                    <div className="mt-2 text-sm">{approval.requiredRole}</div>
                  </>
                ) : null}
              </div>

              <div className="rounded-xl border border-muted/60 bg-muted/10 p-4">
                <div className="text-xs font-semibold tracking-wide text-muted-foreground">RECORD SUMMARY</div>
                <div className="mt-2 rounded-lg border border-muted/50 bg-background/30 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground">Project</div>
                      <div className="font-semibold truncate">{projectName}</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!route}
                      onClick={() => route && navigate(route)}
                      data-testid={`button-open-project-${approval.id}`}
                    >
                      View
                    </Button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div>
                      <div>Entity</div>
                      <div className="text-sm text-foreground">{entityLabel}</div>
                    </div>
                    <div>
                      <div>Solicitation</div>
                      <div className="text-sm text-foreground">{approval.solNumber || "\u2014"}</div>
                    </div>
                    <div>
                      <div>Agency</div>
                      <div className="text-sm text-foreground">{approval.agencyName || "\u2014"}</div>
                    </div>
                    <div>
                      <div>Deadline</div>
                      <div className="text-sm text-foreground">
                        {approval.deadline ? `${dueDateText}${due?.text ? ` (${due.text})` : ""}` : "\u2014"}
                      </div>
                    </div>
                    <div>
                      <div>Estimated Value</div>
                      <div className="text-sm text-foreground">{approval.dollarValue ? formatDollars(approval.dollarValue) : "\u2014"}</div>
                    </div>
                    <div>
                      <div>Requested</div>
                      <div className="text-sm text-foreground">{createdDateTime}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-muted/60 bg-muted/10 p-4">
              <div className="text-xs font-semibold tracking-wide text-muted-foreground">REVIEW NOTES</div>
              <Textarea
                className="mt-2"
                placeholder="Add review notes for audit trail (recommended when sending back)."
                value={currentNote}
                onChange={(e) => setNotes((prev) => ({ ...prev, [approval.id]: e.target.value }))}
                data-testid={`textarea-notes-${approval.id}`}
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  disabled={isMutating || approval.status !== "pending"}
                  onClick={() => approveMutation.mutate({ id: approval.id, note: currentNote })}
                  data-testid={`button-approve-${approval.id}`}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Approve
                </Button>
                <Button
                  variant="outline"
                  disabled={isMutating || approval.status !== "pending"}
                  onClick={() => denyMutation.mutate({ id: approval.id, note: currentNote })}
                  data-testid={`button-deny-${approval.id}`}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Send Back
                </Button>
                <div className="text-xs text-muted-foreground ml-auto">
                  {approval.requestedByType === "herbie" ? "Requested by HERBIE" : "Requested by user"} \u2022 {approval.requestedBy}
                </div>
              </div>
            </div>
          </CardContent>
        </>
      ) : (
        <CardContent className="pt-0 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => approveMutation.mutate({ id: approval.id, note: currentNote })}
              disabled={isMutating || approval.status !== "pending"}
              data-testid={`button-quick-approve-${approval.id}`}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button
              variant="outline"
              onClick={() => setExpandedId(approval.id)}
              data-testid={`button-details-${approval.id}`}
            >
              Details
            </Button>
            {route ? (
              <Button variant="ghost" onClick={() => navigate(route)} data-testid={`button-open-${approval.id}`}>
                Open
              </Button>
            ) : null}
            <div className="ml-auto text-xs text-muted-foreground">
              {approval.deadline ? `Deadline ${dueDateText}${due?.text ? ` \u2022 ${due.text}` : ""}` : "No deadline provided"}
            </div>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function Approvals() {
  const [selectedTab, setSelectedTab] = useState("pending");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("priority");
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: approvals, isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ["/api/approvals"],
  });

  const { data: stats } = useQuery<ApprovalStats>({
    queryKey: ["/api/approvals/stats"],
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/approvals/${id}/approve`, { notes: note });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner/command-brief"] });
      toast({ title: "Approved", description: "Action has been approved and will be executed." });
      setExpandedId(null);
      setNotes((prev) => { const n = { ...prev }; delete n[variables.id]; return n; });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve. Please try again.", variant: "destructive" });
    },
  });

  const denyMutation = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const res = await apiRequest("POST", `/api/approvals/${id}/deny`, { notes: note });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/planner/command-brief"] });
      toast({ title: "Denied", description: "Action has been denied and blocked." });
      setExpandedId(null);
      setNotes((prev) => { const n = { ...prev }; delete n[variables.id]; return n; });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to deny. Please try again.", variant: "destructive" });
    },
  });

  const displayApprovals = approvals || [];

  const entityTypes = useMemo(() => {
    const types = new Set(displayApprovals.map((a) => a.entityType));
    return Array.from(types);
  }, [displayApprovals]);

  const filteredAndSorted = useMemo(() => {
    let items = displayApprovals.filter((a) => {
      const matchesTab = selectedTab === "all" || a.status === selectedTab;
      const matchesType = filterType === "all" || a.entityType === filterType;
      const matchesPriority = filterPriority === "all" || a.priority === filterPriority;
      const matchesSearch = !searchQuery ||
        a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.entityName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.agencyName.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesTab && matchesType && matchesPriority && matchesSearch;
    });

    items.sort((a, b) => {
      switch (sortField) {
        case "priority":
          return priorityWeight(b.priority) - priorityWeight(a.priority);
        case "deadline": {
          const aD = a.deadline ? new Date(a.deadline).getTime() : Infinity;
          const bD = b.deadline ? new Date(b.deadline).getTime() : Infinity;
          return aD - bD;
        }
        case "value":
          return (b.dollarValue || 0) - (a.dollarValue || 0);
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        default:
          return 0;
      }
    });

    return items;
  }, [displayApprovals, selectedTab, filterType, filterPriority, searchQuery, sortField]);

  const pendingCount = displayApprovals.filter((a) => a.status === "pending").length;

  return (
    <div className="page-list flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto" data-testid="page-approvals">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-heading tracking-tight" data-testid="text-approvals-title">Approval Center</h1>
          <p className="text-muted-foreground">Review and act on HERBIE's recommendations</p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-pending">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">
              {stats?.pending ?? pendingCount}
            </div>
            <p className="text-xs text-muted-foreground">Awaiting your decision</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-urgent">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-urgent-count">
              {stats?.urgent ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Need immediate action</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-approved">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
            <div className="h-10 w-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-approved-count">
              {stats?.approvedToday ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Actions executed</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-denied">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Denied Today</CardTitle>
            <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-denied-count">
              {stats?.deniedToday ?? 0}
            </div>
            <p className="text-xs text-muted-foreground">Actions blocked</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search approvals..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-approvals"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[160px]" data-testid="select-filter-type">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {entityTypes.map((t) => (
                <SelectItem key={t} value={t}>{getEntityLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[140px]" data-testid="select-filter-priority">
              <SelectValue placeholder="All Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-sort-approvals">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortField("priority")} data-testid="sort-priority">
                Priority {sortField === "priority" && <CheckCircle2 className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortField("deadline")} data-testid="sort-deadline">
                Deadline {sortField === "deadline" && <CheckCircle2 className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortField("value")} data-testid="sort-value">
                Dollar Value {sortField === "value" && <CheckCircle2 className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortField("created")} data-testid="sort-created">
                Newest First {sortField === "created" && <CheckCircle2 className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList>
            <TabsTrigger value="pending" data-testid="tab-pending">
              Pending ({pendingCount})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">Approved</TabsTrigger>
            <TabsTrigger value="denied" data-testid="tab-denied">Denied</TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
          </TabsList>

          <TabsContent value={selectedTab} className="mt-4">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            ) : filteredAndSorted.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium">
                    {searchQuery || filterType !== "all" || filterPriority !== "all"
                      ? "No matching approvals"
                      : "All caught up"}
                  </h3>
                  <p className="text-muted-foreground text-center max-w-sm mt-1">
                    {searchQuery || filterType !== "all" || filterPriority !== "all"
                      ? "Try adjusting your filters or search terms."
                      : "HERBIE will notify you when new actions require your approval."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredAndSorted.map((approval) => (
                  <ApprovalCardDocument
                    key={approval.id}
                    approval={approval}
                    expandedId={expandedId}
                    setExpandedId={setExpandedId}
                    notes={notes}
                    setNotes={setNotes}
                    approveMutation={approveMutation}
                    denyMutation={denyMutation}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
