import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Shield,
  CheckCircle,
  FileText,
  AlertTriangle,
  Plus,
  RefreshCw,
  Search,
  MoreHorizontal,
  Eye,
  Edit,
  Clock,
  AlertCircle,
  ShieldCheck,
  ShieldAlert,
  TrendingUp,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ComplianceStats {
  complianceScore: number;
  controlsImplemented: number;
  totalControls: number;
  evidenceItems: number;
  securityIncidentsMTD: number;
}

interface ComplianceFramework {
  id: string;
  frameworkCode: string;
  name: string;
  version: string | null;
  description: string | null;
  status: string;
  progress: number;
  controlsTotal: number;
  controlsCompliant: number;
}

interface ComplianceControl {
  id: string;
  controlCode: string;
  title: string;
  category: string | null;
  priority: string;
  implementationStatus: string;
  responsibleParty: string | null;
  lastAssessedAt: string | null;
  frameworkName: string;
}

interface ComplianceEvidenceItem {
  id: string;
  title: string;
  controlCode: string;
  evidenceType: string;
  collectedAt: string;
  status: string;
  expiresAt: string | null;
}

interface SecurityPostureMetric {
  id: string;
  category: string;
  metric: string;
  currentValue: string;
  targetValue: string;
  status: string;
}

interface SecurityIncident {
  id: string;
  incidentNumber: string;
  title: string;
  incidentType: string;
  severity: string;
  status: string;
  detectedAt: string;
  assignedTo: string | null;
}

