import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Ticket,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Timer,
  Plus,
  Filter,
  ChevronDown,
  Search,
  Eye,
  UserPlus,
  ArrowUpCircle,
  CheckCircle,
  MoreHorizontal,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TicketStats {
  openTickets: number;
  overdueTickets: number;
  resolvedToday: number;
  avgResolutionTime: string;
}

interface TicketData {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string;
  priority: "critical" | "high" | "normal" | "low";
  status: "open" | "in_progress" | "pending" | "resolved" | "closed";
  category: string;
  assignedTo: string | null;
  assignedToName: string | null;
  slaDeadline: string;
  createdAt: string;
  source: string;
}

const mockStats: TicketStats = {
  openTickets: 24,
  overdueTickets: 5,
  resolvedToday: 12,
  avgResolutionTime: "4.2h",
};

const mockTickets: TicketData[] = [
  {
    id: "1",
    ticketNumber: "TKT-001234",
    subject: "Equipment malfunction at Site A - Crane hydraulic system failure",
    description: "The main crane at Site A experienced hydraulic failure during operation.",
    priority: "critical",
    status: "open",
    category: "Equipment",
    assignedTo: "user-1",
    assignedToName: "John Martinez",
    slaDeadline: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    source: "field_report",
  },
  {
    id: "2",
    ticketNumber: "TKT-001233",
    subject: "Safety equipment missing from Site B storage",
    description: "Several hard hats and safety vests are missing from the Site B storage unit.",
    priority: "high",
    status: "in_progress",
    category: "Safety",
    assignedTo: "user-2",
    assignedToName: "Sarah Johnson",
    slaDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    source: "web",
  },
  {
    id: "3",
    ticketNumber: "TKT-001232",
    subject: "Permit renewal required for demolition work",
    description: "The demolition permit expires in 5 days and needs renewal.",
    priority: "normal",
    status: "pending",
    category: "Permits",
    assignedTo: "user-3",
    assignedToName: "Mike Chen",
    slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    source: "email",
  },
  {
    id: "4",
    ticketNumber: "TKT-001231",
    subject: "Subcontractor payment dispute - Electrical work",
    description: "Dispute regarding payment for additional electrical work not in original scope.",
    priority: "high",
    status: "open",
    category: "Billing",
    assignedTo: null,
    assignedToName: null,
    slaDeadline: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    source: "web",
  },
  {
    id: "5",
    ticketNumber: "TKT-001230",
    subject: "Material delivery delay - Concrete shipment",
    description: "Expected concrete delivery is delayed by 3 days due to supplier issues.",
    priority: "normal",
    status: "in_progress",
    category: "Materials",
    assignedTo: "user-1",
    assignedToName: "John Martinez",
    slaDeadline: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    source: "phone",
  },
  {
    id: "6",
    ticketNumber: "TKT-001229",
    subject: "Weather damage assessment needed - Site C",
    description: "Storm damage reported at Site C. Assessment required before work can resume.",
    priority: "critical",
    status: "open",
    category: "Site Issues",
    assignedTo: "user-4",
    assignedToName: "Emily Davis",
    slaDeadline: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    source: "field_report",
  },
  {
    id: "7",
    ticketNumber: "TKT-001228",
    subject: "Quality inspection request - Foundation work",
    description: "Request for quality inspection on completed foundation work at Site D.",
    priority: "low",
    status: "resolved",
    category: "Quality",
    assignedTo: "user-2",
    assignedToName: "Sarah Johnson",
    slaDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    source: "web",
  },
  {
    id: "8",
    ticketNumber: "TKT-001227",
    subject: "Training certification expired - Welding team",
    description: "Two welders have expired certifications that need renewal.",
    priority: "normal",
    status: "resolved",
    category: "HR/Training",
    assignedTo: "user-5",
    assignedToName: "Robert Wilson",
    slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),
    source: "email",
  },
];

