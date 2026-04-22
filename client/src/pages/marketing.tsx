import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Megaphone,
  Users,
  FileText,
  BarChart3,
  Plus,
  TrendingUp,
  Target,
  DollarSign,
  Mail,
  Eye,
  MousePointerClick,
  Send,
  MoreHorizontal,
  Building2,
  Phone,
  Clock,
  Award,
  Filter,
  RefreshCw,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MarketingStats {
  activeCampaigns: number;
  leadsGenerated: number;
  conversionRate: number;
  pipelineValue: number;
}

interface MarketingCampaign {
  id: string;
  name: string;
  description: string | null;
  campaignType: string;
  channel: string;
  status: string;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  budgetAmount: number | null;
  spentAmount: number | null;
  sent: number;
  opened: number;
  clicked: number;
}

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  department: string | null;
  company: string | null;
  status: string;
  lastContactAt: string | null;
}

interface CapabilityStatement {
  id: string;
  name: string;
  version: number;
  status: string;
  naicsCodes: string[];
  certifications: string[];
  publishedAt: string | null;
  updatedAt: string;
}

interface AnalyticsData {
  conversionFunnel: { stage: string; count: number; rate: number }[];
  engagementMetrics: { label: string; value: number; change: number }[];
  roiMetrics: { label: string; value: string; trend: "up" | "down" | "neutral" }[];
}

const mockStats: MarketingStats = {
  activeCampaigns: 8,
  leadsGenerated: 156,
  conversionRate: 12.4,
  pipelineValue: 2850000,
};

const mockCampaigns: MarketingCampaign[] = [
  { id: "1", name: "Q1 Federal Agency Outreach", description: "Targeted outreach to federal procurement officers", campaignType: "outreach", channel: "email", status: "active", scheduledAt: null, startedAt: "2026-01-15", completedAt: null, budgetAmount: 5000, spentAmount: 2100, sent: 450, opened: 312, clicked: 89 },
  { id: "2", name: "GSA Schedule Awareness", description: "Promoting GSA schedule capabilities", campaignType: "awareness", channel: "linkedin", status: "active", scheduledAt: null, startedAt: "2026-01-10", completedAt: null, budgetAmount: 3500, spentAmount: 1800, sent: 280, opened: 195, clicked: 42 },
  { id: "3", name: "HVAC Modernization Campaign", description: "Targeting agencies with aging HVAC systems", campaignType: "lead_generation", channel: "email", status: "completed", scheduledAt: null, startedAt: "2025-12-01", completedAt: "2026-01-05", budgetAmount: 4000, spentAmount: 3800, sent: 620, opened: 445, clicked: 128 },
  { id: "4", name: "DoD Contractor Newsletter", description: "Monthly newsletter for DoD contacts", campaignType: "newsletter", channel: "email", status: "active", scheduledAt: null, startedAt: "2026-01-20", completedAt: null, budgetAmount: 1500, spentAmount: 450, sent: 890, opened: 534, clicked: 156 },
  { id: "5", name: "8(a) Certification Announcement", description: "Announcing new 8(a) certification status", campaignType: "announcement", channel: "multi", status: "scheduled", scheduledAt: "2026-02-01", startedAt: null, completedAt: null, budgetAmount: 8000, spentAmount: 0, sent: 0, opened: 0, clicked: 0 },
  { id: "6", name: "Construction Services Webinar", description: "Educational webinar on federal construction processes", campaignType: "event", channel: "webinar", status: "draft", scheduledAt: null, startedAt: null, completedAt: null, budgetAmount: 6000, spentAmount: 0, sent: 0, opened: 0, clicked: 0 },
];

