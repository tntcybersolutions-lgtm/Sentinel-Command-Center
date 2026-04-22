import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Crosshair,
  Plus,
  Trophy,
  MapPin,
  Calendar,
  DollarSign,
  Building2,
  Hash,
  TrendingUp,
  ArrowRight,
  X,
} from "lucide-react";

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return "\u2014";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "\u2014";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface CompetitorListItem {
  id: string;
  name: string;
  headquartersState: string | null;
  cageCode: string | null;
  dunsNumber: string | null;
  website: string | null;
  notes: string | null;
  naicsCodes: string[] | null;
  setAsideTypes: string[] | null;
  primaryAgencies: string[] | null;
  awards12m: number;
  awards24m: number;
  totalAwards: number;
  totalValue: number;
  value12m: number;
  topAgencies: { name: string; count: number }[];
  topNaics: { code: string; count: number }[];
  valueBand: { low: number; high: number } | null;
  lastAwardDate: string | null;
}

interface AwardItem {
  id: string;
  agency: string;
  naicsCode: string | null;
  setAside: string | null;
  awardValue: number | null;
  awardedAt: string | null;
  placeOfPerformance: string | null;
  description: string | null;
  contractNumber: string | null;
}

interface CompetitorProfile {
  competitor: CompetitorListItem;
  awards: AwardItem[];
  analytics: {
    totalAwards: number;
    awards12m: number;
    totalValue: number;
    value12m: number;
    valueBand: { low: number; high: number } | null;
    topAgencies: { name: string; count: number }[];
    topNaics: { code: string; count: number }[];
    topSetAsides: { type: string; count: number }[];
    topStates: { state: string; count: number }[];
  };
}

