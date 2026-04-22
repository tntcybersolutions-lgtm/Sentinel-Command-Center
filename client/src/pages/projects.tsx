import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Filter,
  Plus,
  Building2,
  DollarSign,
  Clock,
  AlertTriangle,
  Calendar,
  User,
  ChevronDown,
  Eye,
  FileText,
  FileQuestion,
  Receipt,
  CreditCard,
  MoreHorizontal,
  TrendingUp,
  CheckCircle2,
  Pause,
  HardHat,
  FolderOpen,
  ChevronRight,
  MapPin,
  ClipboardList,
  ArrowRightLeft,
  Upload,
  Download,
  Share2,
  Gauge,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RowActionMenu } from "@/features/row-actions/RowActionMenu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface JacketFolder {
  id: string;
  name: string;
  path: string;
  sortOrder: number;
  documentCount: number | null;
}

interface TimelineEntry {
  id: string;
  eventType: string;
  eventTitle: string;
  eventDescription: string | null;
  createdAt: string;
}

interface Project {
  id: string;
  projectNumber: string;
  name: string;
  description: string | null;
  clientName: string;
  projectManagerName: string;
  status: "active" | "planning" | "completed" | "on_hold";
  contractType: string | null;
  contractValue: number | null;
  startDate: string | null;
  expectedEndDate: string | null;
  actualEndDate: string | null;
  completionPercentage: number;
  location: string | null;
  overdueMilestones: number;
}

interface ProjectStats {
  activeProjects: number;
  totalValue: number;
  onSchedule: number;
  overdueMilestones: number;
}

