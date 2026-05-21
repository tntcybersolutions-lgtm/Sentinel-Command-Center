import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Sparkles,
  FolderPlus,
  Upload,
  Users,
  Bot,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

interface Step {
  title: string;
  blurb: string;
  icon: React.ComponentType<{ className?: string }>;
  cta?: { label: string; to: string };
}

const STEPS: Step[] = [
  {
    title: "Welcome to Sentinel Command Center",
    blurb:
      "Your one home for projects, RFIs, submittals, money and Herbie—your AI co-pilot. Let's take a 60-second tour.",
    icon: Sparkles,
  },
  {
    title: "Create your first project",
    blurb:
      "Spin up a project in under a minute. Add the name, type, dates and team—Herbie pre-fills the rest.",
    icon: FolderPlus,
    cta: { label: "Create a project", to: "/projects/new" },
  },
  {
    title: "Bring your data in",
    blurb:
      "Import from Procore, Buildertrend, or a CSV. We map the columns for you and flag anything that looks off.",
    icon: Upload,
    cta: { label: "Import data", to: "/import/csv" },
  },
  {
    title: "Invite your team",
    blurb:
      "Add PMs, supers and subs by email or shareable link. Roles and project access are handled in one place.",
    icon: Users,
    cta: { label: "Invite team", to: "/team/invite" },
  },
  {
    title: "Meet Herbie",
    blurb:
      "Herbie reads your RFIs, drawings, daily logs and bills, then surfaces what needs you—so nothing slips.",
    icon: Bot,
    cta: { label: "Go to Home", to: "/home" },
  },
];

export default function Welcome() {
  const [, setLocation] = useLocation();
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const Icon = step.icon;
  const pct = ((i + 1) / STEPS.length) * 100;
  const last = i === STEPS.length - 1;

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4">
      <Card className="w-full max-w-2xl shadow-2xl border-primary/10">
        <CardContent className="p-8 md:p-12 space-y-8">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Step {i + 1} of {STEPS.length}
              </span>
              <span>{Math.round(pct)}%</span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>

          <div className="flex flex-col items-center text-center space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center ring-1 ring-primary/20">
              <Icon className="h-8 w-8" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {step.title}
            </h1>
            <p className="text-muted-foreground max-w-lg leading-relaxed">
              {step.blurb}
            </p>
          </div>

          {step.cta && (
            <div className="flex justify-center">
              <Button
                size="lg"
                onClick={() => setLocation(step.cta!.to)}
                data-testid="button-welcome-cta"
                className="gap-2"
              >
                {step.cta.label}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="ghost"
              onClick={() => setI((n) => Math.max(0, n - 1))}
              disabled={i === 0}
              className="gap-2"
              data-testid="button-welcome-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="flex gap-1">
              {STEPS.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 w-2 rounded-full transition-all ${
                    idx === i
                      ? "bg-primary w-6"
                      : idx < i
                      ? "bg-primary/60"
                      : "bg-muted"
                  }`}
                />
              ))}
            </div>
            {last ? (
              <Button
                onClick={() => setLocation("/home")}
                className="gap-2"
                data-testid="button-welcome-finish"
              >
                <CheckCircle2 className="h-4 w-4" />
                Finish
              </Button>
            ) : (
              <Button
                onClick={() => setI((n) => Math.min(STEPS.length - 1, n + 1))}
                className="gap-2"
                data-testid="button-welcome-next"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="text-center">
            <button
              onClick={() => setLocation("/home")}
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              data-testid="button-welcome-skip"
            >
              Skip the tour
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
