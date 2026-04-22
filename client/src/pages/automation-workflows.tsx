import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Zap, CheckCircle2, Activity } from "lucide-react";
import { AutomationTab } from "@/components/automation-tab";

const ACTIVE_WORKFLOWS = [
  {
    name: "OpportunityWon",
    triggerEvent: "OpportunityWon",
    description: "Auto-creates Project + 8 kickoff tasks + entity links when an opportunity is marked as won.",
  },
  {
    name: "SolicitationParsed",
    triggerEvent: "SolicitationParsed",
    description: "Auto-generates Compliance Matrix rows from FAR clauses when a solicitation is parsed.",
  },
  {
    name: "TakeoffUpdated",
    triggerEvent: "TakeoffUpdated",
    description: "Auto-generates PO drafts from tagged takeoff lines when a takeoff estimate is updated.",
  },
  {
    name: "TakeoffDelta",
    triggerEvent: "TakeoffDelta",
    description: "Auto-drafts Change Orders with margin policy math (10% OH, 8% P, 5% Cont, 2% Bond) on takeoff delta.",
  },
];

interface AutofillRule {
  id: string;
  name: string;
  sourceEntityType: string;
  targetEntityType: string;
  ruleType: string;
  priority: number;
  isActive: boolean;
  requiresConfirmation: boolean;
}

export default function AutomationWorkflows() {
  const { data, isLoading } = useQuery<AutofillRule[]>({
    queryKey: ["/api/autofill/rules"],
  });

  const rules: AutofillRule[] = Array.isArray(data) ? data : [];

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">
          Automation & Workflows
        </h1>
        <p className="text-sm text-muted-foreground">Active workflows, autofill rules, and event history</p>
      </div>

      <div data-testid="section-workflows" className="space-y-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Registered Workflows
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ACTIVE_WORKFLOWS.map((wf) => (
            <Card key={wf.name} data-testid={`card-workflow-${wf.name}`}>
              <CardContent className="py-4 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{wf.name}</h3>
                  <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{wf.description}</p>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Zap className="h-3 w-3" />
                  Event: <span className="font-mono">{wf.triggerEvent}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div data-testid="section-autofill-rules" className="space-y-3">
        <h2 className="text-lg font-semibold">Autofill Rules</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading rules...</p>
        ) : (
          <Table data-testid="table-autofill-rules">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Confirmation</TableHead>
                <TableHead>Active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No autofill rules configured
                  </TableCell>
                </TableRow>
              ) : (
                rules.map((rule) => (
                  <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                    <TableCell className="font-medium text-sm">{rule.name}</TableCell>
                    <TableCell className="text-sm">{rule.sourceEntityType}</TableCell>
                    <TableCell className="text-sm">{rule.targetEntityType}</TableCell>
                    <TableCell>
                      <Badge variant={rule.ruleType === "deterministic" ? "default" : rule.ruleType === "rule_based" ? "secondary" : "outline"}>
                        {rule.ruleType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm tabular-nums">{rule.priority}</TableCell>
                    <TableCell>
                      {rule.requiresConfirmation ? (
                        <Badge variant="outline">Required</Badge>
                      ) : (
                        <Badge variant="secondary">Auto</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {rule.isActive ? (
                        <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Separator />

      <AutomationTab showGlobal={true} />
    </div>
  );
}
