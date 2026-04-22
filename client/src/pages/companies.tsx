import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Building2,
  Plus,
  Search,
  Filter,
  MoreHorizontal,
  FileText,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Shield,
  FolderOpen,
  Clock,
  ChevronRight,
  Edit,
  Trash2,
  Eye,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Company {
  id: string;
  name: string;
  legalName: string | null;
  dba: string | null;
  type: string;
  ein: string | null;
  dunsNumber: string | null;
  cageCode: string | null;
  ueiNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  country: string | null;
  phone: string | null;
  fax: string | null;
  website: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  primaryContactPhone: string | null;
  insuranceExpiryDate: string | null;
  w9OnFile: boolean | null;
  bondingCapacity: string | null;
  licensesJson: any;
  certificationsJson: any;
  status: string;
  notes: string | null;
  tagsJson: any;
  createdAt: string;
  updatedAt: string;
}

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
  actorName: string | null;
  createdAt: string;
}

export default function CompaniesPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ["/api/companies"],
  });

  const createCompanyMutation = useMutation({
    mutationFn: async (data: Partial<Company>) => {
      const res = await apiRequest("POST", "/api/companies", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      setShowCreateDialog(false);
      toast({ title: "Company Created", description: "Company jacket has been created successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create company", variant: "destructive" });
    },
  });

  const deleteCompanyMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/companies/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/companies"] });
      toast({ title: "Company Deleted", description: "Company has been removed." });
    },
  });

  const filteredCompanies = companies.filter((company) => {
    const matchesSearch = company.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.primaryContactName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      company.city?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === "all" || company.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const stats = {
    total: companies.length,
    clients: companies.filter(c => c.type === "client").length,
    agencies: companies.filter(c => c.type === "agency").length,
    vendors: companies.filter(c => c.type === "vendor").length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active": return "bg-emerald-500/10 text-emerald-500";
      case "inactive": return "bg-gray-500/10 text-gray-500";
      case "archived": return "bg-amber-500/10 text-amber-500";
      default: return "bg-gray-500/10 text-gray-500";
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "client": return "bg-blue-500/10 text-blue-500";
      case "agency": return "bg-purple-500/10 text-purple-500";
      case "vendor": return "bg-orange-500/10 text-orange-500";
      case "subcontractor": return "bg-cyan-500/10 text-cyan-500";
      default: return "bg-gray-500/10 text-gray-500";
    }
  };

  const openCompanyDetail = (company: Company) => {
    setLocation(`/entity/company/${company.id}`);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-none p-4 md:p-6 border-b bg-background">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Vendor / Company CRM
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage client agencies, vendors, and subcontractors - documents powered by Knowledge Vault
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)} data-testid="button-add-company">
            <Plus className="h-4 w-4 mr-2" />
            Add Company
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{stats.total}</div>
              <div className="text-sm text-muted-foreground">Total Companies</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-500">{stats.clients}</div>
              <div className="text-sm text-muted-foreground">Clients</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-purple-500">{stats.agencies}</div>
              <div className="text-sm text-muted-foreground">Agencies</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-500">{stats.vendors}</div>
              <div className="text-sm text-muted-foreground">Vendors</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 md:flex-row md:items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search companies..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-companies"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-40" data-testid="select-type-filter">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filter type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="client">Clients</SelectItem>
              <SelectItem value="agency">Agencies</SelectItem>
              <SelectItem value="vendor">Vendors</SelectItem>
              <SelectItem value="subcontractor">Subcontractors</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-6 w-3/4 mb-4" />
                  <Skeleton className="h-4 w-1/2 mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredCompanies.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Companies Found</h3>
              <p className="text-muted-foreground mb-4">
                {companies.length === 0
                  ? "Get started by adding your first company jacket."
                  : "No companies match your current filters."}
              </p>
              {companies.length === 0 && (
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add First Company
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredCompanies.map((company) => (
              <Card
                key={company.id}
                className="hover-elevate cursor-pointer"
                onClick={() => openCompanyDetail(company)}
                data-testid={`card-company-${company.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{company.name}</CardTitle>
                      {company.legalName && company.legalName !== company.name && (
                        <CardDescription className="truncate">{company.legalName}</CardDescription>
                      )}
                    </div>
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" data-testid={`button-company-menu-${company.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setLocation(`/entity/company/${company.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => deleteCompanyMutation.mutate(company.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={getTypeColor(company.type)}>{company.type}</Badge>
                    <Badge className={getStatusColor(company.status)}>{company.status}</Badge>
                    {company.w9OnFile && (
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        W-9
                      </Badge>
                    )}
                  </div>

                  {company.primaryContactName && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Contact:</span>{" "}
                      {company.primaryContactName}
                    </div>
                  )}

                  {(company.city || company.state) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5" />
                      {[company.city, company.state].filter(Boolean).join(", ")}
                    </div>
                  )}

                  {company.cageCode && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">CAGE:</span>{" "}
                      <span className="font-mono">{company.cageCode}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <FolderOpen className="h-3.5 w-3.5" />
                      View Jacket
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <CreateCompanyDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSubmit={(data) => createCompanyMutation.mutate(data)}
        isLoading={createCompanyMutation.isPending}
      />

      <CompanyDetailDialog
        open={showDetailDialog}
        onOpenChange={setShowDetailDialog}
        company={selectedCompany}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
    </div>
  );
}

function CreateCompanyDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<Company>) => void;
  isLoading: boolean;
}) {
  const [formData, setFormData] = useState({
    name: "",
    legalName: "",
    type: "client",
    addressLine1: "",
    city: "",
    state: "",
    zipCode: "",
    phone: "",
    website: "",
    primaryContactName: "",
    primaryContactEmail: "",
    primaryContactPhone: "",
    cageCode: "",
    ueiNumber: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Company Jacket</DialogTitle>
          <DialogDescription>
            Add a new company with profile, documents, and compliance tracking
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter company name"
                required
                data-testid="input-company-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legalName">Legal Name</Label>
              <Input
                id="legalName"
                value={formData.legalName}
                onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
                placeholder="Legal entity name"
                data-testid="input-company-legal-name"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => setFormData({ ...formData, type: value })}
              >
                <SelectTrigger data-testid="select-company-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="client">Client</SelectItem>
                  <SelectItem value="agency">Agency</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cageCode">CAGE Code</Label>
              <Input
                id="cageCode"
                value={formData.cageCode}
                onChange={(e) => setFormData({ ...formData, cageCode: e.target.value })}
                placeholder="5-char CAGE"
                maxLength={5}
                data-testid="input-company-cage"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ueiNumber">UEI Number</Label>
              <Input
                id="ueiNumber"
                value={formData.ueiNumber}
                onChange={(e) => setFormData({ ...formData, ueiNumber: e.target.value })}
                placeholder="12-char UEI"
                maxLength={12}
                data-testid="input-company-uei"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="addressLine1">Address</Label>
            <Input
              id="addressLine1"
              value={formData.addressLine1}
              onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
              placeholder="Street address"
              data-testid="input-company-address"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                data-testid="input-company-city"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                maxLength={2}
                placeholder="XX"
                data-testid="input-company-state"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input
                id="zipCode"
                value={formData.zipCode}
                onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                data-testid="input-company-zip"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(555) 555-5555"
                data-testid="input-company-phone"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                placeholder="https://..."
                data-testid="input-company-website"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium mb-3">Primary Contact</h4>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="primaryContactName">Name</Label>
                <Input
                  id="primaryContactName"
                  value={formData.primaryContactName}
                  onChange={(e) => setFormData({ ...formData, primaryContactName: e.target.value })}
                  data-testid="input-contact-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primaryContactEmail">Email</Label>
                <Input
                  id="primaryContactEmail"
                  type="email"
                  value={formData.primaryContactEmail}
                  onChange={(e) => setFormData({ ...formData, primaryContactEmail: e.target.value })}
                  data-testid="input-contact-email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primaryContactPhone">Phone</Label>
                <Input
                  id="primaryContactPhone"
                  value={formData.primaryContactPhone}
                  onChange={(e) => setFormData({ ...formData, primaryContactPhone: e.target.value })}
                  data-testid="input-contact-phone"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Additional notes about this company..."
              rows={3}
              data-testid="input-company-notes"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !formData.name} data-testid="button-submit-company">
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Company
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CompanyDetailDialog({
  open,
  onOpenChange,
  company,
  activeTab,
  onTabChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: Company | null;
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  const { data: folders = [] } = useQuery<JacketFolder[]>({
    queryKey: ["/api/companies", company?.id, "folders"],
    enabled: !!company && activeTab === "folders",
  });

  const { data: timeline = [] } = useQuery<TimelineEntry[]>({
    queryKey: ["/api/companies", company?.id, "timeline"],
    enabled: !!company && activeTab === "timeline",
  });

  if (!company) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">{company.name}</DialogTitle>
              <DialogDescription>
                {company.type.charAt(0).toUpperCase() + company.type.slice(1)} •{" "}
                {company.city && company.state ? `${company.city}, ${company.state}` : "No location"}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex-none">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="folders" data-testid="tab-folders">Folders</TabsTrigger>
            <TabsTrigger value="timeline" data-testid="tab-timeline">Timeline</TabsTrigger>
            <TabsTrigger value="compliance" data-testid="tab-compliance">Compliance</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <TabsContent value="overview" className="p-4 space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Company Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {company.legalName && (
                      <div>
                        <div className="text-xs text-muted-foreground">Legal Name</div>
                        <div className="font-medium">{company.legalName}</div>
                      </div>
                    )}
                    {(company.addressLine1 || company.city) && (
                      <div>
                        <div className="text-xs text-muted-foreground">Address</div>
                        <div className="font-medium">
                          {company.addressLine1 && <div>{company.addressLine1}</div>}
                          {company.addressLine2 && <div>{company.addressLine2}</div>}
                          <div>
                            {[company.city, company.state, company.zipCode].filter(Boolean).join(", ")}
                          </div>
                        </div>
                      </div>
                    )}
                    {company.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span>{company.phone}</span>
                      </div>
                    )}
                    {company.website && (
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <a href={company.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                          {company.website}
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Primary Contact</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {company.primaryContactName ? (
                      <>
                        <div className="font-medium">{company.primaryContactName}</div>
                        {company.primaryContactEmail && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <a href={`mailto:${company.primaryContactEmail}`} className="text-primary hover:underline">
                              {company.primaryContactEmail}
                            </a>
                          </div>
                        )}
                        {company.primaryContactPhone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            {company.primaryContactPhone}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-muted-foreground text-sm">No contact on file</div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-muted-foreground">Federal IDs</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {company.cageCode && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">CAGE Code</span>
                        <span className="font-mono">{company.cageCode}</span>
                      </div>
                    )}
                    {company.ueiNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">UEI</span>
                        <span className="font-mono">{company.ueiNumber}</span>
                      </div>
                    )}
                    {company.dunsNumber && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">DUNS</span>
                        <span className="font-mono">{company.dunsNumber}</span>
                      </div>
                    )}
                    {company.ein && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">EIN</span>
                        <span className="font-mono">{company.ein}</span>
                      </div>
                    )}
                    {!company.cageCode && !company.ueiNumber && !company.dunsNumber && !company.ein && (
                      <div className="text-muted-foreground text-sm">No federal IDs on file</div>
                    )}
                  </CardContent>
                </Card>

                {company.notes && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{company.notes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="folders" className="p-4">
              {folders.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No folders created yet</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-3">
                  {folders.map((folder) => (
                    <Card key={folder.id} className="hover-elevate cursor-pointer">
                      <CardContent className="p-4 flex items-center gap-4">
                        <FolderOpen className="h-5 w-5 text-amber-500" />
                        <div className="flex-1">
                          <div className="font-medium">{folder.name}</div>
                          <div className="text-xs text-muted-foreground">{folder.path}</div>
                        </div>
                        <Badge variant="outline">{folder.documentCount || 0} docs</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="p-4">
              {timeline.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
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

            <TabsContent value="compliance" className="p-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Compliance Status</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5" />
                      <div>
                        <div className="font-medium">W-9 Form</div>
                        <div className="text-xs text-muted-foreground">Tax documentation</div>
                      </div>
                    </div>
                    {company.w9OnFile ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        On File
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Missing
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Shield className="h-5 w-5" />
                      <div>
                        <div className="font-medium">Insurance Certificate</div>
                        <div className="text-xs text-muted-foreground">
                          {company.insuranceExpiryDate
                            ? `Expires: ${new Date(company.insuranceExpiryDate).toLocaleDateString()}`
                            : "No expiry date set"}
                        </div>
                      </div>
                    </div>
                    {company.insuranceExpiryDate ? (
                      new Date(company.insuranceExpiryDate) > new Date() ? (
                        <Badge className="bg-emerald-500/10 text-emerald-500">
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Valid
                        </Badge>
                      ) : (
                        <Badge variant="destructive">Expired</Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Not Set
                      </Badge>
                    )}
                  </div>

                  {company.bondingCapacity && (
                    <div className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <Shield className="h-5 w-5" />
                        <div>
                          <div className="font-medium">Bonding Capacity</div>
                          <div className="text-xs text-muted-foreground">Surety bond limit</div>
                        </div>
                      </div>
                      <div className="font-medium">
                        ${Number(company.bondingCapacity).toLocaleString()}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