export default function Compliance() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("frameworks");
  const { toast } = useToast();

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<ComplianceStats>({
    queryKey: ["/api/compliance/stats"],
  });

  const { data: frameworks, isLoading: frameworksLoading, refetch: refetchFrameworks } = useQuery<ComplianceFramework[]>({
    queryKey: ["/api/compliance/frameworks"],
  });

  const { data: controls, isLoading: controlsLoading } = useQuery<ComplianceControl[]>({
    queryKey: ["/api/compliance/controls"],
  });

  const handleRefresh = () => {
    refetchStats();
    refetchFrameworks();
    toast({
      title: "Compliance Refreshed",
      description: "Compliance data has been updated.",
    });
  };

  const handleAddEvidence = () => {
    toast({
      title: "Add Evidence",
      description: "Opening evidence upload form...",
    });
  };

  const handleUpdateControl = () => {
    toast({
      title: "Update Control",
      description: "Opening control update form...",
    });
  };

  const handleReportIncident = () => {
    toast({
      title: "Report Incident",
      description: "Opening incident report form...",
    });
  };

  const { data: evidence, isLoading: evidenceLoading } = useQuery<ComplianceEvidenceItem[]>({
    queryKey: ["/api/compliance/evidence"],
  });

  const { data: securityPosture, isLoading: postureLoading } = useQuery<SecurityPostureMetric[]>({
    queryKey: ["/api/compliance/security-posture"],
  });

  const { data: incidents, isLoading: incidentsLoading } = useQuery<SecurityIncident[]>({
    queryKey: ["/api/compliance/incidents"],
  });

  const displayStats = stats || { complianceScore: 0, controlsImplemented: 0, totalControls: 0, evidenceItems: 0, securityIncidentsMTD: 0 };
  const displayFrameworks = frameworks || [];
  const displayControls = controls || [];
  const displayEvidence = evidence || [];
  const displaySecurityPosture = securityPosture || [];
  const displayIncidents = incidents || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "implemented":
      case "compliant":
      case "valid":
      case "resolved":
        return <Badge variant="default" className="bg-green-600 hover:bg-green-600">{status.replace("_", " ")}</Badge>;
      case "partial":
      case "at_risk":
      case "expiring_soon":
      case "investigating":
        return <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-600 text-white">{status.replace("_", " ")}</Badge>;
      case "not_implemented":
      case "non_compliant":
      case "expired":
      case "open":
        return <Badge variant="destructive">{status.replace("_", " ")}</Badge>;
      default:
        return <Badge variant="outline">{status.replace("_", " ")}</Badge>;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
      case "high":
        return <Badge variant="destructive" className="bg-orange-600 hover:bg-orange-600">High</Badge>;
      case "medium":
        return <Badge variant="secondary" className="bg-yellow-600 hover:bg-yellow-600 text-white">Medium</Badge>;
      case "low":
        return <Badge variant="outline">Low</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high":
        return <Badge variant="destructive" className="text-xs">High</Badge>;
      case "medium":
        return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      case "low":
        return <Badge variant="outline" className="text-xs">Low</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{priority}</Badge>;
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 75) return "text-yellow-500";
    return "text-red-500";
  };

  const filteredControls = displayControls.filter(
    (control) =>
      control.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      control.controlCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      control.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredEvidence = displayEvidence.filter(
    (item) =>
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.controlCode.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto" data-testid="compliance-page">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Compliance & Security</h1>
          <p className="text-muted-foreground">Control Tower - Framework compliance and security posture management</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-compliance">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" data-testid="button-add-action">
                <Plus className="mr-2 h-4 w-4" />
                Add
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleAddEvidence} data-testid="action-add-evidence">
                <FileText className="mr-2 h-4 w-4" />
                Add Evidence
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleUpdateControl} data-testid="action-update-control">
                <Edit className="mr-2 h-4 w-4" />
                Update Control
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleReportIncident} data-testid="action-report-incident">
                <AlertTriangle className="mr-2 h-4 w-4" />
                Report Incident
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-compliance-score">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Compliance Score</CardTitle>
            <div className="h-10 w-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className={`text-2xl font-bold ${getScoreColor(displayStats.complianceScore)}`}>
                  {displayStats.complianceScore}%
                </div>
                <Progress value={displayStats.complianceScore} className="mt-2" />
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-controls-implemented">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Controls Implemented</CardTitle>
            <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">
                  {displayStats.controlsImplemented}/{displayStats.totalControls}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {displayStats.totalControls > 0 ? Math.round((displayStats.controlsImplemented / displayStats.totalControls) * 100) : 0}% complete
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-evidence-items">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Evidence Items</CardTitle>
            <div className="h-10 w-10 rounded-md bg-purple-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-purple-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.evidenceItems}</div>
                <p className="text-xs text-muted-foreground mt-1">Documents collected</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-security-incidents">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Security Incidents (MTD)</CardTitle>
            <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.securityIncidentsMTD}</div>
                <p className="text-xs text-muted-foreground mt-1">Month to date</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <TabsList data-testid="compliance-tabs">
            <TabsTrigger value="frameworks" data-testid="tab-frameworks">Frameworks</TabsTrigger>
            <TabsTrigger value="controls" data-testid="tab-controls">Controls</TabsTrigger>
            <TabsTrigger value="evidence" data-testid="tab-evidence">Evidence</TabsTrigger>
            <TabsTrigger value="security" data-testid="tab-security">Security</TabsTrigger>
          </TabsList>
          <div className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-compliance"
            />
          </div>
        </div>

        <TabsContent value="frameworks" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {frameworksLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-48 mt-2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-2 w-full mt-4" />
                  </CardContent>
                </Card>
              ))
            ) : (
              displayFrameworks.map((framework) => (
                <Card key={framework.id} data-testid={`framework-card-${framework.id}`} className="hover-elevate">
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-lg">{framework.name}</CardTitle>
                        {framework.version && (
                          <Badge variant="outline" className="text-xs">{framework.version}</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{framework.frameworkCode}</p>
                    </div>
                    <Badge variant={framework.status === "active" ? "default" : "secondary"}>
                      {framework.status}
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                      {framework.description}
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span>Compliance Progress</span>
                        <span className={getScoreColor(framework.progress)}>{framework.progress}%</span>
                      </div>
                      <Progress value={framework.progress} />
                      <div className="flex items-center justify-between text-xs text-muted-foreground mt-2">
                        <span>{framework.controlsCompliant} of {framework.controlsTotal} controls compliant</span>
                        <Button variant="ghost" size="sm" className="h-7 px-2" data-testid={`button-view-framework-${framework.id}`}>
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="controls" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Control Code</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Framework</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Responsible</TableHead>
                    <TableHead>Last Assessed</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {controlsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    filteredControls.map((control) => (
                      <TableRow key={control.id} data-testid={`control-row-${control.id}`}>
                        <TableCell className="font-mono text-sm">{control.controlCode}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{control.title}</p>
                            {control.category && (
                              <p className="text-xs text-muted-foreground">{control.category}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{control.frameworkName}</TableCell>
                        <TableCell>{getStatusBadge(control.implementationStatus)}</TableCell>
                        <TableCell>{getPriorityBadge(control.priority)}</TableCell>
                        <TableCell>
                          {control.responsibleParty && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">{control.responsibleParty}</span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {control.lastAssessedAt ? (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(control.lastAssessedAt).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Not assessed</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-control-actions-${control.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Edit className="mr-2 h-4 w-4" />
                                Update Status
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <FileText className="mr-2 h-4 w-4" />
                                Add Evidence
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Control</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Collected</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evidenceLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    filteredEvidence.map((item) => (
                      <TableRow key={item.id} data-testid={`evidence-row-${item.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">{item.title}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{item.controlCode}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {item.evidenceType.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(item.collectedAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell>
                          {item.expiresAt ? (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(item.expiresAt).toLocaleDateString()}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">No expiry</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-evidence-actions-${item.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" />
                                View Document
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Refresh Evidence
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Security Posture Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                {postureLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-5 w-20" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {displaySecurityPosture.map((metric) => (
                      <div
                        key={metric.id}
                        className="flex items-center justify-between py-2 border-b last:border-0"
                        data-testid={`posture-metric-${metric.id}`}
                      >
                        <div>
                          <p className="font-medium text-sm">{metric.metric}</p>
                          <p className="text-xs text-muted-foreground">{metric.category}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm font-medium">{metric.currentValue}</p>
                            <p className="text-xs text-muted-foreground">Target: {metric.targetValue}</p>
                          </div>
                          {metric.status === "compliant" ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : (
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5" />
                  Security Incidents
                </CardTitle>
                <Button variant="outline" size="sm" onClick={handleReportIncident} data-testid="button-report-incident">
                  <Plus className="mr-2 h-4 w-4" />
                  Report Incident
                </Button>
              </CardHeader>
              <CardContent>
                {incidentsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="p-4 border rounded-md">
                        <Skeleton className="h-4 w-32 mb-2" />
                        <Skeleton className="h-5 w-48" />
                      </div>
                    ))}
                  </div>
                ) : displayIncidents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ShieldCheck className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No security incidents this month</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {displayIncidents.map((incident) => (
                      <div
                        key={incident.id}
                        className="p-4 border rounded-md hover-elevate"
                        data-testid={`incident-card-${incident.id}`}
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm text-muted-foreground">
                                {incident.incidentNumber}
                              </span>
                              {getSeverityBadge(incident.severity)}
                              {getStatusBadge(incident.status)}
                            </div>
                            <p className="font-medium mt-1">{incident.title}</p>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span className="capitalize">{incident.incidentType.replace("_", " ")}</span>
                              <span>Detected: {new Date(incident.detectedAt).toLocaleDateString()}</span>
                              {incident.assignedTo && <span>Assigned: {incident.assignedTo}</span>}
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" data-testid={`button-view-incident-${incident.id}`}>
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
