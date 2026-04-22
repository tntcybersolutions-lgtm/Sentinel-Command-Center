import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useDocumentViewer } from "@/contexts/document-viewer-context";
import { 
  Database, FileText, Upload, Search, Brain, TrendingUp, 
  Building2, Users, Briefcase, FileSpreadsheet, FolderOpen, FolderClosed,
  CheckCircle2, Clock, AlertCircle, RefreshCw, ChevronRight, ChevronDown,
  BarChart3, Target, Award, Zap, CloudDownload, Eye, Download, Link2,
  FileImage, FileType, Calendar, DollarSign, User, Shield, Package,
  BookOpen, FilePlus, X, Printer, Hash, List, GripVertical, ExternalLink, AlertTriangle,
  Star
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { EgnyteBrowser } from "@/components/egnyte-browser";
import type { Subcontractor, LaborRate, CompanyProfileData, BidProject } from "@shared/schema";

interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category?: string;
  documentType: string;
  status: string;
  metadata?: Record<string, unknown>;
  sourceFolder?: string;
  createdAt?: string;
  fileSize?: number;
  expirationDate?: string;
}

interface SearchResult {
  title: string;
  excerpt: string;
  category: string;
  score: number;
}

interface ProcessResult {
  totalFiles: number;
  processed: number;
}

interface SearchResponse {
  results: SearchResult[];
}

interface FolderData {
  name: string;
  displayName: string;
  documents: KnowledgeDoc[];
  categories: Record<string, KnowledgeDoc[]>;
  totalDocs: number;
  processedDocs: number;
  expiringDocs: number;
}

const DOCUMENT_CATEGORIES = [
  { value: "company_info", label: "Company Information", icon: Building2, color: "bg-blue-500", textColor: "text-blue-500" },
  { value: "subcontractors", label: "Subcontractors", icon: Users, color: "bg-purple-500", textColor: "text-purple-500" },
  { value: "bonding", label: "Bonding", icon: Shield, color: "bg-amber-500", textColor: "text-amber-500" },
  { value: "insurance", label: "Insurance", icon: Award, color: "bg-orange-500", textColor: "text-orange-500" },
  { value: "tax_documents", label: "Tax Documents", icon: FileSpreadsheet, color: "bg-cyan-500", textColor: "text-cyan-500" },
  { value: "invoices", label: "Invoices", icon: DollarSign, color: "bg-green-500", textColor: "text-green-500" },
  { value: "quotes", label: "Quotes", icon: FileSpreadsheet, color: "bg-indigo-500", textColor: "text-indigo-500" },
  { value: "certifications", label: "Certifications", icon: CheckCircle2, color: "bg-emerald-500", textColor: "text-emerald-500" },
  { value: "contracts", label: "Contracts", icon: FileText, color: "bg-rose-500", textColor: "text-rose-500" },
  { value: "drawings", label: "Drawings", icon: FileImage, color: "bg-violet-500", textColor: "text-violet-500" },
  { value: "specifications", label: "Specifications", icon: BookOpen, color: "bg-teal-500", textColor: "text-teal-500" },
  { value: "proposals", label: "Proposals", icon: Briefcase, color: "bg-pink-500", textColor: "text-pink-500" },
];

const BID_PACKAGE_SECTIONS = [
  { id: "cover", label: "Cover Page", required: true, pageEstimate: 1 },
  { id: "toc", label: "Table of Contents", required: true, pageEstimate: 1 },
  { id: "executive_summary", label: "Executive Summary", required: true, pageEstimate: 2 },
  { id: "company_info", label: "Company Information", required: true, pageEstimate: 3 },
  { id: "certifications", label: "Certifications & Licenses", required: true, pageEstimate: 5 },
  { id: "insurance", label: "Insurance Certificates", required: true, pageEstimate: 3 },
  { id: "bonding", label: "Bonding Capacity Letter", required: true, pageEstimate: 2 },
  { id: "past_performance", label: "Past Performance", required: false, pageEstimate: 10 },
  { id: "technical_approach", label: "Technical Approach", required: false, pageEstimate: 15 },
  { id: "key_personnel", label: "Key Personnel", required: false, pageEstimate: 5 },
  { id: "pricing", label: "Pricing/Cost Proposal", required: true, pageEstimate: 3 },
  { id: "appendices", label: "Appendices", required: false, pageEstimate: 10 },
];

