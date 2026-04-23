import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Settings,
  Building2,
  Users,
  Shield,
  Bell,
  Palette,
  Database,
  FileText,
  Sliders,
  Save,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SettingsPage() {
  const [companyName, setCompanyName] = useState("BlackHawk Construction, LLC");
  const [timezone, setTimezone] = useState("America/New_York");
  const [dailyDigestEnabled, setDailyDigestEnabled] = useState(true);
  const [digestTime, setDigestTime] = useState("06:00");
  const [autoScoreEnabled, setAutoScoreEnabled] = useState(true);
  const [scoreThreshold, setScoreThreshold] = useState("70");
  const { toast } = useToast();

  const { data: settings } = useQuery<Record<string, any>>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (settings) {
      if (settings.companyName) setCompanyName(settings.companyName);
      if (settings.timezone) setTimezone(settings.timezone);
      if (settings.dailyDigestEnabled !== undefined) setDailyDigestEnabled(settings.dailyDigestEnabled);
      if (settings.digestTime) setDigestTime(settings.digestTime);
      if (settings.autoScoreEnabled !== undefined) setAutoScoreEnabled(settings.autoScoreEnabled);
      if (settings.scoreThreshold) setScoreThreshold(settings.scoreThreshold);
    }
  }, [settings]);

  const saveSettingsMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      apiRequest("POST", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Settings Saved", description: "Your preferences have been saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    },
  });

  const handleSaveSettings = () => {
    saveSettingsMutation.mutate({
      companyName,
      timezone,
      dailyDigestEnabled,
      digestTime,
      autoScoreEnabled,
      scoreThreshold,
    });
  };

  const handleManageNaics = () => {
    toast({
      title: "Manage NAICS Codes",
      description: "Opening NAICS code management...",
    });
  };

  const handleManageCertifications = () => {
    toast({
      title: "Manage Certifications",
      description: "Opening certification management...",
    });
  };

  const handleEditApprover = () => {
    toast({
      title: "Edit Approver",
      description: "Opening approver configuration...",
    });
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Configure Sentinel Command Center preferences</p>
        </div>
        <Button onClick={handleSaveSettings} disabled={saveSettingsMutation.isPending} data-testid="button-save-settings">
          <Save className="mr-2 h-4 w-4" />
          {saveSettingsMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Tabs defaultValue="company" className="space-y-6">
        <TabsList className="flex-wrap h-auto gap-2">
          <TabsTrigger value="company" className="gap-2" data-testid="tab-company">
            <Building2 className="h-4 w-4" />
            Company
          </TabsTrigger>
          <TabsTrigger value="scoring" className="gap-2" data-testid="tab-scoring">
            <Sliders className="h-4 w-4" />
            Scoring
          </TabsTrigger>
          <TabsTrigger value="notifications" className="gap-2" data-testid="tab-notifications">
            <Bell className="h-4 w-4" />
            Notifications
          </TabsTrigger>
          <TabsTrigger value="approvals" className="gap-2" data-testid="tab-approvals">
            <Shield className="h-4 w-4" />
            Approvals
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2" data-testid="tab-templates">
            <FileText className="h-4 w-4" />
            Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Profile</CardTitle>
              <CardDescription>Basic information about BlackHawk Construction</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Legal Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    data-testid="input-company-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ein">EIN (Tax ID)</Label>
                  <Input
                    id="ein"
                    defaultValue="83-3638177"
                    data-testid="input-ein"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="dbaName">DBA Name</Label>
                  <Input id="dbaName" defaultValue="BlackHawk Construction" data-testid="input-dba-name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone" data-testid="select-timezone">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">Eastern Time (ET)</SelectItem>
                      <SelectItem value="America/Chicago">Central Time (CT)</SelectItem>
                      <SelectItem value="America/Denver">Mountain Time (MT)</SelectItem>
                      <SelectItem value="America/Los_Angeles">Pacific Time (PT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    defaultValue="https://blackhawkconst.com"
                    data-testid="input-website"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>NAICS Codes</CardTitle>
              <CardDescription>Primary business classification codes for bid matching</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge variant="secondary" className="text-sm">236220 - Commercial Building Construction</Badge>
                <Badge variant="secondary" className="text-sm">238220 - Plumbing, HVAC</Badge>
                <Badge variant="secondary" className="text-sm">237310 - Highway Construction</Badge>
                <Badge variant="secondary" className="text-sm">238210 - Electrical Contractors</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={handleManageNaics} data-testid="button-manage-naics">Manage NAICS Codes</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Certifications & Set-Asides</CardTitle>
              <CardDescription>Active certifications for preferential bidding</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">8(a) Certified</Badge>
                <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">HUBZone</Badge>
                <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">SDVOSB</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={handleManageCertifications} data-testid="button-manage-certs">Manage Certifications</Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scoring" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fit Scoring Configuration</CardTitle>
              <CardDescription>Configure how HERBIE scores opportunities</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Auto-Score New Opportunities</Label>
                  <p className="text-sm text-muted-foreground">
                    Automatically score opportunities when they are ingested
                  </p>
                </div>
                <Switch
                  checked={autoScoreEnabled}
                  onCheckedChange={setAutoScoreEnabled}
                  data-testid="switch-auto-score"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="scoreThreshold">High-Fit Threshold</Label>
                <div className="flex items-center gap-4">
                  <Input
                    id="scoreThreshold"
                    type="number"
                    className="w-24"
                    value={scoreThreshold}
                    onChange={(e) => setScoreThreshold(e.target.value)}
                    data-testid="input-score-threshold"
                  />
                  <span className="text-sm text-muted-foreground">
                    Opportunities scoring above this will be flagged as high-fit
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Scoring Weights</CardTitle>
              <CardDescription>Adjust the importance of different scoring factors</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "NAICS Match", value: 25 },
                { label: "Geographic Fit", value: 20 },
                { label: "Set-Aside Eligibility", value: 20 },
                { label: "Contract Size", value: 15 },
                { label: "Past Performance Match", value: 10 },
                { label: "Timeline Feasibility", value: 10 },
              ].map((weight) => (
                <div key={weight.label} className="flex items-center justify-between">
                  <Label>{weight.label}</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-20"
                      defaultValue={weight.value}
                      data-testid={`input-weight-${weight.label.toLowerCase().replace(/\s+/g, '-')}`}
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Daily Digest</CardTitle>
              <CardDescription>Configure your daily executive briefing</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Daily Digest</Label>
                  <p className="text-sm text-muted-foreground">
                    Receive a summary email every morning
                  </p>
                </div>
                <Switch
                  checked={dailyDigestEnabled}
                  onCheckedChange={setDailyDigestEnabled}
                  data-testid="switch-daily-digest"
                />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label htmlFor="digestTime">Delivery Time</Label>
                <Input
                  id="digestTime"
                  type="time"
                  className="w-32"
                  value={digestTime}
                  onChange={(e) => setDigestTime(e.target.value)}
                  data-testid="input-digest-time"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alert Settings</CardTitle>
              <CardDescription>Configure real-time notifications</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "New High-Fit Opportunities", enabled: true },
                { label: "Deadline Reminders (7 days)", enabled: true },
                { label: "Deadline Warnings (3 days)", enabled: true },
                { label: "Approval Requests", enabled: true },
                { label: "Amendment Alerts", enabled: true },
                { label: "Integration Errors", enabled: false },
              ].map((alert) => (
                <div key={alert.label} className="flex items-center justify-between">
                  <Label>{alert.label}</Label>
                  <Switch defaultChecked={alert.enabled} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="approvals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Approval Policies</CardTitle>
              <CardDescription>Configure approval requirements for HERBIE actions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { label: "Bid Decisions", description: "Starting a new bid project", required: true },
                { label: "Email Sends", description: "Sending emails to external contacts", required: true },
                { label: "Calendar Events", description: "Creating Outlook calendar events", required: false },
                { label: "Bid Submissions", description: "Submitting final bid packages", required: true },
                { label: "Document Generation", description: "Creating bid artifacts", required: false },
              ].map((policy) => (
                <div key={policy.label} className="flex items-center justify-between">
                  <div>
                    <Label>{policy.label}</Label>
                    <p className="text-sm text-muted-foreground">{policy.description}</p>
                  </div>
                  <Switch defaultChecked={policy.required} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Document Templates</CardTitle>
              <CardDescription>Manage templates for bid artifacts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  { name: "Cover Letter", version: "v1.2", lastUpdated: "Jan 15, 2026" },
                  { name: "Capability Statement", version: "v2.0", lastUpdated: "Jan 10, 2026" },
                  { name: "Proposal Template", version: "v1.5", lastUpdated: "Jan 20, 2026" },
                  { name: "Compliance Checklist", version: "v1.0", lastUpdated: "Dec 28, 2025" },
                ].map((template) => (
                  <div
                    key={template.name}
                    className="flex items-center justify-between p-4 rounded-lg border"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{template.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {template.version} - Updated {template.lastUpdated}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleEditApprover} data-testid={`button-edit-approver-${template.name.replace(/\s+/g, '-').toLowerCase()}`}>Edit</Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
