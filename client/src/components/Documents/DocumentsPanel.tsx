import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Upload,
  Download,
  Eye,
  FileText,
  FileImage,
  File,
  Search,
  Loader2,
  FolderOpen,
  Clock,
  User,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DocumentsPanelProps {
  jacketType: string;
  jacketId: string;
  canUpload?: boolean;
  canEdit?: boolean;
  documentTypeFilter?: string;
}

interface DocItem {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSizeBytes: number;
  version: number;
  documentType: string | null;
  visibility: string;
  source: string;
  uploadedBy: string | null;
  uploadedAt: string;
  status: string;
  storageKey: string;
  folderName?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getFileIcon(fileType: string) {
  const lower = fileType.toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(lower)) return FileImage;
  if (["pdf", "doc", "docx", "txt", "rtf"].includes(lower)) return FileText;
  return File;
}

function getFileTypeBadge(fileType: string) {
  const lower = fileType.toLowerCase();
  if (["pdf"].includes(lower)) return "destructive" as const;
  if (["doc", "docx"].includes(lower)) return "default" as const;
  if (["xls", "xlsx"].includes(lower)) return "secondary" as const;
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(lower)) return "outline" as const;
  return "secondary" as const;
}

export function DocumentsPanel({
  jacketType,
  jacketId,
  canUpload = true,
  canEdit = false,
  documentTypeFilter,
}: DocumentsPanelProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);

  const { data, isLoading } = useQuery<{ documents: DocItem[]; total: number }>({
    queryKey: ["/api/documents/scoped", jacketType, jacketId],
    queryFn: async () => {
      const params = new URLSearchParams({ jacketType, jacketId });
      if (documentTypeFilter) params.set("documentType", documentTypeFilter);
      const res = await fetch(`/api/documents/scoped?${params}`);
      if (!res.ok) throw new Error("Failed to load documents");
      return res.json();
    },
    enabled: !!jacketId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/documents/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents/scoped", jacketType, jacketId] });
      toast({ title: "Document uploaded successfully" });
    },
    onError: () => {
      toast({ title: "Upload failed", variant: "destructive" });
    },
  });

  const handleUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp,.txt,.csv";
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files) return;
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("jacketType", jacketType);
        formData.append("jacketId", jacketId);
        formData.append("title", file.name);
        uploadMutation.mutate(formData);
      }
    };
    input.click();
  };

  const docs = data?.documents ?? [];
  const filtered = searchQuery.trim()
    ? docs.filter(
        (d) =>
          d.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          d.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (d.documentType ?? "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : docs;

  return (
    <div className="flex flex-col h-full" data-testid="documents-panel">
      <div className="flex items-center justify-between gap-2 p-4 border-b flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-9"
              data-testid="input-docs-search"
            />
          </div>
          <Badge variant="secondary" data-testid="badge-docs-count">
            {filtered.length} doc{filtered.length !== 1 ? "s" : ""}
          </Badge>
        </div>
        {canUpload && (
          <Button
            onClick={handleUpload}
            disabled={uploadMutation.isPending}
            className="gap-2"
            data-testid="button-docs-upload"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Upload
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FolderOpen className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm font-medium">No documents</p>
            <p className="text-xs mt-1">
              {searchQuery ? "No documents match your search" : "Upload documents to get started"}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((doc) => {
                const IconComp = getFileIcon(doc.fileType);
                return (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer hover-elevate"
                    data-testid={`row-doc-${doc.id}`}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <IconComp className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{doc.title}</p>
                          {doc.folderName && (
                            <p className="text-xs text-muted-foreground truncate">{doc.folderName}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getFileTypeBadge(doc.fileType)} className="text-xs">
                        {doc.fileType.toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFileSize(doc.fileSizeBytes)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatDate(doc.uploadedAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewDoc(doc)}
                          data-testid={`button-preview-${doc.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            window.open(`/api/documents/${doc.id}/download`, "_blank");
                          }}
                          data-testid={`button-download-${doc.id}`}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      <Sheet open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <SheetContent className="sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{previewDoc?.title}</SheetTitle>
          </SheetHeader>
          {previewDoc && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">File Name</p>
                  <p className="font-medium">{previewDoc.fileName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Type</p>
                  <Badge variant={getFileTypeBadge(previewDoc.fileType)}>
                    {previewDoc.fileType.toUpperCase()}
                  </Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Size</p>
                  <p>{formatFileSize(previewDoc.fileSizeBytes)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Version</p>
                  <p>v{previewDoc.version}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge variant="outline">{previewDoc.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Uploaded</p>
                  <p>{formatDate(previewDoc.uploadedAt)}</p>
                </div>
              </div>
              {["pdf", "jpg", "jpeg", "png", "gif", "webp"].includes(previewDoc.fileType.toLowerCase()) && (
                <div className="border rounded-md overflow-hidden bg-muted/30">
                  <iframe
                    src={`/api/documents/${previewDoc.id}/preview`}
                    className="w-full h-[400px]"
                    title={previewDoc.title}
                  />
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => window.open(`/api/documents/${previewDoc.id}/download`, "_blank")}
                  data-testid="button-preview-download"
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
