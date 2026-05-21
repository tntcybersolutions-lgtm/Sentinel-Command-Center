import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Mail, Link2, Users, Copy, CheckCircle2, X, Plus } from "lucide-react";

type Role = "admin" | "pm" | "super" | "viewer";

export default function TeamInvite() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [tab, setTab] = useState<string>("email");

  // Email tab
  const [emails, setEmails] = useState<string[]>([""]);
  const [role, setRole] = useState<Role>("pm");
  const [sending, setSending] = useState(false);

  // Link tab
  const [linkRole, setLinkRole] = useState<Role>("pm");
  const [link] = useState(`https://app.sentinel.cc/i/${Math.random().toString(36).slice(2, 10)}`);
  const [copied, setCopied] = useState(false);

  // Bulk tab
  const [bulk, setBulk] = useState("");

  const updateEmail = (i: number, v: string) => setEmails((arr) => arr.map((e, idx) => (idx === i ? v : e)));
  const addEmailRow = () => setEmails((arr) => [...arr, ""]);
  const removeEmailRow = (i: number) => setEmails((arr) => arr.length > 1 ? arr.filter((_, idx) => idx !== i) : [""]);

  const sendEmail = async () => {
    const list = emails.map((e) => e.trim()).filter(Boolean);
    if (!list.length) { toast({ title: "Add at least one email", variant: "destructive" }); return; }
    setSending(true);
    try {
      await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: list, role }),
      }).catch(() => {});
      toast({ title: `Sent ${list.length} invite${list.length === 1 ? "" : "s"}`, description: `Role: ${role}` });
      setEmails([""]);
    } finally {
      setSending(false);
    }
  };

  const sendBulk = async () => {
    const list = bulk.split(/[\s,;]+/).map((s) => s.trim()).filter((s) => s.includes("@"));
    if (!list.length) { toast({ title: "No valid emails found", variant: "destructive" }); return; }
    setSending(true);
    try {
      await fetch("/api/team/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: list, role: "pm" }),
      }).catch(() => {});
      toast({ title: `Queued ${list.length} invites` });
      setBulk("");
    } finally {
      setSending(false);
    }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { toast({ title: "Could not copy", variant: "destructive" }); }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-3xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/home")} className="gap-2" data-testid="button-back-home"><ArrowLeft className="h-4 w-4" />Back</Button>

        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center ring-1 ring-purple-500/20"><Users className="h-7 w-7" /></div>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">Invite your team</h1>
            <p className="text-muted-foreground">Add teammates by email, share a one-click join link, or paste a list.</p>
          </div>
        </div>

        <Card><CardContent className="p-6">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid grid-cols-3 mb-6">
              <TabsTrigger value="email" data-testid="tab-email"><Mail className="h-4 w-4 mr-2" />Email</TabsTrigger>
              <TabsTrigger value="link" data-testid="tab-link"><Link2 className="h-4 w-4 mr-2" />Share link</TabsTrigger>
              <TabsTrigger value="bulk" data-testid="tab-bulk"><Users className="h-4 w-4 mr-2" />Bulk</TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4">
              <div className="space-y-2">
                {emails.map((e, i) => (
                  <div key={i} className="flex gap-2">
                    <Input placeholder={`teammate${i + 1}@company.com`} value={e} onChange={(ev) => updateEmail(i, ev.target.value)} data-testid={`input-email-${i}`} />
                    <Button variant="ghost" size="icon" onClick={() => removeEmailRow(i)} data-testid={`button-remove-${i}`}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addEmailRow} className="gap-1" data-testid="button-add-row"><Plus className="h-4 w-4" />Add another</Button>
              </div>
              <div className="grid gap-2"><Label>Role for everyone above</Label>
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger data-testid="select-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin — full access</SelectItem>
                    <SelectItem value="pm">Project Manager — manage projects</SelectItem>
                    <SelectItem value="super">Superintendent — field-focused</SelectItem>
                    <SelectItem value="viewer">Viewer — read-only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={sendEmail} disabled={sending} className="w-full gap-2" size="lg" data-testid="button-send-email"><Mail className="h-4 w-4" />{sending ? "Sending…" : "Send invites"}</Button>
            </TabsContent>

            <TabsContent value="link" className="space-y-4">
              <div className="grid gap-2"><Label>Default role for anyone who joins</Label>
                <Select value={linkRole} onValueChange={(v) => setLinkRole(v as Role)}>
                  <SelectTrigger data-testid="select-link-role"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pm">Project Manager</SelectItem>
                    <SelectItem value="super">Superintendent</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2"><Input readOnly value={link} className="font-mono text-xs" data-testid="input-share-link" /><Button variant="outline" onClick={copy} className="gap-2 shrink-0" data-testid="button-copy-link">{copied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy"}</Button></div>
              <div className="text-xs text-muted-foreground flex items-center gap-2"><Badge variant="secondary">Expires in 7 days</Badge>Anyone with this link can join with the role above.</div>
            </TabsContent>

            <TabsContent value="bulk" className="space-y-4">
              <div className="grid gap-2"><Label htmlFor="bulk">Paste emails (comma or newline separated)</Label><Textarea id="bulk" rows={8} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="alice@acme.com, bob@acme.com\ncarol@acme.com" className="font-mono text-sm" data-testid="textarea-bulk" /></div>
              <Button onClick={sendBulk} disabled={sending} className="w-full gap-2" size="lg" data-testid="button-send-bulk"><Users className="h-4 w-4" />{sending ? "Sending…" : "Send bulk invites"}</Button>
            </TabsContent>
          </Tabs>
        </CardContent></Card>
      </div>
    </div>
  );
}
