import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  FileText,
  Upload,
  Search,
  Filter,
  Download,
  Folder,
  File,
  MoreVertical,
  Eye,
  Trash2,
  Share2,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DocumentData {
  id: string;
  name: string;
  type: string;
  category: string;
  size: string;
  uploadedBy: string;
  uploadedAt: string;
  status: "current" | "archived" | "draft";
  project?: string;
}

export default function Documents() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("all");
  const { toast } = useToast();

  const handleRefreshDocuments = () => {
    toast({
      title: "Documents Refreshed",
      description: "Showing most recently updated documents.",
    });
  };

  const handleUploadDocument = () => {
    toast({
      title: "Upload Document",
      description: "Opening document upload dialog. Drag and drop supported.",
    });
  };

  const handleFilterDocuments = () => {
    toast({
      title: "Filter Documents",
      description: "Opening advanced filter options...",
    });
  };

  const { data: documents, isLoading: documentsLoading } = useQuery<DocumentData[]>({
    queryKey: ["/api/documents"],
  });

  const displayDocuments = documents || [];
  const displayFolders: { id: string; name: string; count: number }[] = [];
  const displayStats = { totalDocuments: 0, recentUploads: 0, storageUsed: "0 GB", pendingReview: 0 };

  const filteredDocuments = displayDocuments.filter((doc) => {
    const matchesSearch = doc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedTab === "all") return matchesSearch;
    if (selectedTab === "current") return matchesSearch && doc.status === "current";
    if (selectedTab === "drafts") return matchesSearch && doc.status === "draft";
    if (selectedTab === "archived") return matchesSearch && doc.status === "archived";
    return matchesSearch;
  });

  const getFileIcon = (type: string) => {
    switch (type) {
      case "pdf": return <FileText className="h-4 w-4 text-red-500" />;
      case "doc": return <FileText className="h-4 w-4 text-blue-500" />;
      case "cad": return <File className="h-4 w-4 text-purple-500" />;
      case "archive": return <File className="h-4 w-4 text-yellow-500" />;
      default: return <File className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "current": return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Current</Badge>;
      case "draft": return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Draft</Badge>;
      case "archived": return <Badge className="bg-gray-500/10 text-gray-500 border-gray-500/20">Archived</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" data-testid="heading-documents">Document Management</h1>
          <p className="text-muted-foreground">Organize and manage project documents</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshDocuments} data-testid="button-refresh-documents">
            <Clock className="mr-2 h-4 w-4" />
            Recent
          </Button>
          <Button onClick={handleUploadDocument} data-testid="button-upload-document">
            <Upload className="mr-2 h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="stat-card-total-documents">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {documentsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{displayStats.totalDocuments}</div>
            )}
          </CardContent>
        </Card>
        <Card data-testid="stat-card-recent-uploads">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Uploads</CardTitle>
            <Upload className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            {documentsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-blue-500">{displayStats.recentUploads}</div>
            )}
            <p className="text-xs text-muted-foreground">Last 7 days</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-storage-used">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Storage Used</CardTitle>
            <Folder className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {documentsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold">{displayStats.storageUsed}</div>
            )}
            <p className="text-xs text-muted-foreground">of 50 GB</p>
          </CardContent>
        </Card>
        <Card data-testid="stat-card-pending-review">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {documentsLoading ? <Skeleton className="h-8 w-20" /> : (
              <div className="text-2xl font-bold text-yellow-500">{displayStats.pendingReview}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card className="md:col-span-1" data-testid="card-folders">
          <CardHeader>
            <CardTitle className="text-lg">Folders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {displayFolders.map((folder) => (
              <Button
                key={folder.id}
                variant="ghost"
                className="w-full justify-start gap-2"
                data-testid={`folder-${folder.id}`}
              >
                <Folder className="h-4 w-4 text-primary" />
                <span className="flex-1 text-left">{folder.name}</span>
                <Badge variant="secondary" className="text-xs">{folder.count}</Badge>
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="md:col-span-3" data-testid="card-documents-list">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Documents</CardTitle>
                <CardDescription>Browse and manage all documents</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search documents..."
                    className="pl-8 w-[200px]"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-documents"
                  />
                </div>
                <Button variant="outline" size="icon" onClick={handleFilterDocuments} data-testid="button-filter-documents">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedTab} onValueChange={setSelectedTab}>
              <TabsList data-testid="tabs-documents">
                <TabsTrigger value="all" data-testid="tab-all">All</TabsTrigger>
                <TabsTrigger value="current" data-testid="tab-current">Current</TabsTrigger>
                <TabsTrigger value="drafts" data-testid="tab-drafts">Drafts</TabsTrigger>
                <TabsTrigger value="archived" data-testid="tab-archived">Archived</TabsTrigger>
              </TabsList>
              <TabsContent value={selectedTab} className="mt-4">
                <div className="space-y-2">
                  {documentsLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))
                  ) : filteredDocuments.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No documents found
                    </div>
                  ) : (
                    filteredDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center gap-4 p-3 rounded-lg border hover-elevate"
                        data-testid={`document-row-${doc.id}`}
                      >
                        {getFileIcon(doc.type)}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate" data-testid={`document-name-${doc.id}`}>{doc.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.category} • {doc.size} • {doc.uploadedBy}
                          </p>
                        </div>
                        {doc.project && (
                          <Badge variant="outline" className="hidden md:flex">{doc.project}</Badge>
                        )}
                        {getStatusBadge(doc.status)}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`button-actions-${doc.id}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem data-testid={`action-view-${doc.id}`}>
                              <Eye className="mr-2 h-4 w-4" /> View
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`action-download-${doc.id}`}>
                              <Download className="mr-2 h-4 w-4" /> Download
                            </DropdownMenuItem>
                            <DropdownMenuItem data-testid={`action-share-${doc.id}`}>
                              <Share2 className="mr-2 h-4 w-4" /> Share
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" data-testid={`action-delete-${doc.id}`}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
