import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, ArrowRight, CheckCircle2, Building2, Calendar, Users, FileText } from "lucide-react";

interface ProjectDraft {
  name: string;
  number: string;
  type: string;
  address: string;
  startDate: string;
  endDate: string;
  budget: string;
  pm: string;
  super: string;
  notes: string;
}

const EMPTY: ProjectDraft = {
  name: "", number: "", type: "commercial", address: "",
  startDate: "", endDate: "", budget: "", pm: "", super: "", notes: "",
};

const STEPS = [
  { title: "Project basics", icon: Building2 },
  { title: "Schedule & budget", icon: Calendar },
  { title: "Team", icon: Users },
  { title: "Review", icon: FileText },
];

export default function ProjectCreate() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProjectDraft>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  const update = (k: keyof ProjectDraft, v: string) => setDraft((d) => ({ ...d, [k]: v }));
  const pct = ((step + 1) / STEPS.length) * 100;

  const canNext = () => {
    if (step === 0) return draft.name.trim().length > 0;
    return true;
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name, number: draft.number, type: draft.type, address: draft.address,
          startDate: draft.startDate || null, endDate: draft.endDate || null,
          budget: draft.budget ? Number(draft.budget) : null,
          projectManager: draft.pm, superintendent: draft.super, notes: draft.notes,
        }),
      });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const data = await res.json().catch(() => ({}));
      toast({ title: "Project created", description: draft.name });
      setLocation(data?.id ? `/projects/${data.id}` : "/projects/active");
    } catch (e: any) {
      toast({ title: "Could not create project", description: e?.message ?? "Try again", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const Icon = STEPS[step].icon;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20 p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">New project</h1>
            <p className="text-sm text-muted-foreground mt-1">Step {step + 1} of {STEPS.length}: {STEPS[step].title}</p>
          </div>
          <Button variant="ghost" onClick={() => setLocation("/home")} data-testid="button-cancel-project">Cancel</Button>
        </div>

        <Progress value={pct} className="h-2" />

        <Card>
          <CardContent className="p-6 md:p-8 space-y-5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><Icon className="h-5 w-5" /></div>
              <h2 className="text-lg font-semibold">{STEPS[step].title}</h2>
            </div>

            {step === 0 && (
              <div className="grid gap-4">
                <div className="grid gap-2"><Label htmlFor="name">Project name *</Label><Input id="name" value={draft.name} onChange={(e) => update("name", e.target.value)} placeholder="e.g. Phoenix Tower — Phase 2" data-testid="input-project-name" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2"><Label htmlFor="number">Project number</Label><Input id="number" value={draft.number} onChange={(e) => update("number", e.target.value)} placeholder="2026-001" data-testid="input-project-number" /></div>
                  <div className="grid gap-2"><Label htmlFor="type">Type</Label>
                    <Select value={draft.type} onValueChange={(v) => update("type", v)}>
                      <SelectTrigger id="type" data-testid="select-project-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="commercial">Commercial</SelectItem>
                        <SelectItem value="residential">Residential</SelectItem>
                        <SelectItem value="industrial">Industrial</SelectItem>
                        <SelectItem value="federal">Federal</SelectItem>
                        <SelectItem value="renovation">Renovation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid gap-2"><Label htmlFor="address">Site address</Label><Input id="address" value={draft.address} onChange={(e) => update("address", e.target.value)} placeholder="123 Main St, Phoenix AZ" data-testid="input-project-address" /></div>
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2"><Label htmlFor="start">Start date</Label><Input id="start" type="date" value={draft.startDate} onChange={(e) => update("startDate", e.target.value)} data-testid="input-project-start" /></div>
                  <div className="grid gap-2"><Label htmlFor="end">Substantial completion</Label><Input id="end" type="date" value={draft.endDate} onChange={(e) => update("endDate", e.target.value)} data-testid="input-project-end" /></div>
                </div>
                <div className="grid gap-2"><Label htmlFor="budget">Contract value</Label><Input id="budget" type="number" inputMode="decimal" value={draft.budget} onChange={(e) => update("budget", e.target.value)} placeholder="1500000" data-testid="input-project-budget" /></div>
              </div>
            )}

            {step === 2 && (
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2"><Label htmlFor="pm">Project Manager</Label><Input id="pm" value={draft.pm} onChange={(e) => update("pm", e.target.value)} placeholder="Email or name" data-testid="input-project-pm" /></div>
                  <div className="grid gap-2"><Label htmlFor="super">Superintendent</Label><Input id="super" value={draft.super} onChange={(e) => update("super", e.target.value)} placeholder="Email or name" data-testid="input-project-super" /></div>
                </div>
                <div className="grid gap-2"><Label htmlFor="notes">Internal notes</Label><Textarea id="notes" value={draft.notes} onChange={(e) => update("notes", e.target.value)} rows={4} placeholder="Anything the team should know up front…" data-testid="textarea-project-notes" /></div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-3 text-sm">
                <Row k="Name" v={draft.name || "—"} />
                <Row k="Number" v={draft.number || "—"} />
                <Row k="Type" v={draft.type} />
                <Row k="Address" v={draft.address || "—"} />
                <Row k="Schedule" v={(draft.startDate || "—") + " to " + (draft.endDate || "—")} />
                <Row k="Budget" v={draft.budget ? "$" + Number(draft.budget).toLocaleString() : "—"} />
                <Row k="PM" v={draft.pm || "—"} />
                <Row k="Super" v={draft.super || "—"} />
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t">
              <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className="gap-2" data-testid="button-prev-step"><ArrowLeft className="h-4 w-4" />Back</Button>
              {step < STEPS.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()} className="gap-2" data-testid="button-next-step">Next<ArrowRight className="h-4 w-4" /></Button>
              ) : (
                <Button onClick={submit} disabled={submitting || !draft.name.trim()} className="gap-2" data-testid="button-create-project"><CheckCircle2 className="h-4 w-4" />{submitting ? "Creating…" : "Create project"}</Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}