export default function Projects() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("active");
  const [sortBy, setSortBy] = useState("projectNumber");
  const { toast } = useToast();

  const handleNewProject = () => {
    toast({ title: "New Project", description: "Opening project creation form..." });
  };

  const handleFilters = () => {
    toast({ title: "Filter Projects", description: "Opening advanced filter options..." });
  };

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: stats, isLoading: statsLoading } = useQuery<ProjectStats>({
    queryKey: ["/api/projects/stats"],
  });

  const displayProjects = projects || [];
  const displayStats = stats || { activeProjects: 0, totalValue: 0, onSchedule: 0, overdueMilestones: 0 };

  const filteredProjects = displayProjects
    .filter((project) => {
      if (selectedTab === "all") return true;
      if (selectedTab === "active") return project.status === "active";
      if (selectedTab === "planning") return project.status === "planning";
      if (selectedTab === "completed") return project.status === "completed";
      if (selectedTab === "on_hold") return project.status === "on_hold";
      return true;
    })
    .filter((project) =>
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.projectNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.clientName.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === "projectNumber") return a.projectNumber.localeCompare(b.projectNumber);
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "value") return (b.contractValue || 0) - (a.contractValue || 0);
      if (sortBy === "completion") return b.completionPercentage - a.completionPercentage;
      return 0;
    });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><TrendingUp className="h-3 w-3" />Active</Badge>;
      case "planning":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1"><Clock className="h-3 w-3" />Planning</Badge>;
      case "completed":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-1"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
      case "on_hold":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 gap-1"><Pause className="h-3 w-3" />On Hold</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatCurrency = (value: number | null) => {
    if (!value) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getCompletionColor = (percentage: number) => {
    if (percentage >= 75) return "bg-green-500";
    if (percentage >= 50) return "bg-blue-500";
    if (percentage >= 25) return "bg-yellow-500";
    return "bg-muted-foreground";
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title-projects">Projects & Field Operations</h1>
          <p className="text-muted-foreground">Manage active projects, daily logs, and field documentation</p>
        </div>
        <Button onClick={handleNewProject} data-testid="button-new-project">
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-active-projects">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <HardHat className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-value-active-projects">{displayStats.activeProjects}</div>
                <p className="text-xs text-muted-foreground">Currently in progress</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-total-value">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="stat-value-total-value">
                  ${(displayStats.totalValue / 1000000).toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">Combined contract value</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-on-schedule">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Schedule</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-500" data-testid="stat-value-on-schedule">{displayStats.onSchedule}</div>
                <p className="text-xs text-muted-foreground">Projects on track</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-overdue-milestones">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Milestones</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-500" data-testid="stat-value-overdue-milestones">{displayStats.overdueMilestones}</div>
                <p className="text-xs text-muted-foreground">Require attention</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[280px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-projects"
          />
        </div>
        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-[160px]" data-testid="select-sort-by">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="projectNumber">Project Number</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="value">Contract Value</SelectItem>
            <SelectItem value="completion">Completion %</SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" onClick={handleFilters} data-testid="button-filters">
              <Filter className="mr-2 h-4 w-4" />
              Filters
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem data-testid="filter-all-clients">All Clients</DropdownMenuItem>
            <DropdownMenuItem data-testid="filter-gsa">GSA</DropdownMenuItem>
            <DropdownMenuItem data-testid="filter-dod">DoD</DropdownMenuItem>
            <DropdownMenuItem data-testid="filter-va">VA</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem data-testid="filter-all-managers">All Project Managers</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList data-testid="tabs-project-status">
          <TabsTrigger value="active" data-testid="tab-active">Active</TabsTrigger>
          <TabsTrigger value="planning" data-testid="tab-planning">Planning</TabsTrigger>
          <TabsTrigger value="completed" data-testid="tab-completed">Completed</TabsTrigger>
          <TabsTrigger value="on_hold" data-testid="tab-on-hold">On Hold</TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <Skeleton className="h-5 w-48" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredProjects.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Building2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium mb-2">No projects found</h3>
                <p className="text-muted-foreground">
                  {searchQuery ? "Try adjusting your search or filters" : "Create a new project to get started"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredProjects.map((project) => (
                <Card key={project.id} className="hover-elevate cursor-pointer" data-testid={`project-card-${project.id}`} onClick={() => setLocation(`/projects/${encodeURIComponent(String(project.id))}`)}>
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-start justify-between gap-4 flex-wrap">
                          <div>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="text-sm font-mono text-muted-foreground" data-testid={`project-number-${project.id}`}>
                                {project.projectNumber}
                              </span>
                              {getStatusBadge(project.status)}
                              {project.overdueMilestones > 0 && (
                                <Badge variant="destructive" className="gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  {project.overdueMilestones} Overdue
                                </Badge>
                              )}
                            </div>
                            <h3 className="text-lg font-semibold" data-testid={`project-name-${project.id}`}>
                              {project.name}
                            </h3>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div className="space-y-1">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              Client
                            </span>
                            <p className="font-medium" data-testid={`project-client-${project.id}`}>{project.clientName}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" />
                              Project Manager
                            </span>
                            <p className="font-medium" data-testid={`project-pm-${project.id}`}>{project.projectManagerName}</p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Timeline
                            </span>
                            <p className="font-medium" data-testid={`project-dates-${project.id}`}>
                              {formatDate(project.startDate)} - {formatDate(project.expectedEndDate)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              Contract Value
                            </span>
                            <p className="font-medium" data-testid={`project-value-${project.id}`}>
                              {formatCurrency(project.contractValue)}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Completion</span>
                            <span className="font-medium" data-testid={`project-completion-${project.id}`}>
                              {project.completionPercentage}%
                            </span>
                          </div>
                          <Progress 
                            value={project.completionPercentage} 
                            className="h-2"
                          />
                        </div>
                      </div>

                      <div className="flex flex-row lg:flex-col gap-2 flex-wrap">
                        <Button 
                          variant="default" 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); setLocation(`/projects/${encodeURIComponent(String(project.id))}/cockpit`); }}
                          data-testid={`button-cockpit-${project.id}`}
                        >
                          <Gauge className="mr-2 h-4 w-4" />
                          Cockpit
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={(e) => { e.stopPropagation(); setLocation(`/projects/${encodeURIComponent(String(project.id))}`); }}
                          data-testid={`button-view-details-${project.id}`}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Details
                        </Button>
                        <div onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" data-testid={`button-actions-${project.id}`}>
                                <MoreHorizontal className="mr-2 h-4 w-4" />
                                Actions
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem data-testid={`action-daily-log-${project.id}`}>
                                <FileText className="mr-2 h-4 w-4" />
                                Daily Log
                              </DropdownMenuItem>
                              <DropdownMenuItem data-testid={`action-rfis-${project.id}`}>
                                <FileQuestion className="mr-2 h-4 w-4" />
                                RFIs
                              </DropdownMenuItem>
                              <DropdownMenuItem data-testid={`action-change-orders-${project.id}`}>
                                <Receipt className="mr-2 h-4 w-4" />
                                Change Orders
                              </DropdownMenuItem>
                              <DropdownMenuItem data-testid={`action-pay-apps-${project.id}`}>
                                <CreditCard className="mr-2 h-4 w-4" />
                                Pay Apps
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        <div onClick={(e) => e.stopPropagation()}>
                          <RowActionMenu entityType="project" entity={project} listQueryKey={["/api/projects"]} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

    </div>
  );
}

function ProjectDetailDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project | null;
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  const { data: folders = [] } = useQuery<JacketFolder[]>({
    queryKey: ["/api/projects", project?.id, "folders"],
    enabled: !!project && activeTab === "folders",
  });

  const { data: timeline = [] } = useQuery<TimelineEntry[]>({
    queryKey: ["/api/projects", project?.id, "timeline"],
    enabled: !!project && activeTab === "timeline",
  });

  if (!project) return null;

  const formatCurrency = (value: number | null) => {
    if (!value) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500">Active</Badge>;
      case "planning":
        return <Badge className="bg-blue-500/10 text-blue-500">Planning</Badge>;
      case "completed":
        return <Badge className="bg-emerald-500/10 text-emerald-500">Completed</Badge>;
      case "on_hold":
        return <Badge className="bg-yellow-500/10 text-yellow-500">On Hold</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const projectFolderStructure = [
    { code: "01", name: "Converted Bid Documents", desc: "Original bid package and award docs" },
    { code: "02", name: "Contract & Agreements", desc: "Prime contract, mods, bonding" },
    { code: "03", name: "Change Orders", desc: "Contract changes and modifications" },
    { code: "04", name: "Purchase Orders", desc: "Material and equipment orders" },
    { code: "05", name: "Schedules", desc: "CPM schedule, updates, look-aheads" },
    { code: "06", name: "Invoices & Payments", desc: "Pay apps, invoices, lien waivers" },
    { code: "07", name: "Photos & Field Reports", desc: "Daily logs, progress photos" },
    { code: "08", name: "Compliance & Safety", desc: "Safety plans, OSHA, permits" },
    { code: "09", name: "Emails & Communication", desc: "Project correspondence" },
    { code: "10", name: "Closeout & Warranty", desc: "Final docs, O&M manuals, warranties" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-sm font-mono text-muted-foreground">
                  {project.projectNumber}
                </span>
                {getStatusBadge(project.status)}
              </div>
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <HardHat className="h-5 w-5 text-primary shrink-0" />
                {project.name}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  {project.clientName}
                </span>
                {project.location && (
                  <>
                    <span className="text-muted-foreground">|</span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      {project.location}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">|</span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  {formatCurrency(project.contractValue)}
                </span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4 shrink-0">
            <TabsList className="h-10 overflow-x-auto">
              <TabsTrigger value="overview" data-testid="tab-project-overview">Overview</TabsTrigger>
              <TabsTrigger value="folders" data-testid="tab-project-folders">
                Folders
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                  10
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="documents" data-testid="tab-project-documents">Documents</TabsTrigger>
              <TabsTrigger value="timeline" data-testid="tab-project-timeline">Timeline</TabsTrigger>
              <TabsTrigger value="financials" data-testid="tab-project-financials">Financials</TabsTrigger>
              <TabsTrigger value="team" data-testid="tab-project-team">Team</TabsTrigger>
              <TabsTrigger value="rfis" data-testid="tab-project-rfis">RFIs</TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-project-activity">Activity</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0 overflow-auto">
            <div className="px-6 py-4">
              <TabsContent value="overview" className="mt-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Completion</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{project.completionPercentage}%</div>
                      <Progress value={project.completionPercentage} className="mt-2 h-2" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Project Manager</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-medium">{project.projectManagerName}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Start Date</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-medium">{formatDate(project.startDate)}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">End Date</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-medium">{formatDate(project.expectedEndDate)}</div>
                    </CardContent>
                  </Card>
                </div>

                {project.description && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Project Description</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground">{project.description}</p>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Contract Details</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-sm text-muted-foreground">Contract Type</div>
                      <div className="font-medium">{project.contractType || "—"}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Contract Value</div>
                      <div className="font-medium">{formatCurrency(project.contractValue)}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Location</div>
                      <div className="font-medium">{project.location || "—"}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Overdue Milestones</div>
                      <div className={`font-medium ${project.overdueMilestones > 0 ? "text-red-500" : ""}`}>
                        {project.overdueMilestones}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="folders" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Project Jacket Folders</h3>
                    <p className="text-sm text-muted-foreground">
                      Standardized 10-folder structure for project documentation
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" data-testid="button-download-all">
                      <Download className="h-4 w-4 mr-2" />
                      Download All
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-upload-project-doc">
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3">
                  {folders.length > 0 ? folders.map((folder) => (
                    <Card key={folder.id} className="hover-elevate cursor-pointer" data-testid={`project-folder-${folder.id}`}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{folder.name.replace(/_/g, " ")}</div>
                          <div className="text-xs text-muted-foreground truncate">{folder.path}</div>
                        </div>
                        <Badge variant="outline">{folder.documentCount || 0} docs</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  )) : (
                    <>
                      {projectFolderStructure.map((f) => (
                        <Card key={f.code} className="hover-elevate cursor-pointer" data-testid={`project-folder-${f.code}`}>
                          <CardContent className="p-4 flex items-center gap-4">
                            <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{f.code}_{f.name.replace(/ /g, "_")}</div>
                              <div className="text-xs text-muted-foreground">{f.desc}</div>
                            </div>
                            <Badge variant="outline">0 docs</Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </CardContent>
                        </Card>
                      ))}
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Project Timeline</h3>
                    <p className="text-sm text-muted-foreground">
                      Activity log and project events
                    </p>
                  </div>
                </div>

                {timeline.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <Clock className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">No activity recorded yet</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {timeline.map((entry) => (
                      <div key={entry.id} className="flex gap-4">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Clock className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">{entry.eventTitle}</div>
                          {entry.eventDescription && (
                            <div className="text-sm text-muted-foreground">{entry.eventDescription}</div>
                          )}
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(entry.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="financials" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Project Financials</h3>
                    <p className="text-sm text-muted-foreground">
                      Budget tracking and payment status
                    </p>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Contract Value</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-500">
                        {formatCurrency(project.contractValue)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Billed to Date</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(project.contractValue ? Math.round(project.contractValue * project.completionPercentage / 100) : null)}
                      </div>
                      <p className="text-xs text-muted-foreground">{project.completionPercentage}% of contract</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Remaining</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(project.contractValue ? Math.round(project.contractValue * (100 - project.completionPercentage) / 100) : null)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent Transactions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-center text-muted-foreground py-6">
                      No transactions recorded yet
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="documents" className="mt-0 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">Project Documents</h3>
                  <Button variant="outline" size="sm" className="gap-2" data-testid="button-upload-project-doc">
                    <Upload className="h-3.5 w-3.5" />
                    Upload
                  </Button>
                </div>
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground" data-testid="project-docs-empty">
                  <FolderOpen className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No documents uploaded yet</p>
                  <p className="text-xs mt-1">Upload project documents to keep everything organized</p>
                </div>
              </TabsContent>

              <TabsContent value="team" className="mt-0 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">Project Team</h3>
                  <Button variant="outline" size="sm" className="gap-2" data-testid="button-add-team-member">
                    <Plus className="h-3.5 w-3.5" />
                    Add Member
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Project Manager</span>
                        </div>
                        <Badge variant="outline">Unassigned</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Superintendent</span>
                        </div>
                        <Badge variant="outline">Unassigned</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">Estimator</span>
                        </div>
                        <Badge variant="outline">Unassigned</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="rfis" className="mt-0 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold">Requests for Information</h3>
                  <Button variant="outline" size="sm" className="gap-2" data-testid="button-create-rfi">
                    <Plus className="h-3.5 w-3.5" />
                    New RFI
                  </Button>
                </div>
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground" data-testid="project-rfis-empty">
                  <FileQuestion className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-sm">No RFIs submitted yet</p>
                </div>
              </TabsContent>

              <TabsContent value="activity" className="mt-0 space-y-4">
                <h3 className="text-sm font-semibold">Recent Activity</h3>
                <div className="space-y-3" data-testid="project-activity-timeline">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 h-2 w-2 rounded-full bg-green-500 shrink-0" />
                    <div>
                      <p className="text-sm">Project created</p>
                      <p className="text-xs text-muted-foreground">{new Date((project as any).createdAt || Date.now()).toLocaleDateString()}</p>
                    </div>
                  </div>
                  {project.status !== "planning" && (
                    <div className="flex items-start gap-3">
                      <div className="mt-1 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                      <div>
                        <p className="text-sm">Status changed to {project.status}</p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <div className="border-t p-4 flex items-center justify-between gap-4 shrink-0 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-project-detail">
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" data-testid="button-share-project">
              <Share2 className="mr-2 h-4 w-4" />
              Share
            </Button>
            <Button data-testid="button-edit-project">
              Edit Project
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