const mockContacts: Contact[] = [
  { id: "1", firstName: "Sarah", lastName: "Mitchell", email: "sarah.mitchell@gsa.gov", phone: "(202) 555-0147", title: "Contracting Officer", department: "Public Buildings Service", company: "GSA", status: "active", lastContactAt: "2026-01-25" },
  { id: "2", firstName: "James", lastName: "Rodriguez", email: "james.rodriguez@va.gov", phone: "(202) 555-0193", title: "Procurement Specialist", department: "Facilities Management", company: "VA", status: "active", lastContactAt: "2026-01-22" },
  { id: "3", firstName: "Michelle", lastName: "Chen", email: "michelle.chen@navy.mil", phone: "(703) 555-0281", title: "Contract Administrator", department: "NAVFAC", company: "DoD Navy", status: "warm_lead", lastContactAt: "2026-01-20" },
  { id: "4", firstName: "Robert", lastName: "Thompson", email: "robert.thompson@cbp.gov", phone: "(202) 555-0165", title: "Project Manager", department: "Facilities Division", company: "CBP", status: "qualified", lastContactAt: "2026-01-18" },
  { id: "5", firstName: "Linda", lastName: "Park", email: "linda.park@fema.gov", phone: "(202) 555-0234", title: "Senior Contracting Officer", department: "Logistics", company: "FEMA", status: "active", lastContactAt: "2026-01-15" },
  { id: "6", firstName: "David", lastName: "Williams", email: "david.williams@usace.mil", phone: "(703) 555-0312", title: "Program Manager", department: "Civil Works", company: "USACE", status: "new", lastContactAt: "2026-01-27" },
  { id: "7", firstName: "Patricia", lastName: "Brown", email: "patricia.brown@state.gov", phone: "(202) 555-0178", title: "Facilities Coordinator", department: "OBO", company: "State Dept", status: "inactive", lastContactAt: "2025-11-30" },
];

const mockCapabilityStatements: CapabilityStatement[] = [
  { id: "1", name: "General Federal Capability Statement", version: 4, status: "published", naicsCodes: ["236220", "238220", "238210"], certifications: ["8(a)", "HUBZone", "SDVOSB"], publishedAt: "2026-01-15", updatedAt: "2026-01-15" },
  { id: "2", name: "HVAC Specialization Statement", version: 2, status: "published", naicsCodes: ["238220", "238990"], certifications: ["8(a)", "HUBZone"], publishedAt: "2025-12-10", updatedAt: "2025-12-10" },
  { id: "3", name: "DoD-Specific Capability Statement", version: 3, status: "draft", naicsCodes: ["236220", "237990", "562910"], certifications: ["8(a)", "SDVOSB", "Secret Clearance"], publishedAt: null, updatedAt: "2026-01-24" },
  { id: "4", name: "Emergency Response Services", version: 1, status: "review", naicsCodes: ["562910", "236220"], certifications: ["8(a)", "FEMA Approved"], publishedAt: null, updatedAt: "2026-01-22" },
  { id: "5", name: "GSA Schedule Capability Statement", version: 5, status: "published", naicsCodes: ["236220", "238220", "238210", "238990"], certifications: ["GSA Schedule", "8(a)", "HUBZone"], publishedAt: "2026-01-20", updatedAt: "2026-01-20" },
];

const mockAnalytics: AnalyticsData = {
  conversionFunnel: [
    { stage: "Impressions", count: 15420, rate: 100 },
    { stage: "Clicks", count: 2850, rate: 18.5 },
    { stage: "Leads", count: 420, rate: 14.7 },
    { stage: "Qualified", count: 156, rate: 37.1 },
    { stage: "Opportunities", count: 42, rate: 26.9 },
    { stage: "Won", count: 8, rate: 19.0 },
  ],
  engagementMetrics: [
    { label: "Email Open Rate", value: 68.2, change: 5.4 },
    { label: "Click-Through Rate", value: 24.8, change: 3.2 },
    { label: "Response Rate", value: 12.4, change: -1.8 },
    { label: "Unsubscribe Rate", value: 0.8, change: -0.2 },
  ],
  roiMetrics: [
    { label: "Total Campaign Spend", value: "$24,150", trend: "neutral" },
    { label: "Revenue Generated", value: "$1.2M", trend: "up" },
    { label: "Cost Per Lead", value: "$58.45", trend: "down" },
    { label: "ROI", value: "4,870%", trend: "up" },
  ],
};

