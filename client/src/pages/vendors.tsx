import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Search,
  Building2,
  FileSignature,
  Clock,
  Star,
  Plus,
  Filter,
  RefreshCw,
  Eye,
  MoreHorizontal,
  FileText,
  Handshake,
  AlertTriangle,
  CheckCircle,
  Shield,
  Award,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface VendorStats {
  totalVendors: number;
  activeSubcontracts: number;
  pendingBids: number;
  avgPerformanceRating: number;
}

interface Vendor {
  id: string;
  vendorNumber: string;
  companyName: string;
  vendorType: string;
  status: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  insuranceExpiresAt: string | null;
  prequalificationStatus: string | null;
  performanceRating: number | null;
  safetyRating: number | null;
  qualityRating: number | null;
}

interface Subcontract {
  id: string;
  subcontractNumber: string;
  vendorId: string;
  vendorName: string;
  projectId: string;
  projectName: string;
  scopeDescription: string | null;
  contractAmount: number;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

interface SubcontractorBid {
  id: string;
  vendorId: string;
  vendorName: string;
  projectName: string | null;
  scopeDescription: string | null;
  bidAmount: number | null;
  status: string;
  submittedAt: string | null;
  expiresAt: string | null;
}

const mockStats: VendorStats = {
  totalVendors: 86,
  activeSubcontracts: 24,
  pendingBids: 12,
  avgPerformanceRating: 4.2,
};

const mockVendors: Vendor[] = [
  { id: "1", vendorNumber: "VND-001", companyName: "Metro Electric Services", vendorType: "subcontractor", status: "active", contactName: "John Martinez", email: "john@metroelectric.com", phone: "(443) 555-0101", insuranceExpiresAt: "2026-06-15", prequalificationStatus: "approved", performanceRating: 4.5, safetyRating: 4.8, qualityRating: 4.3 },
  { id: "2", vendorNumber: "VND-002", companyName: "ABC Building Supply", vendorType: "supplier", status: "active", contactName: "Sarah Chen", email: "sarah@abcsupply.com", phone: "(410) 555-0202", insuranceExpiresAt: "2026-03-20", prequalificationStatus: "approved", performanceRating: 4.2, safetyRating: null, qualityRating: 4.0 },
  { id: "3", vendorNumber: "VND-003", companyName: "Pro Plumbing Solutions", vendorType: "subcontractor", status: "active", contactName: "Mike Johnson", email: "mike@proplumbing.com", phone: "(301) 555-0303", insuranceExpiresAt: "2026-02-10", prequalificationStatus: "pending", performanceRating: 3.8, safetyRating: 4.0, qualityRating: 3.9 },
  { id: "4", vendorNumber: "VND-004", companyName: "Steel Solutions Inc", vendorType: "supplier", status: "active", contactName: "Robert Taylor", email: "rtaylor@steelsolutions.com", phone: "(202) 555-0404", insuranceExpiresAt: "2026-08-30", prequalificationStatus: "approved", performanceRating: 4.7, safetyRating: null, qualityRating: 4.6 },
  { id: "5", vendorNumber: "VND-005", companyName: "HVAC Specialists LLC", vendorType: "subcontractor", status: "active", contactName: "Lisa Brown", email: "lbrown@hvacspec.com", phone: "(410) 555-0505", insuranceExpiresAt: "2026-01-31", prequalificationStatus: "approved", performanceRating: 4.4, safetyRating: 4.5, qualityRating: 4.2 },
  { id: "6", vendorNumber: "VND-006", companyName: "Concrete Direct", vendorType: "supplier", status: "inactive", contactName: "James Wilson", email: "jwilson@concretedirect.com", phone: "(443) 555-0606", insuranceExpiresAt: "2025-12-15", prequalificationStatus: "expired", performanceRating: 3.5, safetyRating: null, qualityRating: 3.8 },
  { id: "7", vendorNumber: "VND-007", companyName: "FireStop Systems", vendorType: "subcontractor", status: "active", contactName: "Emily Davis", email: "edavis@firestop.com", phone: "(301) 555-0707", insuranceExpiresAt: "2026-05-22", prequalificationStatus: "approved", performanceRating: 4.6, safetyRating: 4.9, qualityRating: 4.5 },
  { id: "8", vendorNumber: "VND-008", companyName: "Lumber Yard Pro", vendorType: "supplier", status: "active", contactName: "David Lee", email: "dlee@lumberyardpro.com", phone: "(202) 555-0808", insuranceExpiresAt: "2026-07-01", prequalificationStatus: "approved", performanceRating: 4.1, safetyRating: null, qualityRating: 4.0 },
];

const mockSubcontracts: Subcontract[] = [
  { id: "1", subcontractNumber: "SC-2026-001", vendorId: "1", vendorName: "Metro Electric Services", projectId: "p1", projectName: "GSA HVAC Modernization", scopeDescription: "Complete electrical installation", contractAmount: 485000, status: "active", startDate: "2026-01-15", endDate: "2026-06-30" },
  { id: "2", subcontractNumber: "SC-2026-002", vendorId: "5", vendorName: "HVAC Specialists LLC", projectId: "p1", projectName: "GSA HVAC Modernization", scopeDescription: "HVAC system installation", contractAmount: 725000, status: "active", startDate: "2026-01-20", endDate: "2026-07-15" },
  { id: "3", subcontractNumber: "SC-2026-003", vendorId: "3", vendorName: "Pro Plumbing Solutions", projectId: "p2", projectName: "VA Hospital Phase 2", scopeDescription: "Plumbing rough-in and fixtures", contractAmount: 320000, status: "draft", startDate: "2026-02-01", endDate: "2026-05-31" },
  { id: "4", subcontractNumber: "SC-2025-045", vendorId: "7", vendorName: "FireStop Systems", projectId: "p3", projectName: "DoD Barracks Renovation", scopeDescription: "Fire suppression systems", contractAmount: 180000, status: "completed", startDate: "2025-08-01", endDate: "2025-12-15" },
  { id: "5", subcontractNumber: "SC-2026-004", vendorId: "1", vendorName: "Metro Electric Services", projectId: "p2", projectName: "VA Hospital Phase 2", scopeDescription: "Emergency power systems", contractAmount: 275000, status: "pending_signature", startDate: "2026-02-15", endDate: "2026-06-30" },
];

const mockBids: SubcontractorBid[] = [
  { id: "1", vendorId: "1", vendorName: "Metro Electric Services", projectName: "Border Facility Construction", scopeDescription: "Electrical infrastructure", bidAmount: 395000, status: "pending", submittedAt: "2026-01-20", expiresAt: "2026-02-20" },
  { id: "2", vendorId: "5", vendorName: "HVAC Specialists LLC", projectName: "Border Facility Construction", scopeDescription: "HVAC systems", bidAmount: 520000, status: "pending", submittedAt: "2026-01-22", expiresAt: "2026-02-22" },
  { id: "3", vendorId: "3", vendorName: "Pro Plumbing Solutions", projectName: "Military Base Infrastructure", scopeDescription: "Water and sewer systems", bidAmount: 285000, status: "under_review", submittedAt: "2026-01-18", expiresAt: "2026-02-18" },
  { id: "4", vendorId: "7", vendorName: "FireStop Systems", projectName: "VA Hospital Phase 2", scopeDescription: "Fire suppression expansion", bidAmount: 145000, status: "selected", submittedAt: "2026-01-10", expiresAt: "2026-02-10" },
  { id: "5", vendorId: "1", vendorName: "Metro Electric Services", projectName: "Federal Building Retrofit", scopeDescription: "LED lighting upgrade", bidAmount: 125000, status: "rejected", submittedAt: "2026-01-05", expiresAt: "2026-02-05" },
];

export default function Vendors() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [prequalFilter, setPrequalFilter] = useState("all");
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [addSubcontractOpen, setAddSubcontractOpen] = useState(false);
  const [newVendor, setNewVendor] = useState({
    vendorNumber: "",
    name: "",
    vendorType: "subcontractor",
    contactName: "",
    email: "",
    phone: "",
  });
  const [newSubcontract, setNewSubcontract] = useState({
    subcontractNumber: "",
    projectId: "",
    vendorId: "",
    scopeDescription: "",
    contractAmount: "",
    startDate: "",
    endDate: "",
  });
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const createVendorMutation = useMutation({
    mutationFn: async (data: typeof newVendor) => {
      return apiRequest("POST", "/api/vendors", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/stats"] });
      toast({
        title: "Vendor Added",
        description: "New vendor has been successfully registered.",
      });
      setAddVendorOpen(false);
      setNewVendor({ vendorNumber: "", name: "", vendorType: "subcontractor", contactName: "", email: "", phone: "" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add vendor. Please try again.",
        variant: "destructive",
      });
    },
  });

  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery<VendorStats>({
    queryKey: ["/api/vendors/stats"],
  });

  const handleRefresh = () => {
    refetchStats();
    refetchVendors();
    toast({
      title: "Vendors Refreshed",
      description: "Vendor data has been updated.",
    });
  };

  const handleAddVendor = () => {
    const nextNum = (displayVendors.length + 1).toString().padStart(3, "0");
    setNewVendor({ ...newVendor, vendorNumber: `VND-${nextNum}` });
    setAddVendorOpen(true);
  };

  const handleSubmitVendor = () => {
    if (!newVendor.vendorNumber || !newVendor.name) {
      toast({
        title: "Validation Error",
        description: "Vendor number and company name are required.",
        variant: "destructive",
      });
      return;
    }
    createVendorMutation.mutate(newVendor);
  };

  const createSubcontractMutation = useMutation({
    mutationFn: async (data: typeof newSubcontract) => {
      return apiRequest("POST", "/api/vendors/subcontracts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendors/subcontracts"] });
      toast({ title: "Subcontract Created", description: "New subcontract has been registered." });
      setAddSubcontractOpen(false);
      setNewSubcontract({ subcontractNumber: "", projectId: "", vendorId: "", scopeDescription: "", contractAmount: "", startDate: "", endDate: "" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create subcontract.", variant: "destructive" });
    },
  });

  const handleCreateSubcontract = () => {
    const nextNum = ((subcontracts?.length ?? 0) + 1).toString().padStart(3, "0");
    setNewSubcontract({ ...newSubcontract, subcontractNumber: `SC-${nextNum}` });
    setAddSubcontractOpen(true);
  };

  const handleSubmitSubcontract = () => {
    if (!newSubcontract.subcontractNumber || !newSubcontract.vendorId || !newSubcontract.contractAmount) {
      toast({ title: "Validation Error", description: "Subcontract number, vendor, and amount are required.", variant: "destructive" });
      return;
    }
    createSubcontractMutation.mutate(newSubcontract);
  };

  const { data: vendors, isLoading: vendorsLoading, refetch: refetchVendors } = useQuery<Vendor[]>({
    queryKey: ["/api/vendors"],
  });

  const { data: subcontracts, isLoading: subcontractsLoading } = useQuery<Subcontract[]>({
    queryKey: ["/api/vendors/subcontracts"],
  });

  const { data: bids, isLoading: bidsLoading } = useQuery<SubcontractorBid[]>({
    queryKey: ["/api/vendors/subcontractor-bids"],
  });

  const displayStats = stats || mockStats;
  const displayVendors = vendors || mockVendors;
  const displaySubcontracts = subcontracts || mockSubcontracts;
  const displayBids = bids || mockBids;

  const filteredVendors = displayVendors.filter((vendor) => {
    const matchesSearch = vendor.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      vendor.vendorNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (vendor.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    
    const matchesType = typeFilter === "all" || vendor.vendorType === typeFilter;
    const matchesStatus = statusFilter === "all" || vendor.status === statusFilter;
    const matchesPrequal = prequalFilter === "all" || vendor.prequalificationStatus === prequalFilter;
    
    let matchesTab = true;
    if (selectedTab === "subcontractors") {
      matchesTab = vendor.vendorType === "subcontractor";
    } else if (selectedTab === "suppliers") {
      matchesTab = vendor.vendorType === "supplier";
    }
    
    return matchesSearch && matchesType && matchesStatus && matchesPrequal && matchesTab;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">Active</Badge>;
      case "inactive":
        return <Badge variant="secondary">Inactive</Badge>;
      case "pending":
        return <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">Pending</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "completed":
        return <Badge variant="default" className="bg-blue-500/20 text-blue-400 border-blue-500/30">Completed</Badge>;
      case "pending_signature":
        return <Badge variant="outline" className="border-orange-500/50 text-orange-400">Pending Signature</Badge>;
      case "under_review":
        return <Badge variant="outline" className="border-purple-500/50 text-purple-400">Under Review</Badge>;
      case "selected":
        return <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">Selected</Badge>;
      case "rejected":
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPrequalBadge = (status: string | null) => {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-green-500/20 text-green-400 border-green-500/30">Approved</Badge>;
      case "pending":
        return <Badge variant="outline" className="border-yellow-500/50 text-yellow-400">Pending</Badge>;
      case "expired":
        return <Badge variant="destructive">Expired</Badge>;
      default:
        return <Badge variant="secondary">N/A</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "subcontractor":
        return <Badge variant="outline">Subcontractor</Badge>;
      case "supplier":
        return <Badge variant="secondary">Supplier</Badge>;
      default:
        return <Badge variant="outline">{type}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const isInsuranceExpiringSoon = (dateString: string | null) => {
    if (!dateString) return false;
    const expiryDate = new Date(dateString);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  };

  const isInsuranceExpired = (dateString: string | null) => {
    if (!dateString) return false;
    return new Date(dateString) < new Date();
  };

  const getRatingDisplay = (rating: number | null) => {
    if (rating === null) return <span className="text-muted-foreground">—</span>;
    const color = rating >= 4.5 ? "text-green-400" : rating >= 4.0 ? "text-yellow-400" : rating >= 3.5 ? "text-orange-400" : "text-red-400";
    return <span className={color}>{rating.toFixed(1)}</span>;
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="text-page-title">Vendors & Subcontractors</h1>
          <p className="text-muted-foreground">Manage vendors, subcontractors, and subcontracts</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} data-testid="button-refresh-vendors">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleAddVendor} data-testid="button-add-vendor">
            <Plus className="mr-2 h-4 w-4" />
            Add Vendor
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-total-vendors">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Vendors</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-total-vendors">{displayStats.totalVendors}</div>
                <p className="text-xs text-muted-foreground">Registered vendors</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-active-subcontracts">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Subcontracts</CardTitle>
            <FileSignature className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-active-subcontracts">{displayStats.activeSubcontracts}</div>
                <p className="text-xs text-muted-foreground">Current contracts</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-pending-bids">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Bids</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-pending-bids">{displayStats.pendingBids}</div>
                <p className="text-xs text-muted-foreground">Awaiting review</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-avg-rating">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Performance Rating</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold" data-testid="text-avg-rating">{displayStats.avgPerformanceRating.toFixed(1)}</div>
                <p className="text-xs text-muted-foreground">Out of 5.0</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <TabsList data-testid="tabs-vendor-list">
            <TabsTrigger value="all" data-testid="tab-all-vendors">All Vendors</TabsTrigger>
            <TabsTrigger value="subcontractors" data-testid="tab-subcontractors">Subcontractors</TabsTrigger>
            <TabsTrigger value="suppliers" data-testid="tab-suppliers">Suppliers</TabsTrigger>
            <TabsTrigger value="subcontracts" data-testid="tab-subcontracts">Subcontracts</TabsTrigger>
          </TabsList>

          {selectedTab !== "subcontracts" && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-64"
                  data-testid="input-search-vendors"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <Select value={prequalFilter} onValueChange={setPrequalFilter}>
                <SelectTrigger className="w-40" data-testid="select-prequal-filter">
                  <SelectValue placeholder="Prequalification" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Prequal</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <TabsContent value="all" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor #</TableHead>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Insurance Expires</TableHead>
                    <TableHead>Prequal</TableHead>
                    <TableHead className="text-center">Perf</TableHead>
                    <TableHead className="text-center">Safety</TableHead>
                    <TableHead className="text-center">Quality</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 11 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredVendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        No vendors found matching your criteria
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendors.map((vendor) => (
                      <TableRow key={vendor.id} data-testid={`row-vendor-${vendor.id}`} className="cursor-pointer" onClick={() => setLocation(`/entity/vendor/${vendor.id}`)}>
                        <TableCell className="font-mono text-sm">{vendor.vendorNumber}</TableCell>
                        <TableCell className="font-medium">{vendor.companyName}</TableCell>
                        <TableCell>{getTypeBadge(vendor.vendorType)}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{vendor.contactName || "—"}</div>
                            <div className="text-muted-foreground text-xs">{vendor.email || ""}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(vendor.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isInsuranceExpired(vendor.insuranceExpiresAt) ? (
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            ) : isInsuranceExpiringSoon(vendor.insuranceExpiresAt) ? (
                              <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            ) : (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                            <span className={
                              isInsuranceExpired(vendor.insuranceExpiresAt) ? "text-red-400" :
                              isInsuranceExpiringSoon(vendor.insuranceExpiresAt) ? "text-yellow-400" : ""
                            }>
                              {formatDate(vendor.insuranceExpiresAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getPrequalBadge(vendor.prequalificationStatus)}</TableCell>
                        <TableCell className="text-center">{getRatingDisplay(vendor.performanceRating)}</TableCell>
                        <TableCell className="text-center">{getRatingDisplay(vendor.safetyRating)}</TableCell>
                        <TableCell className="text-center">{getRatingDisplay(vendor.qualityRating)}</TableCell>
                        <TableCell>
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" data-testid={`button-vendor-actions-${vendor.id}`}>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem data-testid={`action-view-details-${vendor.id}`} onClick={() => setLocation(`/entity/vendor/${vendor.id}`)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem data-testid={`action-request-quote-${vendor.id}`}>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Request Quote
                                </DropdownMenuItem>
                                <DropdownMenuItem data-testid={`action-create-subcontract-${vendor.id}`}>
                                  <Handshake className="mr-2 h-4 w-4" />
                                  Create Subcontract
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subcontractors" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor #</TableHead>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Insurance Expires</TableHead>
                    <TableHead>Prequal</TableHead>
                    <TableHead className="text-center">Perf</TableHead>
                    <TableHead className="text-center">Safety</TableHead>
                    <TableHead className="text-center">Quality</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 11 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredVendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                        No subcontractors found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendors.map((vendor) => (
                      <TableRow key={vendor.id} data-testid={`row-subcontractor-${vendor.id}`} className="cursor-pointer" onClick={() => setLocation(`/entity/vendor/${vendor.id}`)}>
                        <TableCell className="font-mono text-sm">{vendor.vendorNumber}</TableCell>
                        <TableCell className="font-medium">{vendor.companyName}</TableCell>
                        <TableCell>{getTypeBadge(vendor.vendorType)}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{vendor.contactName || "—"}</div>
                            <div className="text-muted-foreground text-xs">{vendor.email || ""}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(vendor.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isInsuranceExpired(vendor.insuranceExpiresAt) ? (
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            ) : isInsuranceExpiringSoon(vendor.insuranceExpiresAt) ? (
                              <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            ) : (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                            <span className={
                              isInsuranceExpired(vendor.insuranceExpiresAt) ? "text-red-400" :
                              isInsuranceExpiringSoon(vendor.insuranceExpiresAt) ? "text-yellow-400" : ""
                            }>
                              {formatDate(vendor.insuranceExpiresAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getPrequalBadge(vendor.prequalificationStatus)}</TableCell>
                        <TableCell className="text-center">{getRatingDisplay(vendor.performanceRating)}</TableCell>
                        <TableCell className="text-center">{getRatingDisplay(vendor.safetyRating)}</TableCell>
                        <TableCell className="text-center">{getRatingDisplay(vendor.qualityRating)}</TableCell>
                        <TableCell>
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setLocation(`/entity/vendor/${vendor.id}`)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Request Quote
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Handshake className="mr-2 h-4 w-4" />
                                  Create Subcontract
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor #</TableHead>
                    <TableHead>Company Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Insurance Expires</TableHead>
                    <TableHead>Prequal</TableHead>
                    <TableHead className="text-center">Perf</TableHead>
                    <TableHead className="text-center">Quality</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendorsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 10 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredVendors.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                        No suppliers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredVendors.map((vendor) => (
                      <TableRow key={vendor.id} data-testid={`row-supplier-${vendor.id}`} className="cursor-pointer" onClick={() => setLocation(`/entity/vendor/${vendor.id}`)}>
                        <TableCell className="font-mono text-sm">{vendor.vendorNumber}</TableCell>
                        <TableCell className="font-medium">{vendor.companyName}</TableCell>
                        <TableCell>{getTypeBadge(vendor.vendorType)}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <div>{vendor.contactName || "—"}</div>
                            <div className="text-muted-foreground text-xs">{vendor.email || ""}</div>
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(vendor.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isInsuranceExpired(vendor.insuranceExpiresAt) ? (
                              <AlertTriangle className="h-3 w-3 text-red-500" />
                            ) : isInsuranceExpiringSoon(vendor.insuranceExpiresAt) ? (
                              <AlertTriangle className="h-3 w-3 text-yellow-500" />
                            ) : (
                              <CheckCircle className="h-3 w-3 text-green-500" />
                            )}
                            <span className={
                              isInsuranceExpired(vendor.insuranceExpiresAt) ? "text-red-400" :
                              isInsuranceExpiringSoon(vendor.insuranceExpiresAt) ? "text-yellow-400" : ""
                            }>
                              {formatDate(vendor.insuranceExpiresAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{getPrequalBadge(vendor.prequalificationStatus)}</TableCell>
                        <TableCell className="text-center">{getRatingDisplay(vendor.performanceRating)}</TableCell>
                        <TableCell className="text-center">{getRatingDisplay(vendor.qualityRating)}</TableCell>
                        <TableCell>
                          <div onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setLocation(`/entity/vendor/${vendor.id}`)}>
                                  <Eye className="mr-2 h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <FileText className="mr-2 h-4 w-4" />
                                  Request Quote
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="subcontracts" className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search subcontracts..."
                className="pl-8 w-64"
                data-testid="input-search-subcontracts"
              />
            </div>
            <Button size="sm" onClick={handleCreateSubcontract} data-testid="button-create-subcontract">
              <Plus className="mr-2 h-4 w-4" />
              Create Subcontract
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subcontract #</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {subcontractsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 9 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : displaySubcontracts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No subcontracts found
                      </TableCell>
                    </TableRow>
                  ) : (
                    displaySubcontracts.map((subcontract) => (
                      <TableRow key={subcontract.id} data-testid={`row-subcontract-${subcontract.id}`}>
                        <TableCell className="font-mono text-sm">{subcontract.subcontractNumber}</TableCell>
                        <TableCell className="font-medium">{subcontract.vendorName}</TableCell>
                        <TableCell>{subcontract.projectName}</TableCell>
                        <TableCell className="max-w-xs truncate">{subcontract.scopeDescription || "—"}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(subcontract.contractAmount)}</TableCell>
                        <TableCell>{getStatusBadge(subcontract.status)}</TableCell>
                        <TableCell>{formatDate(subcontract.startDate)}</TableCell>
                        <TableCell>{formatDate(subcontract.endDate)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-subcontract-actions-${subcontract.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" />
                                View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <FileText className="mr-2 h-4 w-4" />
                                View Contract
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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Subcontractor Bids
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Scope</TableHead>
                    <TableHead className="text-right">Bid Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bidsLoading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : displayBids.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No pending bids
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayBids.map((bid) => (
                      <TableRow key={bid.id} data-testid={`row-bid-${bid.id}`}>
                        <TableCell className="font-medium">{bid.vendorName}</TableCell>
                        <TableCell>{bid.projectName || "—"}</TableCell>
                        <TableCell className="max-w-xs truncate">{bid.scopeDescription || "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {bid.bidAmount ? formatCurrency(bid.bidAmount) : "—"}
                        </TableCell>
                        <TableCell>{getStatusBadge(bid.status)}</TableCell>
                        <TableCell>{formatDate(bid.submittedAt)}</TableCell>
                        <TableCell>{formatDate(bid.expiresAt)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-bid-actions-${bid.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="mr-2 h-4 w-4" />
                                Review Bid
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Award className="mr-2 h-4 w-4" />
                                Select Bid
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
      </Tabs>

      <Dialog open={addVendorOpen} onOpenChange={setAddVendorOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add New Vendor</DialogTitle>
            <DialogDescription>
              Register a new vendor or subcontractor in the system.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="vendorNumber" className="text-right">
                Vendor #
              </Label>
              <Input
                id="vendorNumber"
                value={newVendor.vendorNumber}
                onChange={(e) => setNewVendor({ ...newVendor, vendorNumber: e.target.value })}
                className="col-span-3"
                data-testid="input-vendor-number"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Company Name
              </Label>
              <Input
                id="name"
                value={newVendor.name}
                onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
                className="col-span-3"
                placeholder="Enter company name"
                data-testid="input-vendor-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="vendorType" className="text-right">
                Type
              </Label>
              <Select 
                value={newVendor.vendorType} 
                onValueChange={(value) => setNewVendor({ ...newVendor, vendorType: value })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-vendor-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="subcontractor">Subcontractor</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="contactName" className="text-right">
                Contact Name
              </Label>
              <Input
                id="contactName"
                value={newVendor.contactName}
                onChange={(e) => setNewVendor({ ...newVendor, contactName: e.target.value })}
                className="col-span-3"
                placeholder="Primary contact"
                data-testid="input-contact-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="email" className="text-right">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={newVendor.email}
                onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
                className="col-span-3"
                placeholder="contact@company.com"
                data-testid="input-vendor-email"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="phone" className="text-right">
                Phone
              </Label>
              <Input
                id="phone"
                type="tel"
                value={newVendor.phone}
                onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
                className="col-span-3"
                placeholder="(555) 555-5555"
                data-testid="input-vendor-phone"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddVendorOpen(false)} data-testid="button-cancel-vendor">
              Cancel
            </Button>
            <Button 
              onClick={handleSubmitVendor} 
              disabled={createVendorMutation.isPending}
              data-testid="button-submit-vendor"
            >
              {createVendorMutation.isPending ? "Adding..." : "Add Vendor"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addSubcontractOpen} onOpenChange={setAddSubcontractOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Subcontract</DialogTitle>
            <DialogDescription>
              Register a new subcontract with a vendor.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="subcontractNumber" className="text-right">Number</Label>
              <Input
                id="subcontractNumber"
                value={newSubcontract.subcontractNumber}
                onChange={(e) => setNewSubcontract({ ...newSubcontract, subcontractNumber: e.target.value })}
                className="col-span-3"
                data-testid="input-subcontract-number"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="vendorId" className="text-right">Vendor</Label>
              <Select
                value={newSubcontract.vendorId}
                onValueChange={(v) => setNewSubcontract({ ...newSubcontract, vendorId: v })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-subcontract-vendor">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  {displayVendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.companyName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="projectId" className="text-right">Project ID</Label>
              <Input
                id="projectId"
                value={newSubcontract.projectId}
                onChange={(e) => setNewSubcontract({ ...newSubcontract, projectId: e.target.value })}
                className="col-span-3"
                placeholder="e.g., PRJ-001"
                data-testid="input-subcontract-project"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="contractAmount" className="text-right">Amount</Label>
              <Input
                id="contractAmount"
                value={newSubcontract.contractAmount}
                onChange={(e) => setNewSubcontract({ ...newSubcontract, contractAmount: e.target.value })}
                className="col-span-3"
                placeholder="e.g., 150000"
                data-testid="input-subcontract-amount"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="scopeDescription" className="text-right">Scope</Label>
              <Input
                id="scopeDescription"
                value={newSubcontract.scopeDescription}
                onChange={(e) => setNewSubcontract({ ...newSubcontract, scopeDescription: e.target.value })}
                className="col-span-3"
                placeholder="Description of work"
                data-testid="input-subcontract-scope"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="startDate" className="text-right">Start</Label>
              <Input
                id="startDate"
                type="date"
                value={newSubcontract.startDate}
                onChange={(e) => setNewSubcontract({ ...newSubcontract, startDate: e.target.value })}
                className="col-span-3"
                data-testid="input-subcontract-start"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="endDate" className="text-right">End</Label>
              <Input
                id="endDate"
                type="date"
                value={newSubcontract.endDate}
                onChange={(e) => setNewSubcontract({ ...newSubcontract, endDate: e.target.value })}
                className="col-span-3"
                data-testid="input-subcontract-end"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddSubcontractOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitSubcontract} 
              disabled={createSubcontractMutation.isPending}
              data-testid="button-submit-subcontract"
            >
              {createSubcontractMutation.isPending ? "Creating..." : "Create Subcontract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
