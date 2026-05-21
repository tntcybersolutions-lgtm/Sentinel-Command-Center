import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Building2, CheckCircle2, ShieldCheck, Sparkles, FileText, Clock } from "lucide-react";

export default function ImportProcore() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [projectCount, setProjectCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/import/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "procore", email, company, projectCount }),
      }).catch(() => {});
      setDone(true);
      toast({ title: "You're on the list", description: "We'll reach out within 48 hours." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/home")} className="gap-2" data-testid="button-back-home"><ArrowLeft className="h-4 w-4" />Back</Button>

        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center ring-1 ring-orange-500/20"><Building2 className="h-7 w-7" /></div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1"><h1 className="text-2xl md:text-3xl font-bold">Import from Procore</h1><Badge variant="secondary">Beta</Badge></div>
            <p className="text-muted-foreground">Bring your projects, RFIs, submittals, drawings and daily logs over in one pass. We map the fields, you review.</p>
          </div>
        </div>

        {done ? (
          <Card><CardContent className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 mx-auto text-green-500" />
            <h2 className="text-xl font-semibold">You're on the early-access list</h2>
            <p className="text-sm text-muted-foreground">We'll contact <strong>{email}</strong> within 48 hours with next steps.</p>
            <div className="flex gap-2 justify-center pt-2">
              <Button variant="outline" onClick={() => setLocation("/import/csv")} data-testid="button-try-csv">Try CSV import instead</Button>
              <Button onClick={() => setLocation("/home")} data-testid="button-back-home-done">Back to home</Button>
            </div>
          </CardContent></Card>
        ) : (
          <Card>
            <CardContent className="p-6 md:p-8 space-y-5">
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-2"><Label htmlFor="email">Work email *</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" data-testid="input-procore-email" /></div>
                <div className="grid gap-2"><Label htmlFor="company">Company</Label><Input id="company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Acme Construction" data-testid="input-procore-company" /></div>
                <div className="grid gap-2"><Label htmlFor="count">Active projects in Procore</Label><Input id="count" type="number" min="0" value={projectCount} onChange={(e) => setProjectCount(e.target.value)} placeholder="12" data-testid="input-procore-count" /></div>
                <Button type="submit" disabled={submitting || !email.trim()} className="w-full gap-2" size="lg" data-testid="button-procore-waitlist"><Sparkles className="h-4 w-4" />{submitting ? "Submitting…" : "Request early access"}</Button>
              </form>
            </CardContent>
          </Card>
        )}

        <div className="grid md:grid-cols-3 gap-4">
          <Feature icon={ShieldCheck} title="Read-only first" body="We only read from your Procore account during preview. Nothing is written back." />
          <Feature icon={FileText} title="Field mapping built-in" body="Cost codes, vendors, drawings and submittal logs map to Sentinel automatically." />
          <Feature icon={Clock} title="~30 min per project" body="A 10-project tenant typically completes a full import in under an afternoon." />
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, body }: { icon: React.ComponentType<{ className?: string }>; title: string; body: string }) {
  return (
    <Card>
      <CardContent className="p-5 space-y-2">
        <Icon className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
}