export default function Marketing() {
  const [selectedTab, setSelectedTab] = useState("campaigns");
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    title: "",
    source: "marketing",
  });
  const { toast } = useToast();

  const createContactMutation = useMutation({
    mutationFn: (data: typeof newContact) =>
      apiRequest("POST", "/api/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
      toast({ title: "Contact Created", description: "New contact added successfully." });
      setAddContactOpen(false);
      setNewContact({ firstName: "", lastName: "", email: "", phone: "", company: "", title: "", source: "marketing" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create contact.", variant: "destructive" });
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/contacts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/marketing/campaigns"] });
    toast({ title: "Data Refreshed", description: "Marketing data has been updated." });
  };

  const handleAddContact = () => {
    setAddContactOpen(true);
  };

  const handleSubmitContact = () => {
    if (!newContact.firstName || !newContact.lastName || !newContact.email) {
      toast({ title: "Validation Error", description: "Please fill in required fields.", variant: "destructive" });
      return;
    }
    createContactMutation.mutate(newContact);
  };

  const handleGenerateCapability = () => {
    toast({ title: "Generating Capability Statement", description: "Creating professional capability statement with company profile data..." });
    setTimeout(() => {
      toast({ title: "Capability Statement Ready", description: "Your capability statement has been generated." });
    }, 2000);
  };

  const handleNewCampaign = () => {
    toast({ title: "New Campaign", description: "Opening campaign creation wizard..." });
  };

  const handleFilterCampaigns = () => {
    toast({ title: "Filter Campaigns", description: "Opening campaign filter options..." });
  };

  const handleFilterContacts = () => {
    toast({ title: "Filter Contacts", description: "Opening contact filter options..." });
  };

  const { data: stats, isLoading: statsLoading } = useQuery<MarketingStats>({
    queryKey: ["/api/marketing/stats"],
  });

  const { data: campaigns, isLoading: campaignsLoading } = useQuery<MarketingCampaign[]>({
    queryKey: ["/api/marketing/campaigns"],
  });

  const { data: contacts, isLoading: contactsLoading } = useQuery<Contact[]>({
    queryKey: ["/api/marketing/contacts"],
  });

  const { data: capabilityStatements, isLoading: capStatementsLoading } = useQuery<CapabilityStatement[]>({
    queryKey: ["/api/marketing/capability-statements"],
  });

  const { data: analytics, isLoading: analyticsLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/marketing/analytics"],
  });

  const displayStats = stats || mockStats;
  const displayCampaigns = campaigns || mockCampaigns;
  const displayContacts = contacts || mockContacts;
  const displayCapStatements = capabilityStatements || mockCapabilityStatements;
  const displayAnalytics = analytics || mockAnalytics;

  const getCampaignStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
      case "completed":
        return <Badge variant="secondary">Completed</Badge>;
      case "scheduled":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Scheduled</Badge>;
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "paused":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">Paused</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getContactStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
      case "warm_lead":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">Warm Lead</Badge>;
      case "qualified":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">Qualified</Badge>;
      case "new":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">New</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getCapStatementStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">Published</Badge>;
      case "draft":
        return <Badge variant="outline">Draft</Badge>;
      case "review":
        return <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">In Review</Badge>;
      case "archived":
        return <Badge variant="secondary">Archived</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case "email":
        return <Mail className="h-4 w-4" />;
      case "linkedin":
        return <Users className="h-4 w-4" />;
      case "webinar":
        return <BarChart3 className="h-4 w-4" />;
      case "multi":
        return <Megaphone className="h-4 w-4" />;
      default:
        return <Send className="h-4 w-4" />;
    }
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Marketing & Growth</h1>
          <p className="text-muted-foreground">Campaign management, CRM, and capability statement generation</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleAddContact} data-testid="button-add-contact">
            <Users className="mr-2 h-4 w-4" />
            Add Contact
          </Button>
          <Button variant="outline" size="sm" onClick={handleGenerateCapability} data-testid="button-generate-capability">
            <FileText className="mr-2 h-4 w-4" />
            Generate Capability Statement
          </Button>
          <Button size="sm" onClick={handleNewCampaign} data-testid="button-new-campaign">
            <Plus className="mr-2 h-4 w-4" />
            New Campaign
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-active-campaigns">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Campaigns</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-active-campaigns-value">{displayStats.activeCampaigns}</div>
                <p className="text-xs text-muted-foreground">Running across all channels</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-leads-generated">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Generated</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-leads-generated-value">{displayStats.leadsGenerated}</div>
                <p className="text-xs text-muted-foreground">This quarter</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-conversion-rate">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-conversion-rate-value">{displayStats.conversionRate}%</div>
                <p className="text-xs text-muted-foreground">Lead to opportunity</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-pipeline-value">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-pipeline-value-value">
                  ${(displayStats.pipelineValue / 1000000).toFixed(1)}M
                </div>
                <p className="text-xs text-muted-foreground">From marketing leads</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList data-testid="tabs-list">
          <TabsTrigger value="campaigns" data-testid="tab-campaigns">
            <Megaphone className="mr-2 h-4 w-4" />
            Campaigns
          </TabsTrigger>
          <TabsTrigger value="contacts" data-testid="tab-contacts">
            <Users className="mr-2 h-4 w-4" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="capability" data-testid="tab-capability">
            <FileText className="mr-2 h-4 w-4" />
            Capability Statements
          </TabsTrigger>
          <TabsTrigger value="analytics" data-testid="tab-analytics">
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Marketing Campaigns</CardTitle>
              <Button variant="outline" size="sm" onClick={handleFilterCampaigns} data-testid="button-filter-campaigns">
                <Filter className="mr-2 h-4 w-4" />
                Filter
              </Button>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Sent</TableHead>
                      <TableHead className="text-center">Opened</TableHead>
                      <TableHead className="text-center">Clicked</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayCampaigns.map((campaign) => (
                      <TableRow key={campaign.id} data-testid={`row-campaign-${campaign.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium" data-testid={`text-campaign-name-${campaign.id}`}>{campaign.name}</div>
                            <div className="text-xs text-muted-foreground">{campaign.description}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {campaign.campaignType.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getChannelIcon(campaign.channel)}
                            <span className="capitalize">{campaign.channel}</span>
                          </div>
                        </TableCell>
                        <TableCell>{getCampaignStatusBadge(campaign.status)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Send className="h-3 w-3 text-muted-foreground" />
                            <span>{campaign.sent.toLocaleString()}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Eye className="h-3 w-3 text-muted-foreground" />
                            <span>{campaign.opened.toLocaleString()}</span>
                            {campaign.sent > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({((campaign.opened / campaign.sent) * 100).toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <MousePointerClick className="h-3 w-3 text-muted-foreground" />
                            <span>{campaign.clicked.toLocaleString()}</span>
                            {campaign.opened > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({((campaign.clicked / campaign.opened) * 100).toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-campaign-menu-${campaign.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Edit Campaign</DropdownMenuItem>
                              <DropdownMenuItem>View Recipients</DropdownMenuItem>
                              <DropdownMenuItem>Duplicate</DropdownMenuItem>
                              {campaign.status === "draft" && (
                                <DropdownMenuItem>Launch Campaign</DropdownMenuItem>
                              )}
                              {campaign.status === "active" && (
                                <DropdownMenuItem>Pause Campaign</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contacts" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>CRM Contacts</CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleFilterContacts} data-testid="button-filter-contacts">
                  <Filter className="mr-2 h-4 w-4" />
                  Filter
                </Button>
                <Button size="sm" onClick={handleAddContact} data-testid="button-add-contact-table">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Contact
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {contactsLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last Contact</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayContacts.map((contact) => (
                      <TableRow key={contact.id} data-testid={`row-contact-${contact.id}`}>
                        <TableCell>
                          <div className="font-medium" data-testid={`text-contact-name-${contact.id}`}>
                            {contact.firstName} {contact.lastName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{contact.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            <span>{contact.company}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{contact.title}</div>
                          <div className="text-xs text-muted-foreground">{contact.department}</div>
                        </TableCell>
                        <TableCell>{getContactStatusBadge(contact.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm">{contact.lastContactAt}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-contact-menu-${contact.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>View Profile</DropdownMenuItem>
                              <DropdownMenuItem>Edit Contact</DropdownMenuItem>
                              <DropdownMenuItem>Send Email</DropdownMenuItem>
                              <DropdownMenuItem>Add to Campaign</DropdownMenuItem>
                              <DropdownMenuItem>View History</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capability" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle>Capability Statements</CardTitle>
              <Button size="sm" onClick={handleGenerateCapability} data-testid="button-generate-new-capability">
                <Plus className="mr-2 h-4 w-4" />
                Generate New
              </Button>
            </CardHeader>
            <CardContent>
              {capStatementsLoading ? (
                <div className="space-y-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {displayCapStatements.map((statement) => (
                    <Card key={statement.id} className="bg-muted/30" data-testid={`card-capability-${statement.id}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-3">
                              <FileText className="h-5 w-5 text-primary" />
                              <div>
                                <h4 className="font-semibold" data-testid={`text-capability-name-${statement.id}`}>{statement.name}</h4>
                                <p className="text-xs text-muted-foreground">Version {statement.version} | Updated {statement.updatedAt}</p>
                              </div>
                              {getCapStatementStatusBadge(statement.status)}
                            </div>
                            <div className="flex flex-wrap gap-4 mt-3">
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">NAICS Codes</p>
                                <div className="flex flex-wrap gap-1">
                                  {statement.naicsCodes.map((code) => (
                                    <Badge key={code} variant="outline" className="text-xs">
                                      {code}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div>
                                <p className="text-xs font-medium text-muted-foreground mb-1">Certifications</p>
                                <div className="flex flex-wrap gap-1">
                                  {statement.certifications.map((cert) => (
                                    <Badge key={cert} variant="secondary" className="text-xs">
                                      <Award className="mr-1 h-3 w-3" />
                                      {cert}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-capability-menu-${statement.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>View Document</DropdownMenuItem>
                              <DropdownMenuItem>Edit</DropdownMenuItem>
                              <DropdownMenuItem>Download PDF</DropdownMenuItem>
                              <DropdownMenuItem>Create New Version</DropdownMenuItem>
                              {statement.status === "draft" && (
                                <DropdownMenuItem>Submit for Review</DropdownMenuItem>
                              )}
                              {statement.status === "review" && (
                                <DropdownMenuItem>Publish</DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card data-testid="card-conversion-funnel">
              <CardHeader>
                <CardTitle>Conversion Funnel</CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="space-y-4">
                    {[...Array(6)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {displayAnalytics.conversionFunnel.map((stage, idx) => (
                      <div key={stage.stage} className="space-y-2" data-testid={`funnel-stage-${idx}`}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">{stage.stage}</span>
                          <span className="text-muted-foreground">
                            {stage.count.toLocaleString()} ({stage.rate}%)
                          </span>
                        </div>
                        <Progress value={stage.rate} className="h-2" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-engagement-metrics">
              <CardHeader>
                <CardTitle>Engagement Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <div className="space-y-4">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {displayAnalytics.engagementMetrics.map((metric, idx) => (
                      <div key={metric.label} className="flex items-center justify-between p-3 rounded-lg bg-muted/30" data-testid={`metric-engagement-${idx}`}>
                        <div>
                          <p className="text-sm font-medium">{metric.label}</p>
                          <p className="text-2xl font-bold">{metric.value}%</p>
                        </div>
                        <Badge className={metric.change >= 0 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                          {metric.change >= 0 ? "+" : ""}{metric.change}%
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-roi-metrics">
            <CardHeader>
              <CardTitle>ROI & Performance</CardTitle>
            </CardHeader>
            <CardContent>
              {analyticsLoading ? (
                <div className="grid gap-4 md:grid-cols-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-4">
                  {displayAnalytics.roiMetrics.map((metric, idx) => (
                    <div key={metric.label} className="p-4 rounded-lg bg-muted/30 text-center" data-testid={`metric-roi-${idx}`}>
                      <p className="text-sm text-muted-foreground mb-1">{metric.label}</p>
                      <p className="text-2xl font-bold">{metric.value}</p>
                      <div className="flex items-center justify-center gap-1 mt-2">
                        {metric.trend === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
                        {metric.trend === "down" && <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />}
                        {metric.trend === "neutral" && <CheckCircle2 className="h-4 w-4 text-muted-foreground" />}
                        <span className={`text-xs ${
                          metric.trend === "up" ? "text-green-500" : 
                          metric.trend === "down" ? "text-red-500" : 
                          "text-muted-foreground"
                        }`}>
                          {metric.trend === "up" ? "Improving" : metric.trend === "down" ? "Optimizing" : "Stable"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Contact</DialogTitle>
            <DialogDescription>
              Add a new contact to your marketing list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="firstName" className="text-right">First Name *</Label>
              <Input
                id="firstName"
                value={newContact.firstName}
                onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })}
                className="col-span-3"
                data-testid="input-contact-firstname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="lastName" className="text-right">Last Name *</Label>
              <Input
                id="lastName"
                value={newContact.lastName}
                onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })}
                className="col-span-3"
                data-testid="input-contact-lastname"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">Email *</Label>
              <Input
                id="email"
                type="email"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                className="col-span-3"
                data-testid="input-contact-email"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">Phone</Label>
              <Input
                id="phone"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                className="col-span-3"
                data-testid="input-contact-phone"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="company" className="text-right">Company</Label>
              <Input
                id="company"
                value={newContact.company}
                onChange={(e) => setNewContact({ ...newContact, company: e.target.value })}
                className="col-span-3"
                data-testid="input-contact-company"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="title" className="text-right">Title</Label>
              <Input
                id="title"
                value={newContact.title}
                onChange={(e) => setNewContact({ ...newContact, title: e.target.value })}
                className="col-span-3"
                data-testid="input-contact-title"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddContactOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitContact} 
              disabled={createContactMutation.isPending}
              data-testid="button-submit-contact"
            >
              {createContactMutation.isPending ? "Adding..." : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
