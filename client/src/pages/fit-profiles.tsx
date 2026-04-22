import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Target,
  Plus,
  Settings2,
  Trash2,
  Save,
  X,
  Building2,
  FileText,
  Shield,
  Hash,
  Sliders,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface FitProfile {
  id: string;
  tenantId: string;
  name: string;
  isActive: boolean;
  minLeadDays: number | null;
  pursueThreshold: number | null;
  maybeThreshold: number | null;
  allowedStates: string[] | null;
  excludedKeywords: string[] | null;
  includedKeywords: string[] | null;
  includeNaics: string[] | null;
  excludeNaics: string[] | null;
  includePsc: string[] | null;
  excludePsc: string[] | null;
  preferredAgencies: string[] | null;
  excludedAgencies: string[] | null;
  setAsidePreferences: string[] | null;
  vehicleConstraints: string[] | null;
  scoringWeights: Record<string, number> | null;
  createdAt: string;
  updatedAt: string;
}

interface ProfileFormData {
  name: string;
  isActive: boolean;
  minLeadDays: number;
  pursueThreshold: number;
  maybeThreshold: number;
  includeNaics: string;
  excludeNaics: string;
  preferredAgencies: string;
  excludedAgencies: string;
  setAsidePreferences: string;
  includedKeywords: string;
  excludedKeywords: string;
  vehicleConstraints: string;
  weightNaics: number;
  weightSetAside: number;
  weightAgency: number;
  weightValue: number;
  weightDeadline: number;
  weightGeography: number;
  weightPastPerformance: number;
}

const DEFAULT_FORM: ProfileFormData = {
  name: "New Fit Profile",
  isActive: true,
  minLeadDays: 30,
  pursueThreshold: 85,
  maybeThreshold: 65,
  includeNaics: "",
  excludeNaics: "",
  preferredAgencies: "",
  excludedAgencies: "",
  setAsidePreferences: "",
  includedKeywords: "",
  excludedKeywords: "",
  vehicleConstraints: "",
  weightNaics: 25,
  weightSetAside: 20,
  weightAgency: 15,
  weightValue: 15,
  weightDeadline: 10,
  weightGeography: 10,
  weightPastPerformance: 5,
};

function profileToForm(p: FitProfile): ProfileFormData {
  const w = p.scoringWeights as Record<string, number> || {};
  return {
    name: p.name,
    isActive: p.isActive,
    minLeadDays: p.minLeadDays || 30,
    pursueThreshold: p.pursueThreshold || 85,
    maybeThreshold: p.maybeThreshold || 65,
    includeNaics: (p.includeNaics || []).join(", "),
    excludeNaics: (p.excludeNaics || []).join(", "),
    preferredAgencies: (p.preferredAgencies || []).join(", "),
    excludedAgencies: (p.excludedAgencies || []).join(", "),
    setAsidePreferences: (p.setAsidePreferences || []).join(", "),
    includedKeywords: (p.includedKeywords || []).join(", "),
    excludedKeywords: (p.excludedKeywords || []).join(", "),
    vehicleConstraints: (p.vehicleConstraints || []).join(", "),
    weightNaics: w.naics_match || 25,
    weightSetAside: w.set_aside || 20,
    weightAgency: w.agency || 15,
    weightValue: w.contract_value || 15,
    weightDeadline: w.deadline || 10,
    weightGeography: w.geography || 10,
    weightPastPerformance: w.past_performance || 5,
  };
}

function formToPayload(f: ProfileFormData) {
  const splitArr = (s: string) => s.split(",").map(x => x.trim()).filter(Boolean);
  return {
    tenantId: "blackhawk-default",
    name: f.name,
    isActive: f.isActive,
    minLeadDays: f.minLeadDays,
    pursueThreshold: f.pursueThreshold,
    maybeThreshold: f.maybeThreshold,
    includeNaics: splitArr(f.includeNaics),
    excludeNaics: splitArr(f.excludeNaics),
    preferredAgencies: splitArr(f.preferredAgencies),
    excludedAgencies: splitArr(f.excludedAgencies),
    setAsidePreferences: splitArr(f.setAsidePreferences),
    includedKeywords: splitArr(f.includedKeywords),
    excludedKeywords: splitArr(f.excludedKeywords),
    vehicleConstraints: splitArr(f.vehicleConstraints),
    scoringWeights: {
      naics_match: f.weightNaics,
      set_aside: f.weightSetAside,
      agency: f.weightAgency,
      contract_value: f.weightValue,
      deadline: f.weightDeadline,
      geography: f.weightGeography,
      past_performance: f.weightPastPerformance,
    },
  };
}

