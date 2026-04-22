import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Clock,
  AlertTriangle,
  GraduationCap,
  MapPin,
  FileText,
  MoreHorizontal,
  Plus,
  Search,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Play,
  ClipboardCheck,
  Shield,
  Calendar,
  User,
  Building2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WorkforceStats {
  totalEmployees: number;
  onSiteToday: number;
  pendingTimesheets: number;
  safetyIncidentsMTD: number;
}

interface Employee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  department: string;
  jobTitle: string;
  status: string;
  skills?: string[] | null;
  skillsJson?: string[] | null;
  email: string;
  phone: string;
}

interface TimeEntry {
  id: string;
  employeeId: string;
  employeeName: string;
  projectName: string;
  entryDate: string;
  clockInAt: string | null;
  clockOutAt: string | null;
  regularHours: number;
  overtimeHours: number;
  status: string;
}

interface SafetyIncident {
  id: string;
  incidentNumber: string;
  incidentType: string;
  severity: string;
  status: string;
  locationDescription: string;
  occurredAt: string;
  description: string;
  oshaReportable: boolean;
}

interface SafetyBriefing {
  id: string;
  briefingType: string;
  topic: string;
  conductedAt: string;
  conductedBy: string;
  attendeesCount: number;
}

interface TrainingCourse {
  id: string;
  courseCode: string;
  name: string;
  category: string;
  isRequired: boolean;
  totalEnrolled: number;
  completedCount: number;
  inProgressCount: number;
}

interface TrainingRecord {
  id: string;
  employeeName: string;
  courseName: string;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  score: number | null;
  passed: boolean | null;
  expiresAt: string | null;
}


