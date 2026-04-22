import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Search,
  Filter,
  Download,
  Clock,
  User,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface AuditEventData {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  resourceId: string;
  status: "success" | "failure" | "warning";
  ipAddress: string;
  details: string;
}

export default function AuditLog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const { toast } = useToast();

  const { data: events, isLoading: eventsLoading } = useQuery<AuditEventData[]>({
    queryKey: ["/api/audit-events"],
  });

  // Real data from API - no mocks
  const displayEvents = events || [];
  
  // Calculate stats from real data
  const displayStats = {
    totalEvents: displayEvents.length,
    successEvents: displayEvents.filter(e => e.status === "success").length,
    warningEvents: displayEvents.filter(e => e.status === "warning").length,
    failureEvents: displayEvents.filter(e => e.status === "failure").length,
  };

  const handleExportAudit = () => {
    if (displayEvents.length === 0) {
      toast({ title: "No Data", description: "No audit events to export.", variant: "destructive" });
      return;
    }
    toast({ title: "Exporting Audit Log", description: "Generating comprehensive audit report..." });
    
    const csvData = "Timestamp,User,Action,Status,Resource,Details\n" + 
      displayEvents.map(e => 
        `${e.timestamp},${e.user},${e.action},${e.status},${e.resource},${e.details.replace(/,/g, ';')}`
      ).join("\n");
    const blob = new Blob([csvData], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Export Complete", description: `Exported ${displayEvents.length} audit events to CSV.` });
  };

  const filteredEvents = displayEvents.filter((event) => {
    const matchesSearch = event.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.resource.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.details.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || event.status === statusFilter;
    const matchesAction = actionFilter === "all" || event.action === actionFilter;
    
    return matchesSearch && matchesStatus && matchesAction;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success": return <Badge className="bg-green-500/10 text-green-500 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Success</Badge>;
      case "warning": return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Warning</Badge>;
      case "failure": return <Badge className="bg-red-500/10 text-red-500 border-red-500/20"><XCircle className="h-3 w-3 mr-1" />Failure</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getActionBadge = (action: string) => {
    const colors: Record<string, string> = {
      login: "bg-blue-500/10 text-blue-500 border-blue-500/20",
      logout: "bg-gray-500/10 text-gray-500 border-gray-500/20",
      create: "bg-green-500/10 text-green-500 border-green-500/20",
      update: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
      delete: "bg-red-500/10 text-red-500 border-red-500/20",
      approve: "bg-purple-500/10 text-purple-500 border-purple-500/20",
      export: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
      sync: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    };
    return <Badge className={colors[action] || "bg-gray-500/10 text-gray-500 border-gray-500/20"}>{action}</Badge>;
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-audit">Audit Log</h1>
          <p className="text-muted-foreground">Track system activity and security events</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExportAudit} data-testid="button-export-audit">
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="stat-card-total-events">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center">
              <Activity className="h-5 w-5 text-blue-500" />
            </div>
          </CardHeader>
          <CardContent>
            {eventsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{displayStats.totalEvents.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground">Last 30 days</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-success-events">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Successful</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {eventsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-green-500">{displayStats.successEvents.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="stat-card-warning-events">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {eventsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-yellow-500">{displayStats.warningEvents}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="stat-card-failure-events">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failures</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {eventsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-red-500">{displayStats.failureEvents}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-audit-events">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>Activity Log</CardTitle>
              <CardDescription>Recent system events and user activity</CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search events..."
                  className="pl-8 w-[200px]"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-audit"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="failure">Failure</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-[130px]" data-testid="select-action-filter">
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="create">Create</SelectItem>
                  <SelectItem value="update">Update</SelectItem>
                  <SelectItem value="delete">Delete</SelectItem>
                  <SelectItem value="approve">Approve</SelectItem>
                  <SelectItem value="export">Export</SelectItem>
                  <SelectItem value="sync">Sync</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {eventsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Resource</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead className="max-w-[200px]">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEvents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No events found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEvents.map((event) => (
                    <TableRow key={event.id} data-testid={`audit-row-${event.id}`}>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatTimestamp(event.timestamp)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground" />
                          <span className="text-sm" data-testid={`audit-user-${event.id}`}>{event.user}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getActionBadge(event.action)}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{event.resource}</span>
                        <span className="text-xs text-muted-foreground ml-1">({event.resourceId})</span>
                      </TableCell>
                      <TableCell>{getStatusBadge(event.status)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground font-mono">{event.ipAddress}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground" title={event.details}>
                        {event.details}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