export default function FitProfiles() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormData>({ ...DEFAULT_FORM });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: profiles, isLoading } = useQuery<FitProfile[]>({
    queryKey: ["/api/v4/fit-profiles"],
    queryFn: async () => {
      const res = await fetch("/api/v4/fit-profiles");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/v4/fit-profiles", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v4/fit-profiles"] });
      toast({ title: "Created", description: "New fit profile created." });
      setDrawerOpen(false);
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await apiRequest("PUT", `/api/v4/fit-profiles/${id}`, payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/v4/fit-profiles"] });
      toast({ title: "Updated", description: "Fit profile saved." });
      setDrawerOpen(false);
    },
    onError: () => toast({ title: "Failed", variant: "destructive" }),
  });

  const openNew = () => {
    setEditingId(null);
    setForm({ ...DEFAULT_FORM });
    setDrawerOpen(true);
  };

  const openEdit = (p: FitProfile) => {
    setEditingId(p.id);
    setForm(profileToForm(p));
    setDrawerOpen(true);
  };

  const handleSave = () => {
    const payload = formToPayload(form);
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const updateField = (key: keyof ProfileFormData, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const totalWeight = form.weightNaics + form.weightSetAside + form.weightAgency + form.weightValue + form.weightDeadline + form.weightGeography + form.weightPastPerformance;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 md:px-6 py-4 space-y-4 border-b">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-page-title">Fit Profiles</h1>
            <p className="text-sm text-muted-foreground">
              Configure how HERBIE scores and routes opportunities
            </p>
          </div>
          <Button onClick={openNew} data-testid="button-new-profile">
            <Plus className="mr-2 h-4 w-4" />
            New Profile
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : !profiles || profiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Target className="h-12 w-12 mb-4 opacity-30" />
            <p className="text-lg font-medium mb-1">No Fit Profiles</p>
            <p className="text-sm mb-4">Create a profile to configure how opportunities are scored.</p>
            <Button onClick={openNew} data-testid="button-create-first">
              <Plus className="mr-2 h-4 w-4" />
              Create First Profile
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead className="min-w-[200px]">Profile Name</TableHead>
                <TableHead className="w-[80px]">Status</TableHead>
                <TableHead className="w-[100px]">Pursue</TableHead>
                <TableHead className="w-[100px]">Maybe</TableHead>
                <TableHead className="w-[100px]">Lead Days</TableHead>
                <TableHead className="w-[120px]">NAICS Codes</TableHead>
                <TableHead className="w-[120px]">Agencies</TableHead>
                <TableHead className="w-[100px]">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map(p => (
                <TableRow
                  key={p.id}
                  className="cursor-pointer hover-elevate"
                  onClick={() => openEdit(p)}
                  data-testid={`row-profile-${p.id}`}
                >
                  <TableCell className="pr-0">
                    <Target className="h-4 w-4 text-primary" />
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-sm" data-testid={`text-name-${p.id}`}>{p.name}</p>
                  </TableCell>
                  <TableCell>
                    {p.isActive ? (
                      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm tabular-nums">{p.pursueThreshold ?? 85}+</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm tabular-nums">{p.maybeThreshold ?? 65}+</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm tabular-nums">{p.minLeadDays ?? 30}d</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(p.includeNaics || []).slice(0, 2).map(c => (
                        <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                      {(p.includeNaics || []).length > 2 && (
                        <Badge variant="secondary" className="text-xs">+{(p.includeNaics!.length - 2)}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {(p.preferredAgencies || []).slice(0, 2).map(a => (
                        <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                      ))}
                      {(p.preferredAgencies || []).length > 2 && (
                        <Badge variant="outline" className="text-xs">+{(p.preferredAgencies!.length - 2)}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {new Date(p.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="drawer-profile-editor">
          <div className="space-y-6">
            <SheetHeader>
              <SheetTitle className="text-lg flex items-center gap-2" data-testid="text-drawer-title">
                <Settings2 className="h-5 w-5" />
                {editingId ? "Edit Profile" : "New Profile"}
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="profile-name">Profile Name</Label>
                <Input
                  id="profile-name"
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  data-testid="input-name"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="profile-active">Active</Label>
                <Switch
                  id="profile-active"
                  checked={form.isActive}
                  onCheckedChange={(v) => updateField("isActive", v)}
                  data-testid="switch-active"
                />
              </div>
            </div>

            <Separator />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  Thresholds
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Pursue</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.pursueThreshold}
                      onChange={(e) => updateField("pursueThreshold", parseInt(e.target.value) || 0)}
                      data-testid="input-pursue-threshold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Maybe</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={form.maybeThreshold}
                      onChange={(e) => updateField("maybeThreshold", parseInt(e.target.value) || 0)}
                      data-testid="input-maybe-threshold"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Lead Days</Label>
                    <Input
                      type="number"
                      min={0}
                      value={form.minLeadDays}
                      onChange={(e) => updateField("minLeadDays", parseInt(e.target.value) || 0)}
                      data-testid="input-min-lead-days"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  NAICS Codes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Include (comma-separated)</Label>
                  <Input
                    placeholder="236220, 236210, 237310"
                    value={form.includeNaics}
                    onChange={(e) => updateField("includeNaics", e.target.value)}
                    data-testid="input-include-naics"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Exclude (comma-separated)</Label>
                  <Input
                    placeholder="541330"
                    value={form.excludeNaics}
                    onChange={(e) => updateField("excludeNaics", e.target.value)}
                    data-testid="input-exclude-naics"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Agencies
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Preferred (comma-separated)</Label>
                  <Input
                    placeholder="USACE, VA, GSA"
                    value={form.preferredAgencies}
                    onChange={(e) => updateField("preferredAgencies", e.target.value)}
                    data-testid="input-preferred-agencies"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Excluded (comma-separated)</Label>
                  <Input
                    placeholder=""
                    value={form.excludedAgencies}
                    onChange={(e) => updateField("excludedAgencies", e.target.value)}
                    data-testid="input-excluded-agencies"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Set-Asides & Keywords
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">Set-Aside Preferences (comma-separated)</Label>
                  <Input
                    placeholder="SDVOSB, 8(a), HUBZone"
                    value={form.setAsidePreferences}
                    onChange={(e) => updateField("setAsidePreferences", e.target.value)}
                    data-testid="input-set-aside"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Include Keywords</Label>
                  <Input
                    placeholder="construction, renovation"
                    value={form.includedKeywords}
                    onChange={(e) => updateField("includedKeywords", e.target.value)}
                    data-testid="input-include-keywords"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Exclude Keywords</Label>
                  <Input
                    placeholder="IT services, consulting"
                    value={form.excludedKeywords}
                    onChange={(e) => updateField("excludedKeywords", e.target.value)}
                    data-testid="input-exclude-keywords"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Vehicle Constraints</Label>
                  <Input
                    placeholder="GSA Schedule, MATOC"
                    value={form.vehicleConstraints}
                    onChange={(e) => updateField("vehicleConstraints", e.target.value)}
                    data-testid="input-vehicle-constraints"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Sliders className="h-4 w-4" />
                  Scoring Weights
                  <Badge variant={totalWeight === 100 ? "secondary" : "destructive"} className="ml-auto text-xs">
                    Total: {totalWeight}/100
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: "weightNaics" as const, label: "NAICS Match" },
                    { key: "weightSetAside" as const, label: "Set-Aside" },
                    { key: "weightAgency" as const, label: "Agency" },
                    { key: "weightValue" as const, label: "Contract Value" },
                    { key: "weightDeadline" as const, label: "Deadline" },
                    { key: "weightGeography" as const, label: "Geography" },
                    { key: "weightPastPerformance" as const, label: "Past Performance" },
                  ]).map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs">{label}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        value={form[key]}
                        onChange={(e) => updateField(key, parseInt(e.target.value) || 0)}
                        data-testid={`input-${key}`}
                      />
                    </div>
                  ))}
                </div>
                {totalWeight !== 100 && (
                  <p className="text-xs text-destructive mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Weights should sum to 100 (currently {totalWeight})
                  </p>
                )}
              </CardContent>
            </Card>

            <Button
              className="w-full"
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending || !form.name.trim()}
              data-testid="button-save"
            >
              <Save className="mr-2 h-4 w-4" />
              {editingId ? "Save Changes" : "Create Profile"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