export default function Workforce() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("employees");
  const [addEmployeeOpen, setAddEmployeeOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    employeeNumber: "",
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    department: "",
    jobTitle: "",
    employmentType: "full-time",
    hourlyRate: "",
  });
  const { toast } = useToast();

  const createEmployeeMutation = useMutation({
    mutationFn: (data: typeof newEmployee) =>
      apiRequest("POST", "/api/hr/employees", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/hr/employees"] });
      toast({ title: "Employee Added", description: "New employee record created successfully." });
      setAddEmployeeOpen(false);
      setNewEmployee({ employeeNumber: "", firstName: "", lastName: "", email: "", phone: "", department: "", jobTitle: "", employmentType: "full-time", hourlyRate: "" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create employee record.", variant: "destructive" });
    },
  });

  const handleExportData = () => {
    const employees = displayEmployees || [];
    const csvData = "Employee Number,Name,Department,Job Title,Status\n" + 
      employees.map((e: any) => `${e.employeeNumber},"${e.firstName} ${e.lastName}",${e.department},${e.jobTitle},${e.status}`).join("\n");
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "workforce-export-" + new Date().toISOString().split("T")[0] + ".csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export Complete", description: "Workforce data exported to CSV." });
  };

  const handleAddEmployee = () => {
    setAddEmployeeOpen(true);
  };

  const handleSubmitEmployee = () => {
    if (!newEmployee.employeeNumber || !newEmployee.firstName || !newEmployee.lastName) {
      toast({ title: "Validation Error", description: "Please fill required fields.", variant: "destructive" });
      return;
    }
    createEmployeeMutation.mutate(newEmployee);
  };

  const handleFilterEmployees = () => {
    toast({ title: "Filter", description: "Opening employee filter options..." });
  };

  const handleAddTimeEntry = () => {
    toast({ title: "Add Time Entry", description: "Opening time entry form..." });
  };

  const handleApproveAll = () => {
    toast({ title: "Approve All", description: "Approving all pending time entries..." });
  };

  const handleFilterTime = () => {
    toast({ title: "Filter by Time", description: "Opening time filter options..." });
  };

  const handleFilterProject = () => {
    toast({ title: "Filter by Project", description: "Opening project filter options..." });
  };

  const handleReportIncident = () => {
    toast({ title: "Report Incident", description: "Opening safety incident report form..." });
  };

  const handleNewBriefing = () => {
    toast({ title: "New Briefing", description: "Creating new safety briefing..." });
  };

  const handleAddCourse = () => {
    toast({ title: "Add Course", description: "Opening course assignment form..." });
  };

  const handleViewAllTraining = () => {
    toast({ title: "View Training", description: "Opening full training catalog..." });
  };

  const { data: stats, isLoading: statsLoading } = useQuery<WorkforceStats>({
    queryKey: ["/api/workforce/stats"],
  });

  const { data: employees, isLoading: employeesLoading } = useQuery<Employee[]>({
    queryKey: ["/api/hr/employees"],
  });

  const { data: timeEntries, isLoading: timeEntriesLoading } = useQuery<TimeEntry[]>({
    queryKey: ["/api/time-entries"],
  });

  const { data: safetyIncidents, isLoading: incidentsLoading } = useQuery<SafetyIncident[]>({
    queryKey: ["/api/safety-incidents"],
  });

  const defaultStats: WorkforceStats = { totalEmployees: 0, onSiteToday: 0, pendingTimesheets: 0, safetyIncidentsMTD: 0 };
  const displayStats = stats || defaultStats;
  const displayEmployees = employees || [];
  const displayTimeEntries = timeEntries || [];
  const displaySafetyIncidents = safetyIncidents || [];

  const filteredEmployees = displayEmployees.filter(
    (emp) =>
      emp.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.lastName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.employeeNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      emp.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
      case "on_leave":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">On Leave</Badge>;
      case "terminated":
        return <Badge variant="secondary">Terminated</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTimeEntryStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1"><Play className="h-3 w-3" />Active</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getIncidentSeverityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return <Badge variant="destructive">Critical</Badge>;
      case "major":
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Major</Badge>;
      case "moderate":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Moderate</Badge>;
      case "minor":
        return <Badge variant="secondary">Minor</Badge>;
      default:
        return <Badge variant="outline">{severity}</Badge>;
    }
  };

  const getIncidentStatusBadge = (status: string) => {
    switch (status) {
      case "closed":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Closed</Badge>;
      case "investigating":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Investigating</Badge>;
      case "reported":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Reported</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTrainingStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1"><CheckCircle2 className="h-3 w-3" />Completed</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 gap-1"><Play className="h-3 w-3" />In Progress</Badge>;
      case "not_started":
        return <Badge variant="secondary">Not Started</Badge>;
      case "expired":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" />Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return "—";
    return timeStr;
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">HR & Workforce</h1>
          <p className="text-muted-foreground">Manage employees, time tracking, safety, and training</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportData} data-testid="button-export-data">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
          <Button size="sm" onClick={handleAddEmployee} data-testid="button-add-employee">
            <Plus className="mr-2 h-4 w-4" />
            Add Employee
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-total-employees">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Users className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.totalEmployees}</div>
                <p className="text-xs text-muted-foreground">8 new this quarter</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-on-site">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On Site Today</CardTitle>
            <div className="h-10 w-10 rounded-md bg-emerald-500/10 flex items-center justify-center">
              <MapPin className="h-5 w-5 text-emerald-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.onSiteToday}</div>
                <p className="text-xs text-muted-foreground">Across 6 active sites</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-pending-timesheets">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Timesheets</CardTitle>
            <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.pendingTimesheets}</div>
                <p className="text-xs text-muted-foreground">Awaiting approval</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-safety-incidents">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Safety Incidents (MTD)</CardTitle>
            <div className="h-10 w-10 rounded-md bg-red-500/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.safetyIncidentsMTD}</div>
                <p className="text-xs text-muted-foreground">0 OSHA recordable</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList data-testid="tabs-workforce">
          <TabsTrigger value="employees" data-testid="tab-employees">
            <Users className="mr-2 h-4 w-4" />
            Employees
          </TabsTrigger>
          <TabsTrigger value="time-attendance" data-testid="tab-time-attendance">
            <Clock className="mr-2 h-4 w-4" />
            Time & Attendance
          </TabsTrigger>
          <TabsTrigger value="safety" data-testid="tab-safety">
            <Shield className="mr-2 h-4 w-4" />
            Safety
          </TabsTrigger>
          <TabsTrigger value="training" data-testid="tab-training">
            <GraduationCap className="mr-2 h-4 w-4" />
            Training
          </TabsTrigger>
        </TabsList>

        <TabsContent value="employees" className="space-y-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative flex-1 min-w-[280px] max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search employees..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-employees"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleFilterEmployees} data-testid="button-filter-employees">
              <Filter className="mr-2 h-4 w-4" />
              Filter
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee #</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Job Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Skills</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    filteredEmployees.map((employee) => (
                      <TableRow key={employee.id} data-testid={`row-employee-${employee.id}`}>
                        <TableCell className="font-medium">{employee.employeeNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-medium text-primary">
                                {employee.firstName[0]}{employee.lastName[0]}
                              </span>
                            </div>
                            <div>
                              <div className="font-medium">{employee.firstName} {employee.lastName}</div>
                              <div className="text-xs text-muted-foreground">{employee.email}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{employee.department}</TableCell>
                        <TableCell>{employee.jobTitle}</TableCell>
                        <TableCell>{getStatusBadge(employee.status)}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {(employee.skills || employee.skillsJson || []).slice(0, 2).map((skill, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">
                                {skill}
                              </Badge>
                            ))}
                            {(employee.skills || employee.skillsJson || []).length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{(employee.skills || employee.skillsJson || []).length - 2}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-employee-menu-${employee.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <User className="mr-2 h-4 w-4" />
                                View Profile
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <FileText className="mr-2 h-4 w-4" />
                                View Timesheets
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <GraduationCap className="mr-2 h-4 w-4" />
                                Training Records
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>Edit Employee</DropdownMenuItem>
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

        <TabsContent value="time-attendance" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleFilterTime} data-testid="button-filter-time">
                <Calendar className="mr-2 h-4 w-4" />
                Today
              </Button>
              <Button variant="outline" size="sm" onClick={handleFilterProject} data-testid="button-filter-project">
                <Building2 className="mr-2 h-4 w-4" />
                All Projects
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleApproveAll} data-testid="button-approve-all">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve All Pending
              </Button>
              <Button size="sm" onClick={handleAddTimeEntry} data-testid="button-add-time-entry">
                <Plus className="mr-2 h-4 w-4" />
                Add Entry
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Regular Hrs</TableHead>
                    <TableHead>OT Hrs</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {timeEntriesLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    displayTimeEntries.map((entry) => (
                      <TableRow key={entry.id} data-testid={`row-time-entry-${entry.id}`}>
                        <TableCell>{formatDate(entry.entryDate)}</TableCell>
                        <TableCell className="font-medium">{entry.employeeName}</TableCell>
                        <TableCell>{entry.projectName}</TableCell>
                        <TableCell>{formatTime(entry.clockInAt)}</TableCell>
                        <TableCell>{formatTime(entry.clockOutAt)}</TableCell>
                        <TableCell>{entry.regularHours > 0 ? entry.regularHours : "—"}</TableCell>
                        <TableCell className={entry.overtimeHours > 0 ? "text-yellow-500" : ""}>
                          {entry.overtimeHours > 0 ? entry.overtimeHours : "—"}
                        </TableCell>
                        <TableCell>{getTimeEntryStatusBadge(entry.status)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-time-menu-${entry.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Approve</DropdownMenuItem>
                              <DropdownMenuItem>Reject</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>Edit Entry</DropdownMenuItem>
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

        <TabsContent value="safety" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="text-lg font-semibold">Safety Incidents</h3>
            <Button size="sm" onClick={handleReportIncident} data-testid="button-report-incident">
              <Plus className="mr-2 h-4 w-4" />
              Report Incident
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incident #</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Severity</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>OSHA</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidentsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      </TableRow>
                    ))
                  ) : (
                    displaySafetyIncidents.map((incident) => (
                      <TableRow key={incident.id} data-testid={`row-incident-${incident.id}`}>
                        <TableCell className="font-medium">{incident.incidentNumber}</TableCell>
                        <TableCell>{incident.incidentType}</TableCell>
                        <TableCell>{getIncidentSeverityBadge(incident.severity)}</TableCell>
                        <TableCell>{incident.locationDescription}</TableCell>
                        <TableCell>{formatDate(incident.occurredAt)}</TableCell>
                        <TableCell>{getIncidentStatusBadge(incident.status)}</TableCell>
                        <TableCell>
                          {incident.oshaReportable ? (
                            <Badge variant="destructive" className="text-xs">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-incident-menu-${incident.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Update Status</DropdownMenuItem>
                              <DropdownMenuItem>Add Investigation Notes</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>Generate Report</DropdownMenuItem>
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

          <div className="flex items-center justify-between gap-4 flex-wrap pt-4">
            <h3 className="text-lg font-semibold">Safety Briefings</h3>
            <Button size="sm" onClick={handleNewBriefing} data-testid="button-new-briefing">
              <Plus className="mr-2 h-4 w-4" />
              New Briefing
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Topic</TableHead>
                    <TableHead>Conducted By</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Attendees</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {([] as SafetyBriefing[]).map((briefing) => (
                    <TableRow key={briefing.id} data-testid={`row-briefing-${briefing.id}`}>
                      <TableCell>
                        <Badge variant="outline">{briefing.briefingType}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{briefing.topic}</TableCell>
                      <TableCell>{briefing.conductedBy}</TableCell>
                      <TableCell>{formatDate(briefing.conductedAt)}</TableCell>
                      <TableCell>{briefing.attendeesCount} people</TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-briefing-menu-${briefing.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>View Signatures</DropdownMenuItem>
                            <DropdownMenuItem>Download PDF</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="training" className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h3 className="text-lg font-semibold">Training Courses</h3>
            <Button size="sm" onClick={handleAddCourse} data-testid="button-add-course">
              <Plus className="mr-2 h-4 w-4" />
              Add Course
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {([] as TrainingCourse[]).map((course) => (
              <Card key={course.id} data-testid={`card-course-${course.id}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{course.name}</CardTitle>
                      <CardDescription>{course.courseCode}</CardDescription>
                    </div>
                    {course.isRequired && (
                      <Badge variant="secondary" className="text-xs">Required</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Completed</span>
                      <span className="font-medium">{course.completedCount} / {course.totalEnrolled}</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${(course.completedCount / course.totalEnrolled) * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{course.inProgressCount} in progress</span>
                      <span>{course.totalEnrolled - course.completedCount - course.inProgressCount} not started</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 flex-wrap pt-4">
            <h3 className="text-lg font-semibold">Recent Training Records</h3>
            <Button variant="outline" size="sm" onClick={handleViewAllTraining} data-testid="button-view-all-training">
              View All Records
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {([] as TrainingRecord[]).map((record) => (
                    <TableRow key={record.id} data-testid={`row-training-${record.id}`}>
                      <TableCell className="font-medium">{record.employeeName}</TableCell>
                      <TableCell>{record.courseName}</TableCell>
                      <TableCell>{getTrainingStatusBadge(record.status)}</TableCell>
                      <TableCell>{record.startedAt ? formatDate(record.startedAt) : "—"}</TableCell>
                      <TableCell>{record.completedAt ? formatDate(record.completedAt) : "—"}</TableCell>
                      <TableCell>
                        {record.score !== null ? (
                          <span className={record.passed ? "text-green-500" : "text-red-500"}>
                            {record.score}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {record.expiresAt ? (
                          <span className={new Date(record.expiresAt) < new Date() ? "text-red-500" : ""}>
                            {formatDate(record.expiresAt)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-training-menu-${record.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuItem>Download Certificate</DropdownMenuItem>
                            <DropdownMenuItem>Send Reminder</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addEmployeeOpen} onOpenChange={setAddEmployeeOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Add Employee</DialogTitle>
            <DialogDescription>
              Register a new employee in the workforce management system.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="employeeNumber" className="text-right">Emp # *</Label>
              <Input
                id="employeeNumber"
                value={newEmployee.employeeNumber}
                onChange={(e) => setNewEmployee({ ...newEmployee, employeeNumber: e.target.value })}
                className="col-span-3"
                placeholder="e.g., EMP-001"
                data-testid="input-employee-number"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="firstName" className="text-right">First Name *</Label>
              <Input
                id="firstName"
                value={newEmployee.firstName}
                onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })}
                className="col-span-3"
                data-testid="input-employee-firstname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="lastName" className="text-right">Last Name *</Label>
              <Input
                id="lastName"
                value={newEmployee.lastName}
                onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })}
                className="col-span-3"
                data-testid="input-employee-lastname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email</Label>
              <Input
                id="email"
                type="email"
                value={newEmployee.email}
                onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                className="col-span-3"
                data-testid="input-employee-email"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">Phone</Label>
              <Input
                id="phone"
                value={newEmployee.phone}
                onChange={(e) => setNewEmployee({ ...newEmployee, phone: e.target.value })}
                className="col-span-3"
                data-testid="input-employee-phone"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="department" className="text-right">Department</Label>
              <Select
                value={newEmployee.department}
                onValueChange={(v) => setNewEmployee({ ...newEmployee, department: v })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-employee-department">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="construction">Construction</SelectItem>
                  <SelectItem value="project_management">Project Management</SelectItem>
                  <SelectItem value="engineering">Engineering</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                  <SelectItem value="administration">Administration</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="jobTitle" className="text-right">Job Title</Label>
              <Input
                id="jobTitle"
                value={newEmployee.jobTitle}
                onChange={(e) => setNewEmployee({ ...newEmployee, jobTitle: e.target.value })}
                className="col-span-3"
                data-testid="input-employee-jobtitle"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="employmentType" className="text-right">Type</Label>
              <Select
                value={newEmployee.employmentType}
                onValueChange={(v) => setNewEmployee({ ...newEmployee, employmentType: v })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-employee-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full-time">Full-time</SelectItem>
                  <SelectItem value="part-time">Part-time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="temp">Temporary</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="hourlyRate" className="text-right">Hourly Rate</Label>
              <Input
                id="hourlyRate"
                value={newEmployee.hourlyRate}
                onChange={(e) => setNewEmployee({ ...newEmployee, hourlyRate: e.target.value })}
                className="col-span-3"
                placeholder="e.g., 45.00"
                data-testid="input-employee-rate"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddEmployeeOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitEmployee} 
              disabled={createEmployeeMutation.isPending}
              data-testid="button-submit-employee"
            >
              {createEmployeeMutation.isPending ? "Adding..." : "Add Employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