export default function Tickets() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<TicketStats>({
    queryKey: ["/api/tickets/stats"],
  });

  const { data: tickets, isLoading: ticketsLoading } = useQuery<TicketData[]>({
    queryKey: ["/api/tickets"],
  });

  const displayStats = stats || mockStats;
  const displayTickets = tickets || mockTickets;

  const categories = Array.from(new Set(displayTickets.map((t) => t.category)));

  const filteredTickets = displayTickets
    .filter((ticket) => {
      if (selectedTab === "my-tickets") {
        return ticket.assignedTo === "user-1";
      }
      if (selectedTab === "overdue") {
        return new Date(ticket.slaDeadline) < new Date() && ticket.status !== "resolved" && ticket.status !== "closed";
      }
      if (selectedTab === "resolved") {
        return ticket.status === "resolved" || ticket.status === "closed";
      }
      return true;
    })
    .filter((ticket) => {
      if (priorityFilter !== "all" && ticket.priority !== priorityFilter) return false;
      if (statusFilter !== "all" && ticket.status !== statusFilter) return false;
      if (categoryFilter !== "all" && ticket.category !== categoryFilter) return false;
      return true;
    })
    .filter(
      (ticket) =>
        ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ticket.ticketNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "critical":
        return (
          <Badge variant="destructive" className="text-xs" data-testid={`badge-priority-${priority}`}>
            Critical
          </Badge>
        );
      case "high":
        return (
          <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20 text-xs" data-testid={`badge-priority-${priority}`}>
            High
          </Badge>
        );
      case "normal":
        return (
          <Badge variant="secondary" className="text-xs" data-testid={`badge-priority-${priority}`}>
            Normal
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs" data-testid={`badge-priority-${priority}`}>
            Low
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return (
          <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-xs" data-testid={`badge-status-${status}`}>
            Open
          </Badge>
        );
      case "in_progress":
        return (
          <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 text-xs" data-testid={`badge-status-${status}`}>
            In Progress
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20 text-xs" data-testid={`badge-status-${status}`}>
            Pending
          </Badge>
        );
      case "resolved":
        return (
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 text-xs" data-testid={`badge-status-${status}`}>
            Resolved
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-xs" data-testid={`badge-status-${status}`}>
            Closed
          </Badge>
        );
    }
  };

  const getSlaCountdown = (deadline: string, status: string) => {
    if (status === "resolved" || status === "closed") {
      return <span className="text-muted-foreground text-xs">Completed</span>;
    }

    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diff = deadlineDate.getTime() - now.getTime();

    if (diff < 0) {
      const hoursOverdue = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
      return (
        <span className="text-red-500 font-medium text-xs flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {hoursOverdue}h overdue
        </span>
      );
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours < 2) {
      return (
        <span className="text-orange-500 font-medium text-xs flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {hours}h {minutes}m left
        </span>
      );
    }

    return (
      <span className="text-muted-foreground text-xs flex items-center gap-1">
        <Clock className="h-3 w-3" />
        {hours}h left
      </span>
    );
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (hours < 1) return "Just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
            Ticketing & SLA Control Center
          </h1>
          <p className="text-muted-foreground">
            Manage support tickets, track SLA compliance, and resolve issues efficiently
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-ticket">
              <Plus className="mr-2 h-4 w-4" />
              Create New Ticket
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Ticket</DialogTitle>
              <DialogDescription>
                Submit a new support ticket. Fill in the details below.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  placeholder="Brief description of the issue"
                  data-testid="input-ticket-subject"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select>
                  <SelectTrigger data-testid="select-ticket-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="safety">Safety</SelectItem>
                    <SelectItem value="permits">Permits</SelectItem>
                    <SelectItem value="billing">Billing</SelectItem>
                    <SelectItem value="materials">Materials</SelectItem>
                    <SelectItem value="site-issues">Site Issues</SelectItem>
                    <SelectItem value="quality">Quality</SelectItem>
                    <SelectItem value="hr-training">HR/Training</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Select>
                  <SelectTrigger data-testid="select-ticket-priority">
                    <SelectValue placeholder="Select priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Provide detailed information about the issue"
                  className="min-h-[100px]"
                  data-testid="textarea-ticket-description"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} data-testid="button-cancel-ticket">
                Cancel
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(false)} data-testid="button-submit-ticket">
                Create Ticket
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-open-tickets">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Open Tickets</CardTitle>
            <Ticket className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.openTickets}</div>
                <p className="text-xs text-muted-foreground">Awaiting resolution</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-overdue">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue (SLA Breached)</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold text-destructive">{displayStats.overdueTickets}</div>
                <p className="text-xs text-muted-foreground">Require immediate attention</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-resolved-today">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Resolved Today</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold text-green-500">{displayStats.resolvedToday}</div>
                <p className="text-xs text-muted-foreground">Completed successfully</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-avg-resolution">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Resolution Time</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.avgResolutionTime}</div>
                <p className="text-xs text-muted-foreground">Last 7 days average</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[280px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search tickets..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-tickets"
          />
        </div>
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-priority">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-filter-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList data-testid="tabs-tickets">
          <TabsTrigger value="all" data-testid="tab-all-tickets">
            All Tickets
          </TabsTrigger>
          <TabsTrigger value="my-tickets" data-testid="tab-my-tickets">
            My Tickets
          </TabsTrigger>
          <TabsTrigger value="overdue" data-testid="tab-overdue">
            Overdue
          </TabsTrigger>
          <TabsTrigger value="resolved" data-testid="tab-resolved">
            Resolved
          </TabsTrigger>
        </TabsList>

        <TabsContent value={selectedTab} className="space-y-4">
          {ticketsLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <Skeleton className="h-6 w-24" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                      <Skeleton className="h-8 w-8" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filteredTickets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Ticket className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No tickets found</h3>
                <p className="text-muted-foreground text-center">
                  {searchQuery
                    ? "Try adjusting your search or filters"
                    : "No tickets match the current criteria"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredTickets.map((ticket) => (
                <Card key={ticket.id} className="hover-elevate cursor-pointer" data-testid={`ticket-card-${ticket.id}`} onClick={() => setLocation(`/entity/ticket/${ticket.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-mono text-muted-foreground" data-testid={`ticket-number-${ticket.id}`}>
                          {ticket.ticketNumber}
                        </span>
                        {getSlaCountdown(ticket.slaDeadline, ticket.status)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap mb-2">
                          <h3 className="font-medium text-sm leading-tight line-clamp-2" data-testid={`ticket-subject-${ticket.id}`}>
                            {ticket.subject}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {getPriorityBadge(ticket.priority)}
                          {getStatusBadge(ticket.status)}
                          <Badge variant="outline" className="text-xs" data-testid={`ticket-category-${ticket.id}`}>
                            {ticket.category}
                          </Badge>
                          {ticket.assignedToName ? (
                            <span className="text-xs text-muted-foreground" data-testid={`ticket-assigned-${ticket.id}`}>
                              Assigned to {ticket.assignedToName}
                            </span>
                          ) : (
                            <span className="text-xs text-orange-500" data-testid={`ticket-unassigned-${ticket.id}`}>
                              Unassigned
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground" data-testid={`ticket-created-${ticket.id}`}>
                            Created {formatDate(ticket.createdAt)}
                          </span>
                        </div>
                      </div>

                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-ticket-actions-${ticket.id}`}>
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem data-testid={`action-view-${ticket.id}`} onClick={() => setLocation(`/entity/ticket/${ticket.id}`)}>
                              <Eye className="mr-2 h-4 w-4" />
                              View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`action-assign-${ticket.id}`}>
                              <UserPlus className="mr-2 h-4 w-4" />
                              Assign
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem data-testid={`action-escalate-${ticket.id}`}>
                              <ArrowUpCircle className="mr-2 h-4 w-4" />
                              Escalate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-green-600"
                              data-testid={`action-resolve-${ticket.id}`}
                            >
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Resolve
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