export default function Competitors() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formCageCode, setFormCageCode] = useState("");
  const [formHqState, setFormHqState] = useState("");
  const [formWebsite, setFormWebsite] = useState("");
  const [formNotes, setFormNotes] = useState("");

  const { data: competitors, isLoading } = useQuery<CompetitorListItem[]>({
    queryKey: ["/api/competitors"],
  });

  const { data: profile, isLoading: profileLoading } = useQuery<CompetitorProfile>({
    queryKey: ["/api/competitors", selectedId],
    enabled: !!selectedId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/competitors", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitors"] });
      setAddOpen(false);
      setFormName("");
      setFormCageCode("");
      setFormHqState("");
      setFormWebsite("");
      setFormNotes("");
      toast({ title: "Competitor added" });
    },
    onError: () => {
      toast({ title: "Failed to add competitor", variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formName.trim()) return;
    createMutation.mutate({
      name: formName.trim(),
      cageCode: formCageCode.trim() || undefined,
      headquartersState: formHqState.trim() || undefined,
      website: formWebsite.trim() || undefined,
      notes: formNotes.trim() || undefined,
    });
  }

  return (
    <div className="h-full overflow-auto p-6 space-y-6" data-testid="page-competitors">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Crosshair className="h-6 w-6 text-muted-foreground" />
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Competitive Intelligence</h1>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-competitor">
              <Plus className="h-4 w-4 mr-2" />
              Add Competitor
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-add-competitor">
            <DialogHeader>
              <DialogTitle>Add Competitor</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="comp-name">Company Name</Label>
                <Input
                  id="comp-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Patriot Defense Solutions"
                  data-testid="input-competitor-name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="comp-cage">CAGE Code</Label>
                  <Input
                    id="comp-cage"
                    value={formCageCode}
                    onChange={(e) => setFormCageCode(e.target.value)}
                    placeholder="e.g. 5ABC1"
                    data-testid="input-competitor-cage"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comp-state">HQ State</Label>
                  <Input
                    id="comp-state"
                    value={formHqState}
                    onChange={(e) => setFormHqState(e.target.value)}
                    placeholder="e.g. VA"
                    data-testid="input-competitor-state"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="comp-website">Website</Label>
                <Input
                  id="comp-website"
                  value={formWebsite}
                  onChange={(e) => setFormWebsite(e.target.value)}
                  placeholder="https://..."
                  data-testid="input-competitor-website"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comp-notes">Notes</Label>
                <Textarea
                  id="comp-notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Key intel about this competitor..."
                  className="resize-none"
                  data-testid="input-competitor-notes"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setAddOpen(false)} data-testid="button-cancel-add">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || !formName.trim()} data-testid="button-submit-competitor">
                  {createMutation.isPending ? "Adding\u2026" : "Add Competitor"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : competitors && competitors.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {competitors.map((c) => (
            <Card
              key={c.id}
              className="cursor-pointer hover-elevate"
              onClick={() => setLocation(`/entity/competitor/${c.id}`)}
              data-testid={`card-competitor-${c.id}`}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2 pb-3">
                <CardTitle className="text-base leading-tight" data-testid={`text-competitor-name-${c.id}`}>
                  {c.name}
                </CardTitle>
                {c.headquartersState && (
                  <Badge variant="secondary" data-testid={`badge-state-${c.id}`}>
                    <MapPin className="h-3 w-3 mr-1" />
                    {c.headquartersState}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 text-muted-foreground" />
                    <span data-testid={`text-awards-count-${c.id}`}>
                      {c.awards12m} / {c.awards24m}
                    </span>
                    <span className="text-muted-foreground text-xs">12m / 24m</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-sm">
                  <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Typical band:</span>
                  <span className="font-medium" data-testid={`text-value-band-${c.id}`}>
                    {c.valueBand
                      ? `${formatCurrency(c.valueBand.low)} \u2013 ${formatCurrency(c.valueBand.high)}`
                      : "\u2014"}
                  </span>
                </div>

                {c.topAgencies.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {c.topAgencies.slice(0, 3).map((a) => (
                      <Badge key={a.name} variant="outline" className="text-xs" data-testid={`badge-agency-${c.id}-${a.name}`}>
                        {a.name}
                      </Badge>
                    ))}
                  </div>
                )}

                {c.topNaics.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {c.topNaics.slice(0, 3).map((n) => (
                      <Badge key={n.code} variant="outline" className="text-xs" data-testid={`badge-naics-${c.id}-${n.code}`}>
                        {n.code}
                      </Badge>
                    ))}
                  </div>
                )}

                {c.setAsideTypes && c.setAsideTypes.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <TrendingUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {c.setAsideTypes.map((sa) => (
                      <Badge key={sa} variant="secondary" className="text-xs" data-testid={`badge-setaside-${c.id}-${sa}`}>
                        {sa}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-1.5 text-sm text-muted-foreground pt-1 border-t">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Last award:</span>
                  <span className="text-foreground" data-testid={`text-last-award-${c.id}`}>
                    {formatDate(c.lastAwardDate)}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Crosshair className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-lg font-medium mb-1">No competitors tracked yet</p>
            <p className="text-sm text-muted-foreground mb-4">Add competitors to start building your intelligence map.</p>
            <Button onClick={() => setAddOpen(true)} data-testid="button-add-first-competitor">
              <Plus className="h-4 w-4 mr-2" />
              Add Competitor
            </Button>
          </CardContent>
        </Card>
      )}

      <Sheet open={!!selectedId} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <SheetContent className="sm:max-w-2xl overflow-auto" data-testid="sheet-competitor-detail">
          {profileLoading ? (
            <div className="space-y-4 pt-6">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : profile ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-xl" data-testid="text-profile-name">
                  {profile.competitor.name}
                </SheetTitle>
              </SheetHeader>

              <div className="space-y-6 mt-6">
                <div className="grid grid-cols-2 gap-4">
                  <StatCard
                    label="Total Awards"
                    value={String(profile.analytics.totalAwards)}
                    testId="text-profile-total-awards"
                  />
                  <StatCard
                    label="Awards (12m)"
                    value={String(profile.analytics.awards12m)}
                    testId="text-profile-awards-12m"
                  />
                  <StatCard
                    label="Total Value"
                    value={formatCurrency(profile.analytics.totalValue)}
                    testId="text-profile-total-value"
                  />
                  <StatCard
                    label="Value (12m)"
                    value={formatCurrency(profile.analytics.value12m)}
                    testId="text-profile-value-12m"
                  />
                </div>

                {profile.analytics.valueBand && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Typical value band: </span>
                    <span className="font-medium" data-testid="text-profile-value-band">
                      {formatCurrency(profile.analytics.valueBand.low)} \u2013 {formatCurrency(profile.analytics.valueBand.high)}
                    </span>
                  </div>
                )}

                {profile.analytics.topAgencies.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-muted-foreground">Top Agencies</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.analytics.topAgencies.map((a) => (
                        <Badge key={a.name} variant="outline" data-testid={`badge-profile-agency-${a.name}`}>
                          {a.name} ({a.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {profile.analytics.topNaics.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-muted-foreground">Top NAICS Codes</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.analytics.topNaics.map((n) => (
                        <Badge key={n.code} variant="outline" data-testid={`badge-profile-naics-${n.code}`}>
                          {n.code} ({n.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {profile.analytics.topSetAsides.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-muted-foreground">Set-Aside Types</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.analytics.topSetAsides.map((s) => (
                        <Badge key={s.type} variant="secondary" data-testid={`badge-profile-setaside-${s.type}`}>
                          {s.type} ({s.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {profile.analytics.topStates.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-sm font-medium text-muted-foreground">Performance Locations</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.analytics.topStates.map((s) => (
                        <Badge key={s.state} variant="outline" data-testid={`badge-profile-state-${s.state}`}>
                          {s.state} ({s.count})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-medium">Award History</p>
                  <div className="border rounded-md overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Agency</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Set-Aside</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead className="min-w-[200px]">Description</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.awards.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                              No awards recorded
                            </TableCell>
                          </TableRow>
                        ) : (
                          profile.awards.map((a) => (
                            <TableRow key={a.id} data-testid={`row-award-${a.id}`}>
                              <TableCell className="whitespace-nowrap" data-testid={`text-award-date-${a.id}`}>
                                {formatDate(a.awardedAt)}
                              </TableCell>
                              <TableCell data-testid={`text-award-agency-${a.id}`}>
                                {a.agency}
                              </TableCell>
                              <TableCell className="whitespace-nowrap" data-testid={`text-award-value-${a.id}`}>
                                {formatCurrency(a.awardValue)}
                              </TableCell>
                              <TableCell data-testid={`text-award-setaside-${a.id}`}>
                                {a.setAside || "\u2014"}
                              </TableCell>
                              <TableCell data-testid={`text-award-location-${a.id}`}>
                                {a.placeOfPerformance || "\u2014"}
                              </TableCell>
                              <TableCell className="text-sm" data-testid={`text-award-desc-${a.id}`}>
                                {a.description || "\u2014"}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function StatCard({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="bg-muted/50 rounded-md p-3 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold" data-testid={testId}>{value}</p>
    </div>
  );
}