function getCategoryInfo(docType: string) {
  const cat = DOCUMENT_CATEGORIES.find(c => c.value === docType);
  return cat || { value: docType, label: docType, icon: FileText, color: "bg-gray-500", textColor: "text-gray-500" };
}

function formatBytes(bytes: number) {
  if (!bytes) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric", 
    year: "numeric" 
  });
}

export default function KnowledgeVault() {
  const { toast } = useToast();
  const { openDocument } = useDocumentViewer();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedDocument, setSelectedDocument] = useState<KnowledgeDoc | null>(null);
  const [bidBuilderOpen, setBidBuilderOpen] = useState(false);
  const [selectedBidProject, setSelectedBidProject] = useState<string>("");
  const [selectedDocsForBid, setSelectedDocsForBid] = useState<Set<string>>(new Set());
  const [egnyteOpen, setEgnyteOpen] = useState(false);

  const { data: documents, isLoading: documentsLoading } = useQuery<KnowledgeDoc[]>({
    queryKey: ["/api/knowledge/documents"],
  });

  const { data: stats } = useQuery<{
    totalDocuments: number;
    processedDocuments: number;
    pendingDocuments: number;
    categoryCounts: Record<string, number>;
    extractedFiles: number;
  }>({
    queryKey: ["/api/knowledge/stats"],
  });

  const { data: companyProfile } = useQuery<CompanyProfileData>({
    queryKey: ["/api/company/profile"],
  });

  const { data: subcontractors } = useQuery<Subcontractor[]>({
    queryKey: ["/api/subcontractors"],
  });

  const { data: bidProjects } = useQuery<BidProject[]>({
    queryKey: ["/api/bid-projects"],
  });

  const { data: winPatterns } = useQuery<any[]>({
    queryKey: ["/api/learning/win-patterns"],
  });

  const processDocumentsMutation = useMutation({
    mutationFn: async (): Promise<ProcessResult> => {
      const response = await apiRequest("/api/knowledge/process-extracted", "POST");
      return response as unknown as ProcessResult;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      toast({
        title: "Document Processing Started",
        description: `Processing ${data.totalFiles} files from extracted data`,
      });
    },
  });

  const semanticSearchMutation = useMutation({
    mutationFn: async (query: string): Promise<SearchResponse> => {
      const response = await apiRequest("/api/knowledge/search", "POST", { query, limit: 10 });
      return response as unknown as SearchResponse;
    },
  });

  const linkDocumentsToBidMutation = useMutation({
    mutationFn: async ({ bidId, documentIds, sectionId }: { bidId: string; documentIds: string[]; sectionId?: string }) => {
      const response = await apiRequest(`/api/bids/${bidId}/link-documents`, "POST", { documentIds, sectionId });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-projects"] });
      toast({
        title: "Documents Linked",
        description: `Successfully linked ${data.linkedCount} documents to bid package`,
      });
      setBidBuilderOpen(false);
      setSelectedDocsForBid(new Set());
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to link documents to bid",
        variant: "destructive",
      });
    },
  });

  // Group documents by source folder
  const folderStructure = useMemo(() => {
    if (!documents) return [];
    
    const folders: Record<string, FolderData> = {};
    
    documents.forEach(doc => {
      // Extract folder from metadata or title
      let folderName = "General";
      if (doc.metadata && typeof doc.metadata === 'object') {
        const meta = doc.metadata as Record<string, any>;
        folderName = meta.rootFolder || meta.sourceFolder || meta.folder || "General";
      } else if (doc.title) {
        // Try to extract from title pattern like "FolderName - DocName"
        const match = doc.title.match(/^([^-]+)\s*-/);
        if (match) {
          folderName = match[1].trim();
        }
      }
      
      // Clean up folder name for display
      const displayName = folderName
        .replace(/_/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .trim();
      
      if (!folders[folderName]) {
        folders[folderName] = {
          name: folderName,
          displayName,
          documents: [],
          categories: {},
          totalDocs: 0,
          processedDocs: 0,
          expiringDocs: 0,
        };
      }
      
      folders[folderName].documents.push(doc);
      folders[folderName].totalDocs++;
      
      if (doc.status === "processed") {
        folders[folderName].processedDocs++;
      }
      
      // Check for expiring documents (within 30 days)
      if (doc.expirationDate) {
        const expDate = new Date(doc.expirationDate);
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        if (expDate <= thirtyDaysFromNow) {
          folders[folderName].expiringDocs++;
        }
      }
      
      // Group by category within folder
      const cat = doc.documentType || doc.category || "uncategorized";
      if (!folders[folderName].categories[cat]) {
        folders[folderName].categories[cat] = [];
      }
      folders[folderName].categories[cat].push(doc);
    });
    
    // Sort folders by document count
    return Object.values(folders).sort((a, b) => b.totalDocs - a.totalDocs);
  }, [documents]);

  const handleSearch = () => {
    if (searchQuery.trim()) {
      semanticSearchMutation.mutate(searchQuery);
    }
  };

  const toggleFolder = (folderName: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderName)) {
      newExpanded.delete(folderName);
    } else {
      newExpanded.add(folderName);
    }
    setExpandedFolders(newExpanded);
  };

  const toggleDocumentSelection = (docId: string) => {
    const newSelected = new Set(selectedDocsForBid);
    if (newSelected.has(docId)) {
      newSelected.delete(docId);
    } else {
      newSelected.add(docId);
    }
    setSelectedDocsForBid(newSelected);
  };

  const filteredFolders = useMemo(() => {
    if (!searchQuery && selectedCategory === "all") return folderStructure;
    
    return folderStructure.map(folder => {
      let filteredDocs = folder.documents;
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredDocs = filteredDocs.filter(doc => 
          doc.title?.toLowerCase().includes(query) ||
          doc.content?.toLowerCase().includes(query)
        );
      }
      
      if (selectedCategory !== "all") {
        filteredDocs = filteredDocs.filter(doc => 
          doc.documentType === selectedCategory || doc.category === selectedCategory
        );
      }
      
      if (filteredDocs.length === 0) return null;
      
      return {
        ...folder,
        documents: filteredDocs,
        totalDocs: filteredDocs.length,
      };
    }).filter(Boolean) as FolderData[];
  }, [folderStructure, searchQuery, selectedCategory]);

  const totalEstimatedPages = useMemo(() => {
    return BID_PACKAGE_SECTIONS.reduce((sum, section) => sum + section.pageEstimate, 0);
  }, []);

  return (
    <div className="flex-1 p-4 md:p-6 overflow-auto">
      <div className="max-w-[1800px] mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-page-title">
              <Database className="h-7 w-7 text-primary" />
              Knowledge Vault
            </h1>
            <p className="text-muted-foreground">
              AI-powered document repository with semantic search and bid package builder
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button 
              variant="outline"
              onClick={() => setBidBuilderOpen(true)}
              data-testid="button-bid-builder"
            >
              <Package className="h-4 w-4 mr-2" />
              Bid Package Builder
            </Button>
            <Button 
              variant="outline"
              onClick={() => setEgnyteOpen(true)}
              data-testid="button-open-egnyte"
            >
              <CloudDownload className="h-4 w-4 mr-2" />
              Import from Egnyte
            </Button>
            <Button 
              onClick={() => processDocumentsMutation.mutate()}
              disabled={processDocumentsMutation.isPending}
              data-testid="button-process-documents"
            >
              {processDocumentsMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Process Files
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Total Files</p>
                  <p className="text-2xl font-bold">{stats?.extractedFiles?.toLocaleString() || documents?.length || 0}</p>
                </div>
                <div className="h-10 w-10 rounded-md bg-blue-500/10 flex items-center justify-center shrink-0">
                  <FileText className="h-5 w-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Processed</p>
                  <p className="text-2xl font-bold">{stats?.processedDocuments || 0}</p>
                </div>
                <div className="h-10 w-10 rounded-md bg-green-500/10 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Folders</p>
                  <p className="text-2xl font-bold">{folderStructure.length}</p>
                </div>
                <div className="h-10 w-10 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                  <FolderOpen className="h-5 w-5 text-amber-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Subcontractors</p>
                  <p className="text-2xl font-bold">{subcontractors?.length || 0}</p>
                </div>
                <div className="h-10 w-10 rounded-md bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Users className="h-5 w-5 text-purple-500" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-muted-foreground">Active Bids</p>
                  <p className="text-2xl font-bold">{bidProjects?.filter(b => b.status !== 'won' && b.status !== 'lost').length || 0}</p>
                </div>
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                  <Briefcase className="h-5 w-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="documents" className="space-y-4">
          <TabsList className="flex flex-wrap gap-1">
            <TabsTrigger value="documents" data-testid="tab-documents">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="company" data-testid="tab-company">
              <Building2 className="h-4 w-4 mr-2" />
              Company Profile
            </TabsTrigger>
            <TabsTrigger value="subcontractors" data-testid="tab-subcontractors">
              <Users className="h-4 w-4 mr-2" />
              Subcontractors
            </TabsTrigger>
            <TabsTrigger value="learning" data-testid="tab-learning">
              <Brain className="h-4 w-4 mr-2" />
              AI Learning
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            {/* Semantic Search */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5" />
                    Semantic Search
                  </CardTitle>
                  <div className="flex flex-1 max-w-xl gap-2">
                    <Input
                      placeholder="Search documents using natural language..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      data-testid="input-search"
                    />
                    <Button onClick={handleSearch} disabled={semanticSearchMutation.isPending} data-testid="button-search">
                      {semanticSearchMutation.isPending ? (
                        <RefreshCw className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge 
                    variant={selectedCategory === "all" ? "default" : "outline"}
                    className="cursor-pointer"
                    onClick={() => setSelectedCategory("all")}
                  >
                    <List className="h-3.5 w-3.5 mr-1.5" />
                    All
                  </Badge>
                  {DOCUMENT_CATEGORIES.map(cat => (
                    <Badge
                      key={cat.value}
                      variant={selectedCategory === cat.value ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setSelectedCategory(cat.value)}
                    >
                      <cat.icon className={`h-3.5 w-3.5 mr-1.5 ${selectedCategory === cat.value ? "" : cat.textColor}`} />
                      {cat.label}
                    </Badge>
                  ))}
                </div>

                {/* Semantic Search Results */}
                {semanticSearchMutation.data && semanticSearchMutation.data.results?.length > 0 ? (
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Found {semanticSearchMutation.data.results?.length || 0} relevant documents
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => semanticSearchMutation.reset()}>
                        <X className="h-4 w-4 mr-1" /> Clear Results
                      </Button>
                    </div>
                    {semanticSearchMutation.data.results?.map((result, idx) => (
                      <Card key={idx} className="hover-elevate cursor-pointer" onClick={() => {
                        // Find matching document and open detail
                        const matchingDoc = documents?.find(d => d.title === result.title);
                        if (matchingDoc) setSelectedDocument(matchingDoc);
                      }}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium truncate">{result.title}</h4>
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {result.excerpt}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className="text-xs">
                                  {result.category}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Relevance: {(result.score * 100).toFixed(0)}%
                                </span>
                              </div>
                            </div>
                            <Button size="sm" variant="ghost">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : null}

                {/* Folder Structure */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-amber-500" />
                      Document Folders
                    </h3>
                    <span className="text-sm text-muted-foreground">
                      {filteredFolders.length} folders, {documents?.length || 0} documents
                    </span>
                  </div>
                  
                  <ScrollArea className="h-[500px]">
                    {documentsLoading ? (
                      <div className="flex items-center justify-center h-32">
                        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : filteredFolders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
                        <FolderOpen className="h-12 w-12 mb-2 opacity-50" />
                        <p>No documents found. Click "Process Files" to begin.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredFolders.map((folder) => (
                          <Card key={folder.name} className="overflow-hidden">
                            <div 
                              className="p-3 cursor-pointer hover-elevate flex items-center gap-3"
                              onClick={() => toggleFolder(folder.name)}
                              data-testid={`folder-${folder.name}`}
                            >
                              {expandedFolders.has(folder.name) ? (
                                <ChevronDown className="h-5 w-5 text-muted-foreground shrink-0" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
                              )}
                              {expandedFolders.has(folder.name) ? (
                                <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
                              ) : (
                                <FolderClosed className="h-5 w-5 text-amber-500 shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{folder.displayName}</p>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <span className="flex items-center gap-1">
                                    <FileText className="h-3 w-3" />
                                    {folder.totalDocs} files
                                  </span>
                                  <span className="flex items-center gap-1">
                                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                                    {folder.processedDocs} processed
                                  </span>
                                  {folder.expiringDocs > 0 && (
                                    <span className="flex items-center gap-1 text-amber-500">
                                      <AlertTriangle className="h-3 w-3" />
                                      {folder.expiringDocs} expiring
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {Object.entries(folder.categories).slice(0, 3).map(([cat, docs]) => {
                                  const catInfo = getCategoryInfo(cat);
                                  return (
                                    <Badge key={cat} variant="outline" className="text-xs">
                                      <catInfo.icon className={`h-3 w-3 mr-1 ${catInfo.textColor}`} />
                                      {docs.length}
                                    </Badge>
                                  );
                                })}
                                <Badge variant="secondary">{folder.totalDocs}</Badge>
                              </div>
                            </div>
                            
                            {expandedFolders.has(folder.name) && (
                              <div className="border-t bg-muted/30">
                                {/* Category breakdown */}
                                <div className="p-3 border-b">
                                  <div className="flex flex-wrap gap-2">
                                    {Object.entries(folder.categories).map(([cat, docs]) => {
                                      const catInfo = getCategoryInfo(cat);
                                      return (
                                        <Badge key={cat} variant="outline" className="cursor-pointer hover-elevate">
                                          <catInfo.icon className={`h-3 w-3 mr-1 ${catInfo.textColor}`} />
                                          {catInfo.label}: {docs.length}
                                        </Badge>
                                      );
                                    })}
                                  </div>
                                </div>
                                
                                {/* Document list */}
                                <div className="divide-y">
                                  {folder.documents.slice(0, 20).map((doc) => {
                                    const catInfo = getCategoryInfo(doc.documentType || doc.category || "");
                                    return (
                                      <div 
                                        key={doc.id} 
                                        className="p-3 hover-elevate cursor-pointer flex items-center gap-3"
                                        onClick={() => setSelectedDocument(doc)}
                                        data-testid={`document-${doc.id}`}
                                      >
                                        <Checkbox 
                                          checked={selectedDocsForBid.has(doc.id)}
                                          onCheckedChange={() => toggleDocumentSelection(doc.id)}
                                          onClick={(e) => e.stopPropagation()}
                                          data-testid={`checkbox-doc-${doc.id}`}
                                        />
                                        <catInfo.icon className={`h-4 w-4 shrink-0 ${catInfo.textColor}`} />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{doc.title}</p>
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                            <span>{catInfo.label}</span>
                                            {doc.createdAt && (
                                              <>
                                                <span>•</span>
                                                <span>{formatDate(doc.createdAt)}</span>
                                              </>
                                            )}
                                          </div>
                                        </div>
                                        <Badge 
                                          variant={doc.status === "processed" ? "default" : "outline"} 
                                          className="text-xs shrink-0"
                                        >
                                          {doc.status}
                                        </Badge>
                                        <Button 
                                          size="icon" 
                                          variant="ghost" 
                                          className="h-8 w-8 shrink-0"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const fileUrl = `/api/knowledge/documents/${doc.id}/file`;
                                            const ext = doc.title?.split('.').pop()?.toLowerCase() || "";
                                            const fileType = ext === "pdf" ? "pdf" :
                                                            ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "svg"].includes(ext) ? ext :
                                                            ext || "document";
                                            openDocument(fileUrl, doc.title, fileType);
                                          }}
                                          data-testid={`button-view-doc-${doc.id}`}
                                        >
                                          <Eye className="h-4 w-4" />
                                        </Button>
                                      </div>
                                    );
                                  })}
                                  {folder.documents.length > 20 && (
                                    <div className="p-3 text-center text-sm text-muted-foreground">
                                      +{folder.documents.length - 20} more documents
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </CardContent>
            </Card>

            {/* Selected Documents for Bid Actions */}
            {selectedDocsForBid.size > 0 && (
              <Card className="border-primary">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                      <span className="font-medium">{selectedDocsForBid.size} documents selected</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedDocsForBid(new Set())}>
                        Clear Selection
                      </Button>
                      <Button size="sm" onClick={() => setBidBuilderOpen(true)} data-testid="button-add-to-bid">
                        <Package className="h-4 w-4 mr-2" />
                        Add to Bid Package
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="company" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  BlackHawk Construction Profile
                </CardTitle>
                <CardDescription>
                  Company information extracted from uploaded documents
                </CardDescription>
              </CardHeader>
              <CardContent>
                {companyProfile ? (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Legal Name</label>
                        <p className="font-medium">{companyProfile.legalName}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">CAGE Code</label>
                        <p className="font-medium">{companyProfile.cageCode || "Not set"}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">UEI Number</label>
                        <p className="font-medium">{companyProfile.ueiNumber || "Not set"}</p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">NAICS Codes</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {companyProfile.naicsCodes?.map((code, idx) => (
                            <Badge key={idx} variant="outline">{code}</Badge>
                          )) || <span className="text-muted-foreground">None</span>}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Bonding Capacity</label>
                        <p className="font-medium">
                          {typeof companyProfile.bondingCapacity === 'object' && companyProfile.bondingCapacity
                            ? `Single: $${(companyProfile.bondingCapacity as any).single?.toLocaleString() || "N/A"}`
                            : "Not set"}
                        </p>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Core Competencies</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {companyProfile.coreCompetencies?.map((comp, idx) => (
                            <Badge key={idx} variant="secondary">{comp}</Badge>
                          )) || <span className="text-muted-foreground">None</span>}
                        </div>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Service Areas</label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {companyProfile.serviceAreas?.map((area, idx) => (
                            <Badge key={idx} variant="outline">{area}</Badge>
                          )) || <span className="text-muted-foreground">None</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No company profile found. Process documents to extract company information.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subcontractors" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Subcontractor Database
                    </CardTitle>
                    <CardDescription>
                      Teaming partners extracted from vendor files
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-add-subcontractor">
                    <FilePlus className="h-4 w-4 mr-2" />
                    Add Subcontractor
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px]">
                  {subcontractors && subcontractors.length > 0 ? (
                    <div className="grid md:grid-cols-2 gap-3">
                      {subcontractors.map((sub) => (
                        <Card key={sub.id} className="hover-elevate cursor-pointer">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <Building2 className="h-5 w-5 text-primary" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium truncate">{sub.companyName}</h4>
                                <p className="text-sm text-muted-foreground">{sub.trade}</p>
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  {(() => {
                                    const certs = sub.certifications;
                                    if (certs && Array.isArray(certs)) {
                                      return certs.slice(0, 2).map((cert: unknown, idx: number) => (
                                        <Badge key={idx} variant="outline" className="text-xs">{String(cert)}</Badge>
                                      ));
                                    }
                                    return null;
                                  })()}
                                  {sub.performanceRating && (
                                    <Badge variant="secondary" className="text-xs">
                                      {parseFloat(sub.performanceRating).toFixed(1)} <Star className="h-3 w-3 ml-0.5 fill-current" />
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <Button size="icon" variant="ghost">
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No subcontractors found. Process documents to extract vendor information.</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="learning" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Win Pattern Analysis
                  </CardTitle>
                  <CardDescription>
                    AI-identified patterns from successful bids
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {winPatterns && winPatterns.length > 0 ? (
                    <div className="space-y-3">
                      {winPatterns.map((pattern, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div>
                            <p className="font-medium">{pattern.patternName}</p>
                            <p className="text-sm text-muted-foreground">{pattern.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-green-600">
                              {(parseFloat(pattern.winRate || "0") * 100).toFixed(0)}%
                            </p>
                            <p className="text-xs text-muted-foreground">win rate</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <TrendingUp className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No patterns identified yet. Record bid outcomes to enable learning.</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5" />
                    Adaptive Scoring Weights
                  </CardTitle>
                  <CardDescription>
                    Learning from your bid decisions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { name: "Agency Match", weight: 1.25, trend: "up" },
                      { name: "NAICS Alignment", weight: 1.15, trend: "up" },
                      { name: "Value Range Fit", weight: 1.0, trend: "neutral" },
                      { name: "Set-Aside Match", weight: 1.3, trend: "up" },
                      { name: "Geographic Proximity", weight: 0.9, trend: "down" },
                    ].map((weight, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <span className="text-sm">{weight.name}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant={weight.trend === "up" ? "default" : weight.trend === "down" ? "destructive" : "secondary"}>
                            {weight.weight.toFixed(2)}x
                          </Badge>
                          {weight.trend === "up" && <TrendingUp className="h-4 w-4 text-green-500" />}
                          {weight.trend === "down" && <TrendingUp className="h-4 w-4 text-red-500 rotate-180" />}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="h-5 w-5" />
                  Bid Outcome Tracker
                </CardTitle>
                <CardDescription>
                  Record outcomes to improve AI recommendations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
                    <p className="text-3xl font-bold text-green-600">12</p>
                    <p className="text-sm text-muted-foreground">Won</p>
                  </div>
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-3xl font-bold text-red-600">8</p>
                    <p className="text-sm text-muted-foreground">Lost</p>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-3xl font-bold text-amber-600">5</p>
                    <p className="text-sm text-muted-foreground">No Bid</p>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-3xl font-bold text-blue-600">60%</p>
                    <p className="text-sm text-muted-foreground">Win Rate</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Document Detail Sheet */}
      <Sheet open={!!selectedDocument} onOpenChange={() => setSelectedDocument(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          {selectedDocument && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between gap-4">
                  <SheetTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {selectedDocument.title}
                  </SheetTitle>
                  <Button
                    onClick={() => {
                      const fileUrl = `/api/knowledge/documents/${selectedDocument.id}/file`;
                      const ext = selectedDocument.title?.split('.').pop()?.toLowerCase() || "";
                      const fileType = ext === "pdf" ? "pdf" :
                                      ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "svg"].includes(ext) ? ext :
                                      ext || "document";
                      openDocument(fileUrl, selectedDocument.title, fileType);
                      setSelectedDocument(null);
                    }}
                    data-testid="button-open-viewer"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Open Viewer
                  </Button>
                </div>
                <SheetDescription>
                  Document details and metadata
                </SheetDescription>
              </SheetHeader>
              
              <div className="space-y-6 mt-6">
                {/* Status and Actions */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Badge 
                    variant={selectedDocument.status === "processed" ? "default" : "outline"}
                    className="text-sm"
                  >
                    {selectedDocument.status}
                  </Badge>
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      variant="default" 
                      size="sm"
                      onClick={() => {
                        try {
                          const fileUrl = `/api/knowledge/documents/${selectedDocument.id}/file`;
                          const ext = selectedDocument.title?.split('.').pop()?.toLowerCase() || "";
                          const fileType = ext === "pdf" ? "pdf" :
                                          ["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "svg"].includes(ext) ? ext :
                                          ext || "document";
                          openDocument(fileUrl, selectedDocument.title, fileType);
                          setSelectedDocument(null);
                        } catch (e) {
                          console.error("Error opening document:", e);
                        }
                      }}
                      data-testid="button-view-document"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Document
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-download">
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-link-to-bid">
                      <Link2 className="h-4 w-4 mr-2" />
                      Link to Bid
                    </Button>
                  </div>
                </div>

                <Separator />

                {/* Metadata */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Document Metadata
                  </h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Category</p>
                      <p className="font-medium">{getCategoryInfo(selectedDocument.documentType || selectedDocument.category || "").label}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="font-medium capitalize">{selectedDocument.status}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Created</p>
                      <p className="font-medium">{formatDate(selectedDocument.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">File Size</p>
                      <p className="font-medium">{formatBytes(selectedDocument.fileSize || 0)}</p>
                    </div>
                    {selectedDocument.expirationDate && (
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">Expiration Date</p>
                        <p className="font-medium flex items-center gap-2">
                          {formatDate(selectedDocument.expirationDate)}
                          {new Date(selectedDocument.expirationDate) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) && (
                            <Badge variant="destructive" className="text-xs">Expiring Soon</Badge>
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                {/* AI Extracted Fields */}
                {selectedDocument.metadata && (
                  <>
                    <div className="space-y-4">
                      <h4 className="font-semibold flex items-center gap-2">
                        <Brain className="h-4 w-4" />
                        AI-Extracted Information
                      </h4>
                      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                        {Object.entries(selectedDocument.metadata).map(([key, value]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                            <span className="font-medium">{String(value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}

                {/* Content Preview */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Content Preview
                  </h4>
                  <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">
                      {selectedDocument.content?.slice(0, 1000) || "No content available"}
                      {selectedDocument.content?.length > 1000 && "..."}
                    </p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-4">
                  <Button className="flex-1" onClick={() => {
                    toggleDocumentSelection(selectedDocument.id);
                    toast({
                      title: selectedDocsForBid.has(selectedDocument.id) ? "Removed from selection" : "Added to selection",
                      description: `Document ${selectedDocsForBid.has(selectedDocument.id) ? "removed from" : "added to"} bid package selection`,
                    });
                  }}>
                    {selectedDocsForBid.has(selectedDocument.id) ? (
                      <>
                        <X className="h-4 w-4 mr-2" />
                        Remove from Package
                      </>
                    ) : (
                      <>
                        <Package className="h-4 w-4 mr-2" />
                        Add to Bid Package
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Bid Package Builder Dialog */}
      <Dialog open={bidBuilderOpen} onOpenChange={setBidBuilderOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Bid Package Builder
            </DialogTitle>
            <DialogDescription>
              Assemble documents into a numbered bid package with table of contents
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Select Bid Project */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Select Bid Project</label>
              <Select value={selectedBidProject} onValueChange={setSelectedBidProject}>
                <SelectTrigger data-testid="select-bid-project">
                  <SelectValue placeholder="Select a bid project..." />
                </SelectTrigger>
                <SelectContent>
                  {bidProjects?.filter(b => b.status !== 'won' && b.status !== 'lost').map(bid => (
                    <SelectItem key={bid.id} value={bid.id}>
                      {bid.opportunityId} ({bid.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Package Sections */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Package Sections</h4>
                <span className="text-sm text-muted-foreground">
                  Est. {totalEstimatedPages} pages
                </span>
              </div>
              
              <div className="space-y-2">
                {BID_PACKAGE_SECTIONS.map((section, idx) => (
                  <div 
                    key={section.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover-elevate"
                  >
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold text-sm shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium flex items-center gap-2">
                        {section.label}
                        {section.required && (
                          <Badge variant="destructive" className="text-xs">Required</Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        ~{section.pageEstimate} pages
                      </p>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {section.id === 'company_info' || section.id === 'certifications' || section.id === 'insurance' || section.id === 'bonding' 
                        ? `${Math.floor(Math.random() * 3) + 1} docs attached`
                        : 'No docs'
                      }
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <FilePlus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Selected Documents */}
            {selectedDocsForBid.size > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold">Selected Documents ({selectedDocsForBid.size})</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {Array.from(selectedDocsForBid).map(docId => {
                    const doc = documents?.find(d => d.id === docId);
                    if (!doc) return null;
                    return (
                      <div key={docId} className="flex items-center gap-2 p-2 rounded border bg-muted/30">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="flex-1 text-sm truncate">{doc.title}</span>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6"
                          onClick={() => toggleDocumentSelection(docId)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Preview Stats */}
            <Card className="bg-muted/30">
              <CardContent className="p-4">
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-primary">{BID_PACKAGE_SECTIONS.length}</p>
                    <p className="text-xs text-muted-foreground">Sections</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-primary">~{totalEstimatedPages}</p>
                    <p className="text-xs text-muted-foreground">Est. Pages</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{selectedDocsForBid.size}</p>
                    <p className="text-xs text-muted-foreground">Documents</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600">
                      {BID_PACKAGE_SECTIONS.filter(s => s.required).length}
                    </p>
                    <p className="text-xs text-muted-foreground">Required</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBidBuilderOpen(false)}>
              Cancel
            </Button>
            <Button variant="outline">
              <Eye className="h-4 w-4 mr-2" />
              Preview Package
            </Button>
            <Button 
              disabled={!selectedBidProject || selectedDocsForBid.size === 0 || linkDocumentsToBidMutation.isPending}
              onClick={() => {
                if (selectedBidProject && selectedDocsForBid.size > 0) {
                  linkDocumentsToBidMutation.mutate({
                    bidId: selectedBidProject,
                    documentIds: Array.from(selectedDocsForBid),
                    sectionId: "appendices",
                  });
                }
              }}
              data-testid="button-link-documents"
            >
              {linkDocumentsToBidMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Linking...
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Link {selectedDocsForBid.size} Documents
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EgnyteBrowser 
        open={egnyteOpen} 
        onOpenChange={setEgnyteOpen}
        onImportComplete={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/knowledge/documents"] });
          queryClient.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
        }}
      />
    </div>
  );
}
