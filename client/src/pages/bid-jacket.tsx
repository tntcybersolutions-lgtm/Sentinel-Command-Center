import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { ArtifactsPanel } from "@/components/bid-jacket/ArtifactsPanel";
import { MasterChecklistPanel } from "@/components/bid-jacket/MasterChecklistPanel";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  FolderOpen,
  Grid3X3,
  List,
  TreeDeciduous,
  Download,
  Eye,
  ChevronRight,
  ChevronDown,
  Search,
  Filter,
  LayoutGrid,
  ArrowUpDown,
  FileCheck,
  AlertTriangle,
  Brain,
  Sparkles,
  RefreshCw,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  X,
  ChevronLeft,
  BookOpen,
  Printer,
  Share2,
  Clock,
  CheckCircle2,
  XCircle,
  Building2,
  Users,
  DollarSign,
  CalendarDays,
  Shield,
  Activity,
  ClipboardList,
  FileQuestion,
  FilePlus,
  Receipt,
  Sun,
  Cloud,
  CloudRain,
  Phone,
  Mail,
  Link,
  Hash,
  TrendingUp,
  TrendingDown,
  Minus,
  MoreHorizontal,
  Pencil,
  Copy,
  Trash2,
  Camera,
  CheckSquare,
  CircleDot,
  Layers,
  ArrowDown,
  ArrowUp,
  ImageIcon,
  Tag,
  Plus,
  Trophy,
  Undo2,
  Wrench,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { InlineEditableField } from "@/components/inline-editable-field";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PDFViewer } from "@/components/pdf-viewer";
import type { EnsureCanonicalResult } from "@shared/schema";

interface JacketIntegrity {
  bidProjectId: string;
  totalFolders: number;
  expectedFolders: number;
  missingSortOrders: number[];
  duplicateSortOrders: number[];
  legacyFolders: { id: string; name: string; sortOrder: number }[];
  isHealthy: boolean;
}

function TextFileViewer({ doc, onStorageMissing }: { doc: JacketDocument; onStorageMissing?: (docId: string) => void }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageMissing, setStorageMissing] = useState(false);

  useEffect(() => {
    if (!doc.storageKey) {
      setLoading(false);
      return;
    }
    const isTextFile = /\.(txt|csv|json|xml|md|log|html|css|js|ts)$/i.test(doc.fileName) || doc.mimeType === "text/plain";
    if (!isTextFile) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/documents/${doc.id}/download`)
      .then(r => {
        if (r.ok) return r.text();
        if (r.status === 410) {
          setStorageMissing(true);
          onStorageMissing?.(doc.id);
          return Promise.reject("storage_missing");
        }
        return Promise.reject("Failed");
      })
      .then(text => { setContent(text); setLoading(false); })
      .catch(() => { if (!storageMissing) setContent(null); setLoading(false); });
  }, [doc.id, doc.storageKey, doc.fileName, doc.mimeType]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/20 p-8">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (storageMissing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 p-8 text-muted-foreground gap-2">
        <AlertTriangle className="w-16 h-16 opacity-50" />
        <p className="text-sm font-medium">File missing from storage</p>
        <p className="text-xs">This document record exists but the file is no longer available.</p>
      </div>
    );
  }

  if (content !== null) {
    return (
      <ScrollArea className="flex-1 bg-muted/10">
        <pre className="p-6 text-sm font-mono whitespace-pre-wrap leading-relaxed">{content}</pre>
      </ScrollArea>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 p-8">
      <FileText className="w-24 h-24 mb-4 text-muted-foreground" />
      <p className="text-lg font-medium">{doc.fileName}</p>
      <p className="text-sm text-muted-foreground mt-2">{doc.fileSizeBytes} bytes</p>
    </div>
  );
}

function UploadDialog({ 
  open, 
  onOpenChange, 
  bidId, 
  folders, 
  initialFolderId, 
  onComplete 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  bidId: string; 
  folders: JacketFolder[]; 
  initialFolderId: string | null; 
  onComplete: () => void; 
}) {
  const [selectedFolderId, setSelectedFolderId] = useState(initialFolderId || (folders[0]?.id || ""));
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (initialFolderId) setSelectedFolderId(initialFolderId);
  }, [initialFolderId]);

  const handleFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    setFiles(prev => [...prev, ...Array.from(fileList)]);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  }, [handleFiles]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadAll = async () => {
    if (!files.length || !selectedFolderId) return;
    setUploading(true);

    let successCount = 0;
    for (const file of files) {
      try {
        const uploadUrlRes = await apiRequest("POST", "/api/uploads/request-url", {
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        });
        const { uploadURL, objectPath } = await uploadUrlRes.json();

        await fetch(uploadURL, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });

        await apiRequest("POST", "/api/documents/upload", {
          folderId: selectedFolderId,
          title: file.name,
          fileName: file.name,
          objectPath,
          mimeType: file.type || "application/octet-stream",
          fileSize: file.size,
          jacketType: "bid",
          jacketId: bidId,
          documentType: "general",
          visibility: "internal",
        });

        successCount++;
      } catch (err) {
        console.error("Upload failed for", file.name, err);
      }
    }

    setUploading(false);
    const failCount = files.length - successCount;
    setFiles([]);
    if (failCount > 0) {
      toast({ title: `${successCount} uploaded, ${failCount} failed`, variant: "destructive" });
    } else {
      toast({ title: `${successCount} file${successCount !== 1 ? "s" : ""} uploaded` });
    }
    onComplete();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Documents</DialogTitle>
          <DialogDescription>Upload files to your bid jacket folder</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Destination Folder</label>
            <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
              <SelectTrigger data-testid="select-upload-folder">
                <SelectValue placeholder="Select folder..." />
              </SelectTrigger>
              <SelectContent>
                {folders.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className={`border-2 border-dashed rounded-md p-8 text-center transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            data-testid="upload-drop-zone"
          >
            <FilePlus className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">Drag and drop files here, or</p>
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-choose-files">
              Choose Files
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
              data-testid="input-file-upload"
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2 max-h-48 overflow-auto">
              {files.map((file, i) => (
                <div key={i} className="flex items-center justify-between gap-2 p-2 bg-muted rounded-md">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm truncate">{file.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatSize(file.size)}</span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeFile(i)} data-testid={`button-remove-file-${i}`}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-upload">
              Cancel
            </Button>
            <Button
              onClick={uploadAll}
              disabled={files.length === 0 || uploading || !selectedFolderId}
              data-testid="button-submit-upload"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <FilePlus className="w-4 h-4 mr-2" />
                  Upload {files.length} file{files.length !== 1 ? "s" : ""}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BinderOptionsForm({ onSubmit, isPending }: {
  onSubmit: (opts: { includeMergedPdf: boolean; includeZip: boolean; watermark: boolean; includeLegacyFolders: boolean }) => void;
  isPending: boolean;
}) {
  const [includePdf, setIncludePdf] = useState(true);
  const [includeZip, setIncludeZip] = useState(true);
  const [includeLegacy, setIncludeLegacy] = useState(true);
  const [watermark, setWatermark] = useState(false);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={includeZip}
            onCheckedChange={(v) => setIncludeZip(!!v)}
            data-testid="checkbox-binder-zip"
          />
          <div>
            <p className="text-sm font-medium">Include ZIP Package</p>
            <p className="text-xs text-muted-foreground">Preserves folder structure with all original documents</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={includePdf}
            onCheckedChange={(v) => setIncludePdf(!!v)}
            data-testid="checkbox-binder-pdf"
          />
          <div>
            <p className="text-sm font-medium">Include Merged PDF</p>
            <p className="text-xs text-muted-foreground">Professional PDF with cover, TOC, section dividers, and merged documents</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={includeLegacy}
            onCheckedChange={(v) => setIncludeLegacy(!!v)}
            data-testid="checkbox-binder-legacy"
          />
          <div>
            <p className="text-sm font-medium">Include Legacy Folders</p>
            <p className="text-xs text-muted-foreground">Include documents from non-canonical folder names</p>
          </div>
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <Checkbox
            checked={watermark}
            onCheckedChange={(v) => setWatermark(!!v)}
            data-testid="checkbox-binder-watermark"
          />
          <div>
            <p className="text-sm font-medium">Watermark</p>
            <p className="text-xs text-muted-foreground">Add DRAFT watermark to generated pages</p>
          </div>
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button
          onClick={() => onSubmit({ includeMergedPdf: includePdf, includeZip: includeZip, watermark, includeLegacyFolders: includeLegacy })}
          disabled={isPending || (!includePdf && !includeZip)}
          data-testid="button-start-binder-job"
        >
          {isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
          Start Generation
        </Button>
      </div>
    </div>
  );
}

function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-2">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-6 mb-3">$1</h2>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  html = html.replace(/^\|(.+)\|$/gm, (match) => {
    const cells = match.split("|").filter(c => c.trim() !== "");
    const isHeader = cells.every(c => /^[\s-:]+$/.test(c));
    if (isHeader) return "";
    const cellHtml = cells.map(c => `<td class="border px-3 py-1.5 text-sm">${c.trim()}</td>`).join("");
    return `<tr>${cellHtml}</tr>`;
  });
  html = html.replace(/(<tr>[\s\S]*?<\/tr>)/g, (block) => {
    if (block.includes("<tr>")) {
      const rows = block.match(/<tr>.*?<\/tr>/g) || [];
      if (rows.length > 0) {
        const headerRow = rows[0]!.replace(/<td/g, "<th").replace(/<\/td>/g, "</th>");
        const bodyRows = rows.slice(1).join("");
        return `<table class="w-full border-collapse border my-3"><thead>${headerRow}</thead><tbody>${bodyRows}</tbody></table>`;
      }
    }
    return block;
  });

  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$2</li>');

  html = html.replace(/(<li[^>]*>.*<\/li>\n?)+/g, (match) => {
    if (match.includes("list-disc")) return `<ul class="space-y-1 my-2">${match}</ul>`;
    return `<ol class="space-y-1 my-2">${match}</ol>`;
  });

  html = html.replace(/^(?!<[hultro])((?!<).+)$/gm, '<p class="text-sm my-1">$1</p>');
  html = html.replace(/<p class="text-sm my-1"><\/p>/g, "");

  return html;
}

interface JacketDocument {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  documentType: string | null;
  fileSizeBytes: number;
  version: number;
  uploadedAt: string;
  status: string;
  folderId: string;
  storageKey: string;
  tagsJson?: string[] | null;
  description?: string | null;
}

interface JacketFolder {
  id: string;
  name: string;
  sortOrder: number;
  documentCount: number;
  documents: JacketDocument[];
}

interface BidReadiness {
  overallScore: number;
  status: string;
  categoryScores: Record<string, number>;
  missingItems: { item: string; category: string; severity: string }[];
}

interface BinderVersion {
  id: string;
  version: number;
  status: string;
  pageCount: number | null;
  generatedAt: string | null;
  triggerType: string;
  pageMapJson?: { sections: Array<{ sectionCode: string; sectionName: string; startPage: number; endPage: number; documents: Array<{ fileName: string; docId: string; startPage: number; endPage: number }> }> } | null;
}

interface HerbieSuggestion {
  category: string;
  message: string;
  action: string;
  priority: "high" | "medium" | "low";
  suggestions: { documentId: string; documentName: string; confidence: number }[];
}

interface RFI {
  id: string;
  number: number;
  subject: string;
  status: string;
  assignedTo: string;
  dueDate: string;
  response: string | null;
}

interface Submittal {
  id: string;
  item: string;
  specSection: string;
  dueDate: string;
  status: string;
  linkedDocId: string | null;
  linkedDocName: string | null;
}

interface ChangeOrder {
  id: string;
  number: number;
  description: string;
  amount: number;
  status: string;
  scheduleImpact: string | null;
  approval: string | null;
}

interface DailyLog {
  id: string;
  date: string;
  weather: string;
  crewCount: number;
  workPerformed: string;
}

interface FinancialData {
  estimatedTotal: number;
  committed: number;
  actual: number;
  variance: number;
  costCodes: { code: string; description: string; estimated: number; actual: number; variance: number }[];
}

interface DirectoryEntry {
  id: string;
  company: string;
  contact: string;
  role: string;
  trade: string;
  phone: string;
  email: string;
}

interface ComplianceItemData {
  id: string;
  title: string;
  clauseRef: string | null;
  severity: string;
  status: string;
  folderSortOrder: number | null;
  ownerRole: string | null;
  dueAt: string | null;
  notes: string | null;
}

interface ComplianceSummary {
  total: number;
  byStatus: { missing: number; in_progress: number; satisfied: number };
  bySeverity: { critical: number; high: number; medium: number; low: number };
  complianceScore: number;
  criticalGaps: ComplianceItemData[];
  highRiskItems: ComplianceItemData[];
  items: ComplianceItemData[];
}

interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  eventType: string;
  beforeValues: Record<string, unknown> | null;
  afterValues: Record<string, unknown> | null;
}

const BID_FOLDER_NAMES: Record<number, string> = {
  0: "Admin", 1: "Solicitation", 2: "Amendments", 3: "Pre-Bid & Site Visit",
  4: "RFIs & QA", 5: "Estimating", 6: "Subcontractor Quotes",
  7: "Insurance & Bonding", 8: "Forms & Certifications", 9: "Past Performance",
  10: "Technical Proposal", 11: "Pricing", 12: "Submission",
  13: "Debrief & Lessons", 14: "Post-Award", 15: "Photos",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical Requirements",
  high: "High Priority",
  medium: "Medium Priority",
  low: "Low Priority",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  low: "bg-muted text-muted-foreground",
};

const STATUS_COLORS: Record<string, string> = {
  missing: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  satisfied: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "\u2014";
  if (value >= 1_000_000) {
    const m = value / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  if (value >= 1_000) {
    const k = value / 1_000;
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(0)}K`;
  }
  return `$${value.toLocaleString()}`;
}

function formatDelta(delta: number): string {
  const abs = Math.abs(delta);
  const formatted = formatCurrency(abs).replace("$", "");
  return delta >= 0 ? `+$${formatted} above` : `-$${formatted} below`;
}

const ROLE_LABELS: Record<string, string> = {
  project_manager: "Project Manager",
  estimator: "Estimator",
  project_director: "Project Director",
};

const TRANSITION_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  finalized: "Finalized",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  skipped: "Skipped",
};

function formatTransitionDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "\u2014";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function TransitionTab({ bidId, data, isLoading }: { bidId: string; data: any; isLoading: boolean }) {
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bids/${bidId}/transition`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId, "transition"] });
      toast({ title: "Transition initiated" });
    },
    onError: () => {
      toast({ title: "Failed to initiate transition", variant: "destructive" });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/transition/tasks/${taskId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId, "transition"] });
    },
    onError: () => {
      toast({ title: "Failed to update task", variant: "destructive" });
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bids/${bidId}/transition/finalize`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId, "transition"] });
      toast({ title: "Transition finalized" });
    },
    onError: () => {
      toast({ title: "Failed to finalize transition", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!data || !data.id) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <ClipboardList className="w-16 h-16 text-muted-foreground opacity-50" />
        <h3 className="text-lg font-semibold" data-testid="text-no-transition">This project has not been awarded yet.</h3>
        <p className="text-sm text-muted-foreground">Available when bid status is &lsquo;awarded&rsquo;</p>
        <Button
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          data-testid="button-initiate-transition"
        >
          {createMutation.isPending ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Initiating...</>
          ) : (
            <><Sparkles className="w-4 h-4 mr-2" />Initiate Transition</>
          )}
        </Button>
      </div>
    );
  }

  const tasks = data.tasks || [];
  const completedCount = tasks.filter((t: any) => t.status === "completed").length;
  const pendingCount = tasks.filter((t: any) => t.status === "pending").length;
  const totalTasks = tasks.length;
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;
  const isFinalized = data.status === "finalized";

  return (
    <div className="space-y-6">
      {isFinalized && (
        <div className="flex items-center gap-3 p-4 rounded-md bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300" data-testid="banner-transition-complete">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-semibold">Transition Complete</p>
            <p className="text-sm">Finalized on {formatTransitionDate(data.finalizedAt)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-semibold" data-testid="text-transition-title">Post-Award Transition</h2>
          <Badge
            variant={isFinalized ? "default" : "secondary"}
            data-testid="badge-transition-status"
          >
            {TRANSITION_STATUS_LABELS[data.status] || data.status}
          </Badge>
        </div>
        {!isFinalized && (
          <Button
            variant="default"
            onClick={() => finalizeMutation.mutate()}
            disabled={finalizeMutation.isPending}
            data-testid="button-finalize-transition"
          >
            {finalizeMutation.isPending ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Finalizing...</>
            ) : (
              <><CheckCircle2 className="w-4 h-4 mr-2" />Finalize Transition</>
            )}
          </Button>
        )}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground">Progress</span>
          <span className="font-medium" data-testid="text-transition-progress">{progressPct}% ({completedCount} of {totalTasks})</span>
        </div>
        <Progress value={progressPct} data-testid="progress-transition" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Task Checklist</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>Task</TableHead>
                <TableHead className="w-40">Assigned Role</TableHead>
                <TableHead className="w-40">Status</TableHead>
                <TableHead className="w-44">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task: any) => (
                <TableRow key={task.id} data-testid={`row-task-${task.id}`}>
                  <TableCell>
                    <Checkbox
                      checked={task.status === "completed"}
                      disabled={isFinalized || updateTaskMutation.isPending}
                      onCheckedChange={(checked) => {
                        updateTaskMutation.mutate({
                          taskId: task.id,
                          status: checked ? "completed" : "pending",
                        });
                      }}
                      data-testid={`checkbox-task-${task.id}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className={`font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`} data-testid={`text-task-title-${task.id}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" data-testid={`badge-role-${task.id}`}>
                      {ROLE_LABELS[task.assignedRole] || task.assignedRole || "\u2014"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {isFinalized ? (
                      <span className="text-sm" data-testid={`text-task-status-${task.id}`}>{TASK_STATUS_LABELS[task.status] || task.status}</span>
                    ) : (
                      <Select
                        value={task.status}
                        onValueChange={(value) => {
                          updateTaskMutation.mutate({ taskId: task.id, status: value });
                        }}
                        disabled={updateTaskMutation.isPending}
                      >
                        <SelectTrigger data-testid={`select-task-status-${task.id}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="skipped">Skipped</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" data-testid={`text-task-completed-${task.id}`}>
                    {formatTransitionDate(task.completedAt)}
                  </TableCell>
                </TableRow>
              ))}
              {tasks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No tasks found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Total Tasks</p>
              <p className="text-lg font-semibold" data-testid="text-total-tasks">{totalTasks}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400" data-testid="text-completed-tasks">{completedCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-lg font-semibold" data-testid="text-pending-tasks">{pendingCount}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Created</p>
              <p className="text-sm font-medium" data-testid="text-transition-created">{formatTransitionDate(data.createdAt)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Finalized</p>
              <p className="text-sm font-medium" data-testid="text-transition-finalized">{formatTransitionDate(data.finalizedAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PricingTab({ bidId, data, isLoading }: { bidId: string; data: any; isLoading: boolean }) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [estValue, setEstValue] = useState("");
  const [marginPct, setMarginPct] = useState("");
  const [labor, setLabor] = useState("");
  const [materials, setMaterials] = useState("");
  const [equipment, setEquipment] = useState("");
  const [overhead, setOverhead] = useState("");
  const [profit, setProfit] = useState("");
  const [notes, setNotes] = useState("");

  const snapshotMutation = useMutation({
    mutationFn: async () => {
      const costBreakdown: Record<string, number> = {};
      if (labor) costBreakdown.labor = parseFloat(labor);
      if (materials) costBreakdown.materials = parseFloat(materials);
      if (equipment) costBreakdown.equipment = parseFloat(equipment);
      if (overhead) costBreakdown.overhead = parseFloat(overhead);
      if (profit) costBreakdown.profit = parseFloat(profit);

      const res = await apiRequest("POST", `/api/bids/${bidId}/pricing/snapshot`, {
        estimatedValue: estValue || null,
        marginPercent: marginPct || null,
        costBreakdown: Object.keys(costBreakdown).length > 0 ? costBreakdown : null,
        notes: notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Estimate Recorded", description: "Pricing snapshot saved successfully." });
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId, "pricing"] });
      setShowForm(false);
      setEstValue("");
      setMarginPct("");
      setLabor("");
      setMaterials("");
      setEquipment("");
      setOverhead("");
      setProfit("");
      setNotes("");
    },
    onError: () => {
      toast({ title: "Save Failed", description: "Could not save pricing snapshot.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const baseline = data?.baseline;
  const snapshot = data?.snapshot;
  const comparison = data?.comparison;
  const hasData = baseline || snapshot;

  const snapshotForm = (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Record Estimate</CardTitle>
        {hasData && (
          <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} data-testid="button-close-pricing-form">
            <X className="w-4 h-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Estimated Value</label>
            <Input
              type="number"
              placeholder="e.g. 8500000"
              value={estValue}
              onChange={(e) => setEstValue(e.target.value)}
              data-testid="input-pricing-estimated-value"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">Margin %</label>
            <Input
              type="number"
              placeholder="e.g. 12.5"
              value={marginPct}
              onChange={(e) => setMarginPct(e.target.value)}
              data-testid="input-pricing-margin"
            />
          </div>
        </div>

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-1" data-testid="button-toggle-cost-breakdown">
              <ChevronRight className="w-3 h-3" />
              Cost Breakdown (optional)
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Labor</label>
                <Input type="number" placeholder="0" value={labor} onChange={(e) => setLabor(e.target.value)} data-testid="input-pricing-labor" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Materials</label>
                <Input type="number" placeholder="0" value={materials} onChange={(e) => setMaterials(e.target.value)} data-testid="input-pricing-materials" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Equipment</label>
                <Input type="number" placeholder="0" value={equipment} onChange={(e) => setEquipment(e.target.value)} data-testid="input-pricing-equipment" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Overhead</label>
                <Input type="number" placeholder="0" value={overhead} onChange={(e) => setOverhead(e.target.value)} data-testid="input-pricing-overhead" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Profit</label>
                <Input type="number" placeholder="0" value={profit} onChange={(e) => setProfit(e.target.value)} data-testid="input-pricing-profit" />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div>
          <label className="text-sm font-medium mb-1.5 block">Notes</label>
          <Textarea
            placeholder="Pricing notes, assumptions, or rationale..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            data-testid="input-pricing-notes"
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={() => snapshotMutation.mutate()}
            disabled={snapshotMutation.isPending || !estValue}
            data-testid="button-save-pricing-snapshot"
          >
            {snapshotMutation.isPending ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <DollarSign className="w-4 h-4 mr-2" />
            )}
            Save Estimate
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (!hasData) {
    return (
      <div className="space-y-4">
        {showForm ? (
          snapshotForm
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <DollarSign className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium" data-testid="text-pricing-empty">No pricing intelligence available yet.</p>
            <p className="text-sm mb-4">Record an estimate or add historical data to get started.</p>
            <div className="flex gap-3">
              <Button onClick={() => setShowForm(true)} data-testid="button-record-estimate">
                <DollarSign className="w-4 h-4 mr-2" />
                Record Estimate
              </Button>
              <Button variant="outline" onClick={() => window.open("/api/pricing/history", "_blank")} data-testid="link-add-historical">
                <TrendingUp className="w-4 h-4 mr-2" />
                Add Historical Data
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {baseline && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Market Baseline</CardTitle>
              <Badge variant="outline" data-testid="badge-sample-size">{baseline.sampleSize} records</Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-2xl font-bold" data-testid="text-baseline-median">{formatCurrency(baseline.medianValue)}</p>
                <p className="text-xs text-muted-foreground">Median Award Value</p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Range: </span>
                  <span data-testid="text-baseline-range">{formatCurrency(baseline.minValue)} &mdash; {formatCurrency(baseline.maxValue)}</span>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Historical Win Rate: </span>
                  <span className="font-medium" data-testid="text-baseline-winrate">{baseline.winRate != null ? `${baseline.winRate}%` : "\u2014"}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {comparison ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Current Estimate</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowForm(true)} data-testid="button-update-estimate">
                  <Pencil className="w-3 h-3 mr-1" />
                  Update
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-2xl font-bold" data-testid="text-current-estimate">{formatCurrency(comparison.currentValue)}</p>
                  <p className="text-xs text-muted-foreground">Your Bid Estimate</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div className="flex items-center gap-1">
                    {comparison.delta >= 0 ? (
                      <TrendingUp className="w-4 h-4 text-amber-500" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-green-500" />
                    )}
                    <span data-testid="text-delta">{formatDelta(comparison.delta)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Win Probability: </span>
                    <span className="font-medium" data-testid="text-win-probability">{comparison.winProbability}%</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Margin: </span>
                    <span className="font-medium" data-testid="text-margin">{comparison.marginPercent != null ? `${comparison.marginPercent}%` : "\u2014"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                <DollarSign className="w-8 h-8 mb-2" />
                <p className="text-sm font-medium mb-2">No estimate recorded</p>
                <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-record-estimate-inline">
                  Record Estimate
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {baseline && (
        <Card>
          <CardHeader className="space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pricing Guidance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Recommended Range</p>
                <p className="text-sm font-medium" data-testid="text-recommended-range">
                  {formatCurrency(baseline.q25)} &mdash; {formatCurrency(baseline.q75)}
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Competitive Floor</p>
                <p className="text-sm font-medium" data-testid="text-competitive-floor">
                  {formatCurrency(baseline.competitiveFloor)}
                </p>
              </div>
              <div className="p-3 bg-muted/50 rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Margin Safety</p>
                <p className="text-sm font-medium" data-testid="text-margin-safety">
                  {comparison?.marginSafety != null ? formatCurrency(comparison.marginSafety) : "\u2014"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showForm && snapshotForm}

      {!showForm && !baseline && !snapshot && (
        <div className="flex justify-center pt-4">
          <Button onClick={() => setShowForm(true)} data-testid="button-record-estimate-bottom">
            <DollarSign className="w-4 h-4 mr-2" />
            Record Estimate
          </Button>
        </div>
      )}
    </div>
  );
}

function ComplianceTab({ bidId, data, isLoading }: { bidId: string; data: ComplianceSummary | undefined; isLoading: boolean }) {
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bids/${bidId}/compliance/generate`);
      return res.json();
    },
    onSuccess: (result) => {
      toast({ title: "Checklist Generated", description: `${result.generated} items created, ${result.skipped} already existed.` });
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId, "compliance"] });
    },
    onError: () => {
      toast({ title: "Generation Failed", description: "Could not generate compliance checklist.", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ itemId, status }: { itemId: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/compliance/${itemId}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId, "compliance"] });
    },
    onError: () => {
      toast({ title: "Update Failed", description: "Could not update item status.", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  if (!data || data.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-4">
        <Shield className="w-12 h-12" />
        <p className="text-lg font-medium" data-testid="text-compliance-empty">No compliance requirements yet</p>
        <p className="text-sm">Generate a checklist from the solicitation to get started</p>
        <Button
          onClick={() => generateMutation.mutate()}
          disabled={generateMutation.isPending}
          data-testid="button-generate-checklist-empty"
        >
          {generateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-2" />}
          Generate Checklist
        </Button>
      </div>
    );
  }

  const scoreColor = data.complianceScore >= 80 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" :
    data.complianceScore >= 50 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" :
    "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";

  const progressColor = data.complianceScore >= 80 ? "bg-green-500" :
    data.complianceScore >= 50 ? "bg-amber-500" : "bg-red-500";

  const grouped: Record<string, ComplianceItemData[]> = {};
  for (const item of data.items) {
    if (!grouped[item.severity]) grouped[item.severity] = [];
    grouped[item.severity].push(item);
  }

  const severityOrder = ["critical", "high", "medium", "low"];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge className={`text-lg px-3 py-1 no-default-hover-elevate no-default-active-elevate ${scoreColor}`} data-testid="badge-compliance-score">
              Compliance Score: {data.complianceScore}%
            </Badge>
            <Badge variant="destructive" data-testid="badge-critical-gaps">
              {data.criticalGaps.length} Critical Gap{data.criticalGaps.length !== 1 ? "s" : ""}
            </Badge>
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 no-default-hover-elevate no-default-active-elevate" data-testid="badge-high-risk">
              {data.highRiskItems.length} High Risk
            </Badge>
            <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 no-default-hover-elevate no-default-active-elevate" data-testid="badge-satisfied-count">
              {data.byStatus.satisfied} Satisfied
            </Badge>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            data-testid="button-generate-checklist"
          >
            {generateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardList className="w-4 h-4 mr-2" />}
            Generate Checklist
          </Button>
        </div>

        <div className="relative w-full h-3 rounded-full bg-muted overflow-hidden" data-testid="progress-compliance">
          <div
            className={`absolute left-0 top-0 h-full rounded-full transition-all ${progressColor}`}
            style={{ width: `${data.complianceScore}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{data.byStatus.satisfied} of {data.total} requirements satisfied</span>
          <span>{data.complianceScore}%</span>
        </div>
      </div>

      {severityOrder.map(severity => {
        const items = grouped[severity];
        if (!items || items.length === 0) return null;

        return (
          <Card key={severity}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base">{SEVERITY_LABELS[severity]}</CardTitle>
                <Badge className={`${SEVERITY_COLORS[severity]} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-severity-group-${severity}`}>
                  {items.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 p-3 rounded-md border"
                  data-testid={`row-compliance-${item.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium" data-testid={`text-compliance-title-${item.id}`}>{item.title}</p>
                    <div className="flex items-center gap-3 flex-wrap mt-1">
                      {item.clauseRef && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-compliance-clause-${item.id}`}>
                          {item.clauseRef}
                        </span>
                      )}
                      {item.folderSortOrder != null && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-compliance-folder-${item.id}`}>
                          Section {String(item.folderSortOrder).padStart(2, "0")} {"\u2014"} {BID_FOLDER_NAMES[item.folderSortOrder] || "Unknown"}
                        </span>
                      )}
                      {item.ownerRole && (
                        <span className="text-xs text-muted-foreground" data-testid={`text-compliance-owner-${item.id}`}>
                          {item.ownerRole.charAt(0).toUpperCase() + item.ownerRole.slice(1).replace(/_/g, " ")}
                        </span>
                      )}
                      {item.dueAt ? (
                        <span className="text-xs text-muted-foreground" data-testid={`text-compliance-due-${item.id}`}>
                          Due: {new Date(item.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Select
                    value={item.status}
                    onValueChange={(val) => updateStatusMutation.mutate({ itemId: item.id, status: val })}
                  >
                    <SelectTrigger
                      className={`w-[140px] text-xs ${STATUS_COLORS[item.status] || ""}`}
                      data-testid={`select-compliance-status-${item.id}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="missing">Missing</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="satisfied">Satisfied</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

type ViewMode = "grid" | "list" | "tree";

export default function BidJacket() {
  console.log("[BID-JACKET] Component rendering - TABS V2");
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const bidId = params.id || "";

  const urlParams = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const initialTab = urlParams.get("tab") || "overview";
  const initialPage = urlParams.get("page") ? parseInt(urlParams.get("page")!, 10) : null;

  const [activeTab, setActiveTab] = useState(initialTab);
  const [viewMode, setViewMode] = useState<ViewMode>("tree");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [manualSelectLock, setManualSelectLock] = useState(false);
  const missingDocIds = useRef(new Set<string>());
  const [missingDocVersion, setMissingDocVersion] = useState(0);
  const [selectedDocument, setSelectedDocument] = useState<JacketDocument | null>(null);
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [binderViewerOpen, setBinderViewerOpen] = useState(initialTab === "binder" && initialPage != null);
  const [binderPage, setBinderPage] = useState(initialPage || 1);
  const [inlineViewDoc, setInlineViewDoc] = useState<JacketDocument | null>(null);
  const [photoLightboxDoc, setPhotoLightboxDoc] = useState<JacketDocument | null>(null);
  const [editingTagsDocId, setEditingTagsDocId] = useState<string | null>(null);
  const [tagInputValue, setTagInputValue] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<"name" | "date" | "type">("name");
  const [zoom, setZoom] = useState(100);
  const [activityFilter, setActivityFilter] = useState("all");
  const [expandedBinderJson, setExpandedBinderJson] = useState<Set<string>>(new Set());
  const [binderModalOpen, setBinderModalOpen] = useState(false);
  const [binderJobId, setBinderJobId] = useState<string | null>(null);
  const [binderJobStatus, setBinderJobStatus] = useState<{ status: string; progress: number; outputs?: { zipDocumentId?: string | null; pdfDocumentId?: string | null }; error?: string | null } | null>(null);
  const [approvalGateOpen, setApprovalGateOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [deleteConfirmDoc, setDeleteConfirmDoc] = useState<JacketDocument | null>(null);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [createDocOpen, setCreateDocOpen] = useState(false);
  const [createDocFolderId, setCreateDocFolderId] = useState<string | null>(null);
  const [createDocTitle, setCreateDocTitle] = useState("");
  const [createDocType, setCreateDocType] = useState("general");
  const [createDocNotes, setCreateDocNotes] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailDoc, setDetailDoc] = useState<JacketDocument | null>(null);
  const [versionHistoryDoc, setVersionHistoryDoc] = useState<JacketDocument | null>(null);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bidderSearch, setBidderSearch] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [selectedVendorIds, setSelectedVendorIds] = useState<Set<string>>(new Set());
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [selectedAlternates, setSelectedAlternates] = useState<string[]>([]);
  const [showAddSection, setShowAddSection] = useState(false);
  const [showAddLineItem, setShowAddLineItem] = useState<string | null>(null);
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [newSectionType, setNewSectionType] = useState("base");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemCostCode, setNewItemCostCode] = useState("");
  const [newItemUom, setNewItemUom] = useState("");
  const [newItemQty, setNewItemQty] = useState("");

  const { data: bidProject, isLoading: bidLoading } = useQuery<{
    id: string;
    opportunityId: string;
    opportunityTitle: string;
    status: string;
    stage: string;
    dueAt: string;
    noticeId: string;
    agency: string;
    team: string[];
    naicsCode: string;
    pscCode: string;
    setAside: string;
    popStartDate: string;
    popEndDate: string;
    contractValue: number;
    winProbability: number | null;
    notes: string;
    documentationJson?: {
      executiveSummary?: string;
      technicalApproach?: string;
      pastPerformance?: string;
      keyPersonnel?: string;
      complianceNotes?: string;
      riskAssessment?: string;
      competitiveAnalysis?: string;
      pricingStrategy?: string;
    } | null;
  }>({
    queryKey: ["/api/bid-projects", bidId],
    enabled: !!bidId,
  });

  const { data: jacketData, isLoading: foldersLoading, refetch: refetchDocs } = useQuery<{
    folders: JacketFolder[];
    totalDocuments: number;
  }>({
    queryKey: ["/api/jackets/bid", bidId, "documents"],
    enabled: !!bidId,
  });
  const folders = jacketData?.folders || [];
  const totalDocumentCount = jacketData?.totalDocuments || 0;

  const { data: readiness, isLoading: readinessLoading } = useQuery<BidReadiness>({
    queryKey: ["/api/bids", bidId, "readiness"],
    enabled: !!bidId,
  });

  const { data: binderVersions = [] } = useQuery<BinderVersion[]>({
    queryKey: ["/api/bids", bidId, "binder", "versions"],
    enabled: !!bidId,
  });

  const { data: herbieSuggestions = [] } = useQuery<HerbieSuggestion[]>({
    queryKey: ["/api/bids", bidId, "herbie-suggestions"],
    enabled: !!bidId,
  });

  const { data: jacketIntegrity, isError: integrityError } = useQuery<JacketIntegrity>({
    queryKey: ["/api/jackets/bid", bidId, "integrity"],
    enabled: !!bidId && activeTab === "overview",
    retry: 1,
  });

  const repairJacketMutation = useMutation<EnsureCanonicalResult>({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/jackets/bid/${bidId}/ensure-canonical`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Jacket Repaired",
        description: `Created ${data.createdFolders} folders, renamed ${data.renamedFolders}. Jacket is now ${data.isHealthy ? "healthy" : "needs attention"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "integrity"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
    },
    onError: (error: any) => {
      toast({
        title: "Repair Failed",
        description: error.message || "Could not repair jacket structure.",
        variant: "destructive",
      });
    },
  });

  const { data: rfis = [], isLoading: rfisLoading } = useQuery<RFI[]>({
    queryKey: [`/api/bid-projects/${bidId}/rfis`],
    enabled: !!bidId && activeTab === "rfis",
  });

  const { data: submittals = [], isLoading: submittalsLoading } = useQuery<Submittal[]>({
    queryKey: [`/api/bid-projects/${bidId}/submittals`],
    enabled: !!bidId && activeTab === "submittals",
  });

  const { data: changeOrders = [], isLoading: changeOrdersLoading } = useQuery<ChangeOrder[]>({
    queryKey: [`/api/bid-projects/${bidId}/change-orders`],
    enabled: !!bidId && activeTab === "change-orders",
  });

  const { data: dailyLogs = [], isLoading: dailyLogsLoading } = useQuery<DailyLog[]>({
    queryKey: [`/api/bid-projects/${bidId}/daily-logs`],
    enabled: !!bidId && activeTab === "daily-log",
  });

  const { data: financials, isLoading: financialsLoading } = useQuery<FinancialData>({
    queryKey: [`/api/bid-projects/${bidId}/financials`],
    enabled: !!bidId && activeTab === "financials",
  });

  const { data: directory = [], isLoading: directoryLoading } = useQuery<DirectoryEntry[]>({
    queryKey: [`/api/bid-projects/${bidId}/directory`],
    enabled: !!bidId && activeTab === "directory",
  });

  const { data: complianceData, isLoading: complianceLoading } = useQuery<ComplianceSummary>({
    queryKey: ["/api/bids", bidId, "compliance"],
    enabled: !!bidId && activeTab === "compliance",
  });

  const { data: pricingData, isLoading: pricingLoading } = useQuery<any>({
    queryKey: ["/api/bids", bidId, "pricing"],
    enabled: !!bidId && activeTab === "pricing",
  });

  const { data: transitionData, isLoading: transitionLoading } = useQuery<any>({
    queryKey: ["/api/bids", bidId, "transition"],
    enabled: !!bidId && activeTab === "transition",
  });

  const { data: auditEvents = [], isLoading: auditLoading } = useQuery<AuditEvent[]>({
    queryKey: [`/api/audit/events?entityType=bid_project&entityId=${bidId}`],
    enabled: !!bidId && activeTab === "activity",
  });

  const { data: invitationsData, isLoading: invitationsLoading } = useQuery<{
    invitations: Array<{
      id: string;
      vendorId: string;
      status: string;
      sentAt: string;
      openedAt: string | null;
      respondedAt: string | null;
      submittedAt: string | null;
      dueAt: string | null;
      lastActivityAt: string | null;
      createdAt: string;
      vendor?: { companyName: string; contactName: string; email: string; phone: string; vendorType: string };
    }>;
    metrics: {
      total: number;
      opened: number;
      intends: number;
      declined: number;
      submitted: number;
      downloaded: number;
      engagementRate: number;
      responseRate: number;
    };
  }>({
    queryKey: ['/api/bid-projects', bidId, 'invitations'],
    enabled: !!bidId && activeTab === "bidders",
  });

  const { data: vendorsList = [] } = useQuery<Array<{
    id: string;
    companyName: string;
    contactName: string;
    email: string;
    phone: string;
    vendorType: string;
    status: string;
  }>>({
    queryKey: ['/api/vendors'],
    enabled: !!bidId && inviteDialogOpen,
  });

  const { data: bidFormData, isLoading: bidFormLoading } = useQuery<any>({
    queryKey: ['/api/bid-projects', bidId, 'bid-forms'],
    queryFn: async () => {
      const res = await fetch(`/api/bid-projects/${bidId}/bid-forms`);
      return res.json();
    },
    enabled: !!bidId && activeTab === "bid-form",
  });

  const { data: costCodesData } = useQuery<any[]>({
    queryKey: ['/api/cost-codes'],
    queryFn: async () => {
      const res = await fetch('/api/cost-codes');
      return res.json();
    },
    enabled: !!bidId && (activeTab === "bid-form" || activeTab === "leveling"),
  });

  const { data: bidFormFull, refetch: refetchBidFormFull } = useQuery<any>({
    queryKey: ['/api/bid-forms', 'full'],
    queryFn: async () => {
      if (!bidFormData || bidFormData.length === 0) return null;
      const res = await fetch(`/api/bid-forms/${bidFormData[0].id}/full`);
      return res.json();
    },
    enabled: !!bidFormData && bidFormData.length > 0 && activeTab === "bid-form",
  });

  const { data: levelingData, refetch: refetchLeveling } = useQuery<any>({
    queryKey: ['/api/bid-projects', bidId, 'leveling'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAlternates.length > 0) params.set('alternates', selectedAlternates.join(','));
      const res = await fetch(`/api/bid-projects/${bidId}/leveling?${params}`);
      return res.json();
    },
    enabled: !!bidId && activeTab === "leveling",
  });

  const { data: awardData, refetch: refetchAward } = useQuery<any>({
    queryKey: ['/api/bid-projects', bidId, 'award'],
    queryFn: async () => {
      const res = await fetch(`/api/bid-projects/${bidId}/award`);
      return res.json();
    },
    enabled: !!bidId && activeTab === "leveling",
  });

  const [awardModalOpen, setAwardModalOpen] = useState(false);
  const [awardVendor, setAwardVendor] = useState<any>(null);
  const [awardNotes, setAwardNotes] = useState("");
  const [rescindModalOpen, setRescindModalOpen] = useState(false);
  const [rescindReason, setRescindReason] = useState("");

  const [takeoffDialogOpen, setTakeoffDialogOpen] = useState(false);
  const [editingTakeoffItem, setEditingTakeoffItem] = useState<any>(null);
  const [takeoffForm, setTakeoffForm] = useState({ name: "", category: "General", quantity: "1", unit: "Each", unitCost: "0.00", notes: "" });

  const { data: takeoffItems = [], isLoading: takeoffLoading } = useQuery<any[]>({
    queryKey: [`/api/takeoffs?bidProjectId=${bidId}`],
    enabled: !!bidId,
  });

  const createTakeoffMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/takeoffs", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/takeoffs?bidProjectId=${bidId}`] });
      setTakeoffDialogOpen(false);
      resetTakeoffForm();
      toast({ title: "Line Item Added", description: "Takeoff line item created successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to add line item.", variant: "destructive" }),
  });

  const updateTakeoffMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PATCH", `/api/takeoffs/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/takeoffs?bidProjectId=${bidId}`] });
      setTakeoffDialogOpen(false);
      setEditingTakeoffItem(null);
      resetTakeoffForm();
      toast({ title: "Line Item Updated", description: "Takeoff line item updated successfully." });
    },
    onError: () => toast({ title: "Error", description: "Failed to update line item.", variant: "destructive" }),
  });

  const deleteTakeoffMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/takeoffs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/takeoffs?bidProjectId=${bidId}`] });
      toast({ title: "Line Item Deleted", description: "Takeoff line item removed." });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete line item.", variant: "destructive" }),
  });

  function resetTakeoffForm() {
    setTakeoffForm({ name: "", category: "General", quantity: "1", unit: "Each", unitCost: "0.00", notes: "" });
  }

  function openAddTakeoff() {
    setEditingTakeoffItem(null);
    resetTakeoffForm();
    setTakeoffDialogOpen(true);
  }

  function openEditTakeoff(item: any) {
    setEditingTakeoffItem(item);
    setTakeoffForm({
      name: item.name || "",
      category: item.category || "General",
      quantity: String(item.quantity || "1"),
      unit: item.unit || "Each",
      unitCost: String(item.unitCost || "0.00"),
      notes: item.notes || "",
    });
    setTakeoffDialogOpen(true);
  }

  function handleTakeoffSubmit() {
    const qty = parseFloat(takeoffForm.quantity);
    const cost = parseFloat(takeoffForm.unitCost);
    if (!takeoffForm.name.trim() || isNaN(qty) || qty <= 0 || isNaN(cost) || cost < 0) {
      toast({ title: "Validation Error", description: "Please fill all required fields with valid values.", variant: "destructive" });
      return;
    }
    if (editingTakeoffItem) {
      updateTakeoffMutation.mutate({ id: editingTakeoffItem.id, name: takeoffForm.name.trim(), category: takeoffForm.category, quantity: qty, unit: takeoffForm.unit, unitCost: cost, notes: takeoffForm.notes || undefined });
    } else {
      createTakeoffMutation.mutate({ bidProjectId: bidId, name: takeoffForm.name.trim(), category: takeoffForm.category, quantity: qty, unit: takeoffForm.unit, unitCost: cost, notes: takeoffForm.notes || undefined });
    }
  }

  const takeoffGrandTotal = useMemo(() => {
    return takeoffItems.reduce((sum: number, item: any) => {
      return sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);
    }, 0);
  }, [takeoffItems]);

  const takeoffByCategory = useMemo(() => {
    const groups: Record<string, { items: any[], total: number }> = {};
    takeoffItems.forEach((item: any) => {
      const cat = item.category || "General";
      if (!groups[cat]) groups[cat] = { items: [], total: 0 };
      groups[cat].items.push(item);
      groups[cat].total += (parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);
    });
    return groups;
  }, [takeoffItems]);

  const awardMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/bid-projects/${bidId}/award`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'award'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'leveling'] });
      setAwardModalOpen(false);
      setAwardVendor(null);
      setAwardNotes("");
      toast({ title: "Bid Awarded", description: "The bid has been awarded and the contract packet has been generated." });
    },
    onError: (err: any) => {
      toast({ title: "Award Failed", description: err.message || "Could not award the bid", variant: "destructive" });
    },
  });

  const rescindMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/bid-projects/${bidId}/award/rescind`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'award'] });
      queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'leveling'] });
      setRescindModalOpen(false);
      setRescindReason("");
      toast({ title: "Award Rescinded", description: "The award has been rescinded. Vendors can now submit bids again." });
    },
    onError: (err: any) => {
      toast({ title: "Rescind Failed", description: err.message || "Could not rescind", variant: "destructive" });
    },
  });

  const regeneratePacketMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bid-projects/${bidId}/award/packet/regenerate`, {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'award'] });
      await refetchAward();
      toast({ title: "Packet Regenerated", description: "A new version of the award packet has been generated." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Could not regenerate packet", variant: "destructive" });
    },
  });

  const [lastCreatedLinks, setLastCreatedLinks] = useState<Array<{ vendorId: string; portalUrl: string }>>([]);

  const sendInvitesMutation = useMutation({
    mutationFn: (vendorIds: string[]) => apiRequest("POST", `/api/bid-projects/${bidId}/invitations`, { vendorIds }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'invitations'] });
      setInviteDialogOpen(false);
      setSelectedVendorIds(new Set());
      if (data.results?.length > 0) {
        setLastCreatedLinks(data.results.map((r: any) => ({ vendorId: r.vendorId, portalUrl: r.portalUrl })));
      }
      toast({ title: "Invitations Sent", description: `${data.created} invitation(s) sent successfully. Portal links are shown below.` });
    },
    onError: () => {
      toast({ title: "Failed to Send", description: "Could not send bid invitations.", variant: "destructive" });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (invitationId: string) => apiRequest("POST", `/api/bid-projects/${bidId}/invitations/${invitationId}/resend`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'invitations'] });
      if (data.portalUrl) {
        setLastCreatedLinks([{ vendorId: '', portalUrl: data.portalUrl }]);
        toast({ title: "Invitation Resent", description: "New portal link generated. See below." });
      } else {
        toast({ title: "Invitation Resent", description: "The invitation has been resent." });
      }
    },
  });

  const generateBinderMutation = useMutation({
    mutationFn: (opts: { includeMergedPdf: boolean; includeZip: boolean; watermark: boolean; includeLegacyFolders: boolean }) =>
      apiRequest("POST", `/api/bids/${bidId}/binder`, opts),
    onSuccess: async (response: any) => {
      const data = typeof response === "object" ? response : await response.json?.() || response;
      const jobId = data?.jobId;
      if (jobId) {
        setBinderJobId(jobId);
        setBinderJobStatus({ status: "queued", progress: 0 });
        setActiveTab("binder");
      }
    },
    onError: () => {
      toast({ title: "Binder Generation Failed", description: "Could not start the bid binder job.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!binderJobId) return;
    let pollErrorCount = 0;
    const poll = async () => {
      try {
        const res = await fetch(`/api/binder/jobs/${binderJobId}`);
        if (!res.ok) {
          pollErrorCount++;
          if (pollErrorCount >= 5) {
            setBinderJobId(null);
            setBinderJobStatus(null);
            toast({ title: "Binder Status Error", description: "Lost connection to binder job. Please try again.", variant: "destructive" });
          }
          return;
        }
        pollErrorCount = 0;
        const data = await res.json();
        setBinderJobStatus(data);
        if (data.status === "complete") {
          setBinderJobId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId, "binder", "versions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
          toast({ title: "Binder Ready", description: "Your bid binder has been generated. Download the PDF and ZIP below." });
        } else if (data.status === "failed") {
          setBinderJobId(null);
          toast({ title: "Binder Generation Failed", description: data.error || "An error occurred.", variant: "destructive" });
        }
      } catch {
        pollErrorCount++;
        if (pollErrorCount >= 5) {
          setBinderJobId(null);
          setBinderJobStatus(null);
          toast({ title: "Binder Status Error", description: "Network error while checking binder status. Please try again.", variant: "destructive" });
        }
      }
    };
    const interval = setInterval(poll, 1500);
    poll();
    return () => clearInterval(interval);
  }, [binderJobId, bidId, toast]);

  const submitApprovalMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bids/${bidId}/submit-approval`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bidId] });
      toast({ title: "Bid Submitted for Final Approval", description: "Awaiting leadership sign-off before submission." });
      setApprovalGateOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to submit bid for approval", variant: "destructive" });
    },
  });

  const autoBuildMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bids/${bidId}/jacket/autopopulate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
      setIsBuilding(false);
      toast({ title: "Jacket Populated", description: "HERBIE generated draft documents for your bid jacket" });
    },
    onError: () => {
      setIsBuilding(false);
      toast({ title: "Build Failed", description: "Could not auto-populate jacket", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) => apiRequest("DELETE", `/api/documents/${docId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
      setDeleteConfirmDoc(null);
      setDocumentViewerOpen(false);
      setSelectedDocument(null);
      toast({ title: "Document Deleted" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
    },
  });

  const moveMutation = useMutation({
    mutationFn: ({ docId, targetFolderId }: { docId: string; targetFolderId: string }) =>
      apiRequest("PATCH", `/api/documents/${docId}/move`, { targetFolderId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
      toast({ title: "Document Moved" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: ({ docId, title }: { docId: string; title: string }) =>
      apiRequest("PATCH", `/api/documents/${docId}/rename`, { title, fileName: title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
      setRenamingDocId(null);
      setRenameValue("");
      toast({ title: "Document Renamed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to rename document", variant: "destructive" });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({ docId, status }: { docId: string; status: string }) =>
      apiRequest("PATCH", `/api/documents/${docId}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
      toast({ title: "Status Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  const tagsMutation = useMutation({
    mutationFn: ({ docId, tags }: { docId: string; tags: string[] }) =>
      apiRequest("PATCH", `/api/documents/${docId}/tags`, { tags }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
      toast({ title: "Tags Updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update tags", variant: "destructive" });
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (docId: string) => apiRequest("POST", `/api/documents/${docId}/duplicate`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
      toast({ title: "Document Duplicated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to duplicate document", variant: "destructive" });
    },
  });

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setUploadFolderId(null);
      setUploadDialogOpen(true);
    }
  };

  const handleBulkDelete = async () => {
    const docIds = Array.from(selectedDocs);
    for (const docId of docIds) {
      await apiRequest("DELETE", `/api/documents/${docId}`);
    }
    queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
    setSelectedDocs(new Set());
    setBulkMode(false);
    toast({ title: "Documents Deleted", description: `${docIds.length} document(s) deleted` });
  };

  const handleBulkMove = async (targetFolderId: string) => {
    const docIds = Array.from(selectedDocs);
    for (const docId of docIds) {
      await apiRequest("PATCH", `/api/documents/${docId}/move`, { targetFolderId });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
    setSelectedDocs(new Set());
    toast({ title: "Documents Moved", description: `${docIds.length} document(s) moved` });
  };

  const handleBulkStatusChange = async (status: string) => {
    const docIds = Array.from(selectedDocs);
    for (const docId of docIds) {
      await apiRequest("PATCH", `/api/documents/${docId}/status`, { status });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
    setSelectedDocs(new Set());
    toast({ title: "Status Updated", description: `${docIds.length} document(s) updated to ${status}` });
  };

  const handleCreateDocument = async () => {
    if (!createDocTitle.trim()) return;
    try {
      const content = createDocNotes || " ";
      const fileName = `${createDocTitle.trim()}.txt`;
      const urlRes = await apiRequest("POST", "/api/uploads/request-url", {
        name: fileName,
        size: content.length,
        contentType: "text/plain",
      });
      const urlData = await urlRes.json();
      await fetch(urlData.uploadURL, {
        method: "PUT",
        body: content,
        headers: { "Content-Type": "text/plain" },
      });
      await apiRequest("POST", "/api/documents/upload", {
        folderId: createDocFolderId || folders[0]?.id,
        title: createDocTitle.trim(),
        fileName,
        objectPath: urlData.objectPath,
        mimeType: "text/plain",
        fileSize: content.length,
        jacketType: "bid",
        jacketId: bidId,
        documentType: createDocType,
        visibility: "internal",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
      setCreateDocOpen(false);
      setCreateDocTitle("");
      setCreateDocType("general");
      setCreateDocNotes("");
      setCreateDocFolderId(null);
      toast({ title: "Document Created" });
    } catch {
      toast({ title: "Error", description: "Failed to create document", variant: "destructive" });
    }
  };

  const getDocStatusVariant = (status: string): "default" | "secondary" | "outline" => {
    switch (status) {
      case "approved":
      case "final":
        return "default";
      case "draft":
        return "secondary";
      default:
        return "outline";
    }
  };

  const toggleDocSelection = (docId: string) => {
    setSelectedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleAutoBuild = () => {
    setIsBuilding(true);
    autoBuildMutation.mutate();
  };

  const handleUploadComplete = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/jackets/bid", bidId, "documents"] });
    setUploadDialogOpen(false);
    setUploadFolderId(null);
  };

  useEffect(() => {
    if (!selectedFolderId && folders?.length) {
      setSelectedFolderId(folders[0].id);
    }
  }, [folders, selectedFolderId]);

  const rightPanelRef = useRef<HTMLDivElement>(null);

  const getScrollViewport = useCallback(() => {
    const root = rightPanelRef.current;
    if (!root) return null;
    return (
      root.querySelector?.("[data-radix-scroll-area-viewport]") ??
      root
    ) as HTMLElement | null;
  }, []);

  const handleFolderClick = useCallback((folderId: string) => {
    setManualSelectLock(true);
    setSelectedFolderId(folderId);

    requestAnimationFrame(() => {
      const container = getScrollViewport();
      const el = document.getElementById(`folder-section-${folderId}`) as HTMLElement | null;
      if (!container || !el) return;

      const top = el.offsetTop;
      container.scrollTo({ top, behavior: "smooth" });
    });

    window.setTimeout(() => setManualSelectLock(false), 600);
  }, [getScrollViewport]);

  useEffect(() => {
    const container = getScrollViewport();
    if (!container || !folders.length || activeTab !== "documents") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (manualSelectLock) return;

        const visible = entries
          .filter(e => e.isIntersecting)
          .map(e => {
            const id = e.target.getAttribute("data-folder-id");
            const rect = (e.target as HTMLElement).getBoundingClientRect();
            return id ? { id, top: rect.top } : null;
          })
          .filter(Boolean) as { id: string; top: number }[];

        if (!visible.length) return;

        visible.sort((a, b) => Math.abs(a.top) - Math.abs(b.top));
        setSelectedFolderId(visible[0].id);
      },
      {
        root: container,
        rootMargin: "0px 0px -60% 0px",
        threshold: 0.1,
      }
    );

    const sections = container.querySelectorAll("[data-folder-id]");
    sections.forEach(s => observer.observe(s));

    return () => observer.disconnect();
  }, [folders, activeTab, manualSelectLock, viewMode, getScrollViewport]);

  const isPdfFile = (name: string) => name.toLowerCase().endsWith(".pdf");
  const isImageFile = (name: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
  const isPhotosFolder = useMemo(() => {
    if (!selectedFolderId) return false;
    const folder = folders.find(f => f.id === selectedFolderId);
    return folder?.name?.includes("Photos") || folder?.name?.includes("15-");
  }, [selectedFolderId, folders]);
  const canViewInApp = (name: string) => isPdfFile(name) || isImageFile(name);
  const getEgnyteUrl = (doc: JacketDocument) => {
    const domain = "blackhawk";
    return `https://${domain}.egnyte.com/app/index.do#storage/files/1/Shared/BidDocs/${encodeURIComponent(doc.fileName)}`;
  };

  const markDocMissing = useCallback((docId: string) => {
    if (!missingDocIds.current.has(docId)) {
      missingDocIds.current.add(docId);
      setMissingDocVersion(v => v + 1);
    }
  }, []);

  const isDocMissing = useCallback((docId: string) => {
    return missingDocIds.current.has(docId);
  }, [missingDocVersion]);

  const handleImgError = useCallback((docId: string) => (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = "none";
    markDocMissing(docId);
  }, [markDocMissing]);

  const allDocuments = useMemo(() => {
    return folders.flatMap(f => f.documents || []);
  }, [folders]);

  const filteredDocuments = useMemo(() => {
    let docs = allDocuments;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      docs = docs.filter(d =>
        d.fileName.toLowerCase().includes(q) ||
        d.title.toLowerCase().includes(q) ||
        (d.documentType || "").toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") {
      docs = docs.filter(d => d.status === statusFilter);
    }
    switch (sortBy) {
      case "date":
        docs = [...docs].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
        break;
      case "type":
        docs = [...docs].sort((a, b) => (a.documentType || "").localeCompare(b.documentType || ""));
        break;
      default:
        docs = [...docs].sort((a, b) => a.fileName.localeCompare(b.fileName));
    }
    return docs;
  }, [allDocuments, searchQuery, sortBy, statusFilter]);

  const photoDocuments = useMemo(() => {
    return filteredDocuments.filter(d => isImageFile(d.fileName));
  }, [filteredDocuments]);

  const filteredAuditEvents = useMemo(() => {
    if (activityFilter === "all") return auditEvents;
    return auditEvents.filter(e => e.eventType === activityFilter);
  }, [auditEvents, activityFilter]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const openDocumentViewer = (doc: JacketDocument) => {
    setSelectedDocument(doc);
    setDocumentViewerOpen(true);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  const getDocTypeIcon = (type: string | null) => {
    switch (type) {
      case "solicitation": return <FileText className="w-4 h-4 text-blue-500" />;
      case "insurance": return <FileCheck className="w-4 h-4 text-green-500" />;
      case "bonding": return <FileCheck className="w-4 h-4 text-purple-500" />;
      case "pricing": return <FileText className="w-4 h-4 text-amber-500" />;
      default: return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status.toLowerCase()) {
      case "approved":
      case "completed":
      case "ready":
      case "met":
      case "closed":
        return "default";
      case "pending":
      case "in_progress":
      case "draft":
      case "partial":
        return "secondary";
      case "rejected":
      case "overdue":
      case "not_met":
        return "destructive";
      default:
        return "outline";
    }
  };

  const getComplianceIcon = (status: string) => {
    switch (status) {
      case "met": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case "not_met": return <XCircle className="w-4 h-4 text-destructive" />;
      case "partial": return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      default: return <Minus className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const latestBinder = binderVersions.find(b => b.status === "ready");

  const eventTypes = useMemo(() => {
    const types = new Set(auditEvents.map(e => e.eventType));
    return Array.from(types);
  }, [auditEvents]);

  if (bidLoading || foldersLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col h-full">
        {/* Header Bar */}
        <div className="border-b bg-card p-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => navigate("/bids")} data-testid="button-back">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-semibold" data-testid="text-bid-title">
                    {bidProject?.opportunityTitle || "Bid Jacket"}
                  </h1>
                  <Badge variant={getStatusBadgeVariant(bidProject?.status || "")} data-testid="badge-bid-status">
                    {bidProject?.status || "Unknown"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-bid-summary">
                  {allDocuments.length} documents across {folders.length} folders
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="default"
                onClick={handleAutoBuild}
                disabled={isBuilding || autoBuildMutation.isPending}
                data-testid="button-herbie-build"
              >
                {isBuilding ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Brain className="w-4 h-4 mr-2" />
                )}
                {isBuilding ? "Building..." : totalDocumentCount > 0 ? "HERBIE Rebuild" : "HERBIE Build Jacket"}
              </Button>
              <Button
                variant="outline"
                onClick={() => { setUploadFolderId(null); setUploadDialogOpen(true); }}
                data-testid="button-upload-doc"
              >
                <FilePlus className="w-4 h-4 mr-2" />
                Upload
              </Button>
              <Button
                variant="outline"
                className="md:hidden"
                onClick={() => cameraInputRef.current?.click()}
                data-testid="button-camera-upload"
              >
                <Camera className="w-4 h-4 mr-2" />
                Photo
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleCameraCapture}
              />
              <Button
                variant="outline"
                onClick={() => {
                  if (latestBinder) {
                    setBinderViewerOpen(true);
                  } else {
                    toast({ title: "No binder generated yet. Generate one first." });
                  }
                }}
                data-testid="button-view-binder"
              >
                <BookOpen className="w-4 h-4 mr-2" />
                View Binder
              </Button>
              <Button
                onClick={() => setBinderModalOpen(true)}
                disabled={generateBinderMutation.isPending || !!binderJobId}
                data-testid="button-generate-binder"
              >
                {(generateBinderMutation.isPending || !!binderJobId) ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Generate Binder
              </Button>
              <Button
                variant="default"
                onClick={() => setApprovalGateOpen(true)}
                data-testid="button-submit-approval"
                disabled={bidProject?.status === "submitted" || bidProject?.status === "awarded"}
              >
                <Shield className="w-4 h-4 mr-2" />
                Submit for Approval
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-row" orientation="vertical">
          <aside className="w-56 border-r bg-gray-50/60 overflow-y-auto flex-shrink-0">
            <TabsList className="flex-col h-auto w-full bg-transparent p-2 items-stretch gap-0" data-testid="tabs-list">
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Pursuit</div>
              <TabsTrigger value="overview" data-testid="tab-overview" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><LayoutGrid className="h-4 w-4"/>Overview</TabsTrigger>
              <TabsTrigger value="ai-intel" data-testid="tab-ai-intel" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Brain className="h-4 w-4"/>AI Intel</TabsTrigger>
              <TabsTrigger value="capture-plan" data-testid="tab-capture-plan" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><ClipboardList className="h-4 w-4"/>Capture Plan</TabsTrigger>
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Documents</div>
              <TabsTrigger value="documents" data-testid="tab-documents" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><FolderOpen className="h-4 w-4"/>Documents</TabsTrigger>
              <TabsTrigger value="design" data-testid="tab-design" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Layers className="h-4 w-4"/>Design</TabsTrigger>
              <TabsTrigger value="takeoff" data-testid="tab-takeoff" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Wrench className="h-4 w-4"/>Takeoff</TabsTrigger>
              <TabsTrigger value="artifacts" data-testid="tab-artifacts" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Receipt className="h-4 w-4"/>Artifacts</TabsTrigger>
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Estimating</div>
              <TabsTrigger value="pricing" data-testid="tab-pricing" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><DollarSign className="h-4 w-4"/>Pricing</TabsTrigger>
              <TabsTrigger value="bid-form" data-testid="tab-bid-form" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><FilePlus className="h-4 w-4"/>Bid Form</TabsTrigger>
              <TabsTrigger value="leveling" data-testid="tab-leveling" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><ArrowUpDown className="h-4 w-4"/>Leveling</TabsTrigger>
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Compliance & Proposal</div>
              <TabsTrigger value="compliance" data-testid="tab-compliance" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Shield className="h-4 w-4"/>Compliance</TabsTrigger>
              <TabsTrigger value="proposal" data-testid="tab-proposal" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><FileText className="h-4 w-4"/>Proposal</TabsTrigger>
              <TabsTrigger value="binder" data-testid="tab-binder" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><BookOpen className="h-4 w-4"/>Binder</TabsTrigger>
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Collaboration</div>
              <TabsTrigger value="rfis" data-testid="tab-rfis" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><FileQuestion className="h-4 w-4"/>RFIs</TabsTrigger>
              <TabsTrigger value="submittals" data-testid="tab-submittals" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><CheckSquare className="h-4 w-4"/>Submittals</TabsTrigger>
              <TabsTrigger value="change-orders" data-testid="tab-change-orders" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><RefreshCw className="h-4 w-4"/>Change Orders</TabsTrigger>
              <TabsTrigger value="daily-log" data-testid="tab-daily-log" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><CalendarDays className="h-4 w-4"/>Daily Log</TabsTrigger>
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Team</div>
              <TabsTrigger value="bidders" data-testid="tab-bidders" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Building2 className="h-4 w-4"/>Bidders</TabsTrigger>
              <TabsTrigger value="directory" data-testid="tab-directory" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Users className="h-4 w-4"/>Directory</TabsTrigger>
              <div className="px-2 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Lifecycle</div>
              <TabsTrigger value="financials" data-testid="tab-financials" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><DollarSign className="h-4 w-4"/>Financials</TabsTrigger>
              <TabsTrigger value="master-checklist" data-testid="tab-master-checklist" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><CheckCircle2 className="h-4 w-4"/>Checklist</TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Activity className="h-4 w-4"/>Activity</TabsTrigger>
              <TabsTrigger value="transition" data-testid="tab-transition" className="justify-start gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:text-blue-700"><Trophy className="h-4 w-4"/>Transition</TabsTrigger>
            </TabsList>
          </aside>
          <div className="flex-1 overflow-auto flex flex-col min-w-0">

          {/* ==================== OVERVIEW TAB ==================== */}
          <TabsContent value="overview" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-6">
              {integrityError && (
                <Card className="border-muted bg-muted/30">
                  <CardContent className="flex items-center gap-2 py-3">
                    <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Could not check jacket integrity.</p>
                  </CardContent>
                </Card>
              )}
              {jacketIntegrity && !jacketIntegrity.isHealthy && (
                <Card className="border-destructive/50 bg-destructive/5">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-destructive" />
                      <CardTitle className="text-sm font-medium">Jacket Structure Issue Detected</CardTitle>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => repairJacketMutation.mutate()}
                      disabled={repairJacketMutation.isPending}
                      data-testid="button-repair-jacket"
                    >
                      {repairJacketMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <Wrench className="w-4 h-4 mr-1" />
                      )}
                      Repair Jacket Structure
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {jacketIntegrity.missingSortOrders.length > 0 && `${jacketIntegrity.missingSortOrders.length} missing folder(s). `}
                      {jacketIntegrity.duplicateSortOrders.length > 0 && `${jacketIntegrity.duplicateSortOrders.length} duplicate folder(s). `}
                      {jacketIntegrity.legacyFolders.length > 0 && `${jacketIntegrity.legacyFolders.length} folder(s) with legacy names. `}
                      Click "Repair Jacket Structure" to auto-heal.
                    </p>
                  </CardContent>
                </Card>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Documents</CardTitle>
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-documents-count">{allDocuments.length}</div>
                    <p className="text-xs text-muted-foreground">across {folders.length} folders</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Readiness</CardTitle>
                    <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-readiness">{readiness?.overallScore ?? 0}%</div>
                    <Progress value={readiness?.overallScore ?? 0} className="h-2 mt-1" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Binder Versions</CardTitle>
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-binder-versions">{binderVersions.length}</div>
                    <p className="text-xs text-muted-foreground">
                      {latestBinder ? `Latest: v${latestBinder.version}` : "None ready"}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">Pending RFIs</CardTitle>
                    <FileQuestion className="w-4 h-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold" data-testid="stat-pending-rfis">
                      {rfis.filter(r => r.status === "pending" || r.status === "open").length || 0}
                    </div>
                    <p className="text-xs text-muted-foreground">requiring response</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                      <CardTitle>Bid Summary</CardTitle>
                      <CardDescription>
                        Click any editable field to update it instantly. Changes save automatically.
                      </CardDescription>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      Auto-save enabled
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Title</p>
                      {bidProject?.opportunityId ? (
                        <InlineEditableField
                          value={bidProject?.opportunityTitle || ""}
                          fieldType="text"
                          endpoint={`/api/opportunities/${bidProject.opportunityId}`}
                          field="title"
                          invalidateKeys={[["/api/bid-projects", bidId!]]}
                          placeholder="Enter bid title"
                          data-testid="inline-edit-title"
                        />
                      ) : (
                        <p className="text-sm font-medium" data-testid="detail-title">
                          {bidProject?.opportunityTitle || "\u2014"}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Notice ID</p>
                      <p className="text-sm font-medium" data-testid="detail-notice-id">
                        {bidProject?.noticeId || "\u2014"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Agency</p>
                      <p className="text-sm font-medium" data-testid="detail-agency">
                        {bidProject?.agency || "\u2014"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Due Date</p>
                      {bidProject?.opportunityId ? (
                        <InlineEditableField
                          value={bidProject?.dueAt || ""}
                          fieldType="date"
                          endpoint={`/api/opportunities/${bidProject.opportunityId}`}
                          field="dueAt"
                          invalidateKeys={[["/api/bid-projects", bidId!]]}
                          placeholder="Select due date"
                          data-testid="inline-edit-dueAt"
                        />
                      ) : (
                        <p className="text-sm font-medium" data-testid="detail-due-date">
                          {bidProject?.dueAt
                            ? new Date(bidProject.dueAt).toLocaleString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "\u2014"}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <InlineEditableField
                        value={bidProject?.status || ""}
                        fieldType="select"
                        endpoint={`/api/bid-projects/${bidId}`}
                        field="status"
                        invalidateKeys={[["/api/bid-projects", bidId!]]}
                        selectOptions={[
                          { value: "initiated", label: "Initiated" },
                          { value: "draft", label: "Draft" },
                          { value: "published", label: "Published" },
                          { value: "quoting", label: "Quoting" },
                          { value: "submitted", label: "Submitted" },
                          { value: "awarded", label: "Awarded" },
                          { value: "declined", label: "Declined" },
                        ]}
                        data-testid="inline-edit-status"
                      />
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Stage</p>
                      <p className="text-sm font-medium" data-testid="detail-stage">
                        {bidProject?.stage || "\u2014"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Readiness Score</p>
                      <div className="flex items-center gap-2">
                        <Progress value={readiness?.overallScore ?? 0} className="h-2 flex-1" />
                        <span className="text-sm font-medium" data-testid="detail-readiness">
                          {readiness?.overallScore ?? 0}%
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Team</p>
                      <div className="flex flex-wrap gap-1" data-testid="detail-team">
                        {(bidProject?.team || []).length > 0 ? (
                          bidProject!.team.map((member: string, i: number) => (
                            <Badge key={i} variant="outline">
                              {member}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground">{"\u2014"}</span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">NAICS / PSC</p>
                      <p className="text-sm font-medium" data-testid="detail-naics-psc">
                        {bidProject?.naicsCode || "\u2014"} / {bidProject?.pscCode || "\u2014"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Set-Aside</p>
                      {bidProject?.opportunityId ? (
                        <InlineEditableField
                          value={bidProject?.setAside || ""}
                          fieldType="text"
                          endpoint={`/api/opportunities/${bidProject.opportunityId}`}
                          field="setAside"
                          invalidateKeys={[["/api/bid-projects", bidId!]]}
                          placeholder="Enter set-aside (e.g., SDVOSB)"
                          data-testid="inline-edit-setAside"
                        />
                      ) : (
                        <p className="text-sm font-medium" data-testid="detail-set-aside">
                          {bidProject?.setAside || "\u2014"}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Period of Performance</p>
                      <p className="text-sm font-medium" data-testid="detail-pop">
                        {bidProject?.popStartDate
                          ? new Date(bidProject.popStartDate).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "2-digit",
                            })
                          : "\u2014"}{" "}
                        to{" "}
                        {bidProject?.popEndDate
                          ? new Date(bidProject.popEndDate).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "2-digit",
                            })
                          : "\u2014"}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Contract Value</p>
                      {bidProject?.opportunityId ? (
                        <InlineEditableField
                          value={bidProject?.contractValue}
                          fieldType="currency"
                          endpoint={`/api/opportunities/${bidProject.opportunityId}`}
                          field="contractValue"
                          invalidateKeys={[["/api/bid-projects", bidId!]]}
                          placeholder="Enter estimated value"
                          data-testid="inline-edit-contractValue"
                        />
                      ) : (
                        <p className="text-sm font-medium" data-testid="detail-contract-value">
                          {bidProject?.contractValue ? formatCurrency(bidProject.contractValue) : "\u2014"}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Win Probability</p>
                      <InlineEditableField
                        value={bidProject?.winProbability}
                        fieldType="number"
                        endpoint={`/api/bid-projects/${bidId}`}
                        field="winProbability"
                        invalidateKeys={[["/api/bid-projects", bidId!]]}
                        placeholder="0\u2013100"
                        displayFormatter={(val) =>
                          val !== null && val !== undefined && val !== ""
                            ? `${val}%`
                            : "Set probability"
                        }
                        data-testid="inline-edit-winProbability"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Enter a percentage from 0 to 100.
                      </p>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <InlineEditableField
                      value={bidProject?.notes || ""}
                      fieldType="textarea"
                      endpoint={`/api/bid-projects/${bidId}`}
                      field="notes"
                      invalidateKeys={[["/api/bid-projects", bidId!]]}
                      placeholder="Add notes for leadership and the bid team\u2026"
                      data-testid="inline-edit-notes"
                    />
                  </div>
                </CardContent>
              </Card>

              {readiness && readiness.missingItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      Missing Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {readiness.missingItems.map((item, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 rounded-md bg-muted" data-testid={`missing-item-${i}`}>
                          <Badge variant={item.severity === "critical" ? "destructive" : "secondary"}>
                            {item.severity}
                          </Badge>
                          <span className="text-sm">{item.item}</span>
                          <span className="text-xs text-muted-foreground ml-auto">{item.category}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* ==================== AI INTEL TAB ==================== */}
          <TabsContent value="ai-intel" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold" data-testid="text-ai-intel-title">AI Intelligence Brief</h3>
                  <p className="text-sm text-muted-foreground">AI-generated insights, scoring, and competitive analysis for this pursuit</p>
                </div>
                <Button variant="outline" className="gap-2" data-testid="button-refresh-intel">
                  <Sparkles className="h-4 w-4" />
                  Generate Intel
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Win Probability</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold" data-testid="text-win-probability">{(bidProject as any)?.fitScore ?? "--"}%</div>
                    <Progress value={(bidProject as any)?.fitScore ?? 0} className="mt-2" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">NAICS Match</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold" data-testid="text-naics-match">{bidProject?.naicsCode ?? "N/A"}</div>
                    <p className="text-xs text-muted-foreground mt-1">Primary classification code</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Competitive Landscape</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-lg font-semibold" data-testid="text-competitive-landscape">Moderate</div>
                    <p className="text-xs text-muted-foreground mt-1">Based on set-aside type and agency history</p>
                  </CardContent>
                </Card>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">AI Recommendation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground" data-testid="text-ai-recommendation">
                    {(bidProject as any)?.aiSummary || "No AI recommendation generated yet. Click 'Generate Intel' to analyze this opportunity."}
                  </p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ==================== CAPTURE PLAN TAB ==================== */}
          <TabsContent value="capture-plan" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold" data-testid="text-capture-plan-title">Capture Plan</h3>
                  <p className="text-sm text-muted-foreground">Strategic milestones and tasks for winning this pursuit</p>
                </div>
                <Button variant="outline" className="gap-2" data-testid="button-add-milestone">
                  <Plus className="h-4 w-4" />
                  Add Milestone
                </Button>
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Key Milestones</CardTitle>
                  <CardDescription>Track progress against your capture strategy</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4" data-testid="capture-plan-milestones">
                    {[
                      { label: "Opportunity Identified", status: "complete" },
                      { label: "Initial Assessment", status: (bidProject as any)?.fitScore ? "complete" : "pending" },
                      { label: "Team Formation", status: "pending" },
                      { label: "Solution Development", status: "pending" },
                      { label: "Pricing Strategy", status: "pending" },
                      { label: "Proposal Submission", status: "pending" },
                    ].map((milestone, i) => (
                      <div key={i} className="flex items-center gap-3">
                        {milestone.status === "complete" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                        ) : (
                          <CircleDot className="h-5 w-5 text-muted-foreground shrink-0" />
                        )}
                        <span className={`text-sm ${milestone.status === "complete" ? "line-through text-muted-foreground" : ""}`}>
                          {milestone.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ==================== DESIGN TAB ==================== */}
          <TabsContent value="design" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold" data-testid="text-design-title">Design & Systems</h3>
                  <p className="text-sm text-muted-foreground">Blueprints, building systems, and design specifications</p>
                </div>
                <Button variant="outline" className="gap-2" data-testid="button-upload-blueprint">
                  <FilePlus className="h-4 w-4" />
                  Upload Blueprint
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Blueprints</CardTitle>
                    <CardDescription>Design documents and drawings</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground" data-testid="blueprints-empty">
                      <Layers className="h-8 w-8 mb-2 opacity-40" />
                      <p className="text-sm">No blueprints uploaded yet</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Building Systems</CardTitle>
                    <CardDescription>Mechanical, electrical, plumbing, and structural</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3" data-testid="building-systems-list">
                      {["Structural", "Mechanical", "Electrical", "Plumbing", "Fire Protection"].map((system) => (
                        <div key={system} className="flex items-center justify-between">
                          <span className="text-sm">{system}</span>
                          <Badge variant="outline">Not specified</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ==================== TAKEOFF TAB ==================== */}
          <TabsContent value="takeoff" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h3 className="text-lg font-semibold" data-testid="text-takeoff-title">Takeoff & Estimation</h3>
                  <p className="text-sm text-muted-foreground">Quantity takeoff, material estimates, and cost projections</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" data-testid="badge-takeoff-count">{takeoffItems.length} item{takeoffItems.length !== 1 ? "s" : ""}</Badge>
                  <Badge variant="outline" data-testid="badge-takeoff-total">${takeoffGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Badge>
                  <Button variant="outline" className="gap-2" onClick={openAddTakeoff} data-testid="button-add-line-item">
                    <Plus className="h-4 w-4" />
                    Add Line Item
                  </Button>
                </div>
              </div>

              {takeoffLoading ? (
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-3">
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                      <Skeleton className="h-8 w-full" />
                    </div>
                  </CardContent>
                </Card>
              ) : takeoffItems.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h4 className="text-lg font-medium mb-1" data-testid="takeoff-empty">No takeoff items yet</h4>
                    <p className="text-sm text-muted-foreground mb-4">Add line items to build your quantity takeoff and cost estimate.</p>
                    <Button variant="outline" className="gap-2" onClick={openAddTakeoff} data-testid="button-add-line-item-empty">
                      <Plus className="h-4 w-4" />
                      Add First Line Item
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {Object.entries(takeoffByCategory).map(([category, group]) => (
                    <Card key={category}>
                      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                        <div>
                          <CardTitle className="text-sm">{category}</CardTitle>
                          <CardDescription>{group.items.length} item{group.items.length !== 1 ? "s" : ""}</CardDescription>
                        </div>
                        <Badge variant="outline" data-testid={`badge-category-total-${category}`}>${group.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Badge>
                      </CardHeader>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Unit</TableHead>
                              <TableHead className="text-right">Unit Cost</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                              <TableHead className="w-[80px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {group.items.map((item: any) => {
                              const lineTotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.unitCost) || 0);
                              return (
                                <TableRow key={item.id} data-testid={`row-takeoff-${item.id}`}>
                                  <TableCell>
                                    <div>
                                      <span className="font-medium" data-testid={`text-takeoff-name-${item.id}`}>{item.name}</span>
                                      {item.notes && <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>}
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right" data-testid={`text-takeoff-qty-${item.id}`}>{parseFloat(item.quantity).toLocaleString()}</TableCell>
                                  <TableCell className="text-right" data-testid={`text-takeoff-unit-${item.id}`}>{item.unit}</TableCell>
                                  <TableCell className="text-right" data-testid={`text-takeoff-cost-${item.id}`}>${parseFloat(item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                  <TableCell className="text-right font-medium" data-testid={`text-takeoff-total-${item.id}`}>${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                                  <TableCell>
                                    <div className="flex items-center justify-end gap-1">
                                      <Button size="icon" variant="ghost" onClick={() => openEditTakeoff(item)} data-testid={`button-edit-takeoff-${item.id}`}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="icon" variant="ghost" onClick={() => { if (confirm("Delete this line item?")) deleteTakeoffMutation.mutate(item.id); }} data-testid={`button-delete-takeoff-${item.id}`}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  ))}

                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="text-sm text-muted-foreground">{takeoffItems.length} line item{takeoffItems.length !== 1 ? "s" : ""} across {Object.keys(takeoffByCategory).length} categor{Object.keys(takeoffByCategory).length !== 1 ? "ies" : "y"}</div>
                        <div className="text-lg font-semibold" data-testid="text-takeoff-grand-total">Grand Total: ${takeoffGrandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <Dialog open={takeoffDialogOpen} onOpenChange={setTakeoffDialogOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingTakeoffItem ? "Edit Line Item" : "Add Line Item"}</DialogTitle>
                  <DialogDescription>
                    {editingTakeoffItem ? "Update the takeoff line item details." : "Add a new line item to the takeoff estimate."}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Description *</label>
                    <Input
                      placeholder="e.g. Concrete Foundation Pour"
                      value={takeoffForm.name}
                      onChange={(e) => setTakeoffForm({ ...takeoffForm, name: e.target.value })}
                      data-testid="input-takeoff-name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Category</label>
                      <Select value={takeoffForm.category} onValueChange={(v) => setTakeoffForm({ ...takeoffForm, category: v })}>
                        <SelectTrigger data-testid="select-takeoff-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="General">General</SelectItem>
                          <SelectItem value="Concrete">Concrete</SelectItem>
                          <SelectItem value="Steel">Steel</SelectItem>
                          <SelectItem value="Electrical">Electrical</SelectItem>
                          <SelectItem value="Plumbing">Plumbing</SelectItem>
                          <SelectItem value="HVAC">HVAC</SelectItem>
                          <SelectItem value="Framing">Framing</SelectItem>
                          <SelectItem value="Drywall">Drywall</SelectItem>
                          <SelectItem value="Roofing">Roofing</SelectItem>
                          <SelectItem value="Flooring">Flooring</SelectItem>
                          <SelectItem value="Painting">Painting</SelectItem>
                          <SelectItem value="Demolition">Demolition</SelectItem>
                          <SelectItem value="Excavation">Excavation</SelectItem>
                          <SelectItem value="Landscaping">Landscaping</SelectItem>
                          <SelectItem value="Equipment">Equipment</SelectItem>
                          <SelectItem value="Labor">Labor</SelectItem>
                          <SelectItem value="Overhead">Overhead</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Unit</label>
                      <Select value={takeoffForm.unit} onValueChange={(v) => setTakeoffForm({ ...takeoffForm, unit: v })}>
                        <SelectTrigger data-testid="select-takeoff-unit">
                          <SelectValue placeholder="Select unit" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Each">Each</SelectItem>
                          <SelectItem value="LF">LF (Linear Foot)</SelectItem>
                          <SelectItem value="SF">SF (Square Foot)</SelectItem>
                          <SelectItem value="CY">CY (Cubic Yard)</SelectItem>
                          <SelectItem value="Ton">Ton</SelectItem>
                          <SelectItem value="LB">LB (Pound)</SelectItem>
                          <SelectItem value="GAL">GAL (Gallon)</SelectItem>
                          <SelectItem value="HR">HR (Hour)</SelectItem>
                          <SelectItem value="Day">Day</SelectItem>
                          <SelectItem value="LS">LS (Lump Sum)</SelectItem>
                          <SelectItem value="MBF">MBF (Thousand Board Feet)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Quantity *</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        placeholder="1"
                        value={takeoffForm.quantity}
                        onChange={(e) => setTakeoffForm({ ...takeoffForm, quantity: e.target.value })}
                        data-testid="input-takeoff-quantity"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Unit Cost ($)</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={takeoffForm.unitCost}
                        onChange={(e) => setTakeoffForm({ ...takeoffForm, unitCost: e.target.value })}
                        data-testid="input-takeoff-unit-cost"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-4 p-3 rounded-md bg-muted/50">
                    <span className="text-sm text-muted-foreground">Line Total</span>
                    <span className="text-lg font-semibold" data-testid="text-takeoff-line-total">
                      ${((parseFloat(takeoffForm.quantity) || 0) * (parseFloat(takeoffForm.unitCost) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Notes</label>
                    <Textarea
                      placeholder="Optional notes..."
                      value={takeoffForm.notes}
                      onChange={(e) => setTakeoffForm({ ...takeoffForm, notes: e.target.value })}
                      rows={2}
                      data-testid="input-takeoff-notes"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setTakeoffDialogOpen(false)} data-testid="button-cancel-takeoff">Cancel</Button>
                    <Button
                      onClick={handleTakeoffSubmit}
                      disabled={createTakeoffMutation.isPending || updateTakeoffMutation.isPending}
                      data-testid="button-save-takeoff"
                    >
                      {(createTakeoffMutation.isPending || updateTakeoffMutation.isPending) ? "Saving..." : editingTakeoffItem ? "Update" : "Add Item"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ==================== DOCUMENTS TAB ==================== */}
          <TabsContent value="documents" className="flex-1 overflow-hidden mt-0">
            <div className="flex flex-1 h-full">
              {/* Document actions bar */}
              <div className="flex flex-col flex-1 h-full">
                <div className="border-b bg-card p-2 px-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center border rounded-md">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={viewMode === "grid" ? "secondary" : "ghost"}
                            size="icon"
                            className="rounded-r-none"
                            onClick={() => setViewMode("grid")}
                            data-testid="button-view-grid"
                          >
                            <Grid3X3 className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Grid View</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={viewMode === "list" ? "secondary" : "ghost"}
                            size="icon"
                            className="rounded-none border-x"
                            onClick={() => setViewMode("list")}
                            data-testid="button-view-list"
                          >
                            <List className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>List View</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={viewMode === "tree" ? "secondary" : "ghost"}
                            size="icon"
                            className="rounded-l-none"
                            onClick={() => setViewMode("tree")}
                            data-testid="button-view-tree"
                          >
                            <TreeDeciduous className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Tree View</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {filteredDocuments.length} document{filteredDocuments.length !== 1 ? "s" : ""}
                      </span>
                      <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
                        <SelectTrigger className="w-36" data-testid="select-status-filter">
                          <Filter className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Statuses</SelectItem>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="in_review">Under Review</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="superseded">Superseded</SelectItem>
                          <SelectItem value="final">Final</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant={bulkMode ? "secondary" : "ghost"}
                        size="icon"
                        onClick={() => { setBulkMode(!bulkMode); setSelectedDocs(new Set()); }}
                        data-testid="button-bulk-toggle"
                      >
                        <CheckSquare className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => { setCreateDocFolderId(null); setCreateDocOpen(true); }}
                        data-testid="button-create-doc"
                      >
                        <FileText className="w-4 h-4" />
                      </Button>
                      <Select value={sortBy} onValueChange={(v: "name" | "date" | "type") => setSortBy(v)}>
                        <SelectTrigger className="w-40" data-testid="select-sort">
                          <ArrowUpDown className="w-4 h-4 mr-2" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="name">Sort by Name</SelectItem>
                          <SelectItem value="date">Sort by Date</SelectItem>
                          <SelectItem value="type">Sort by Type</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                  {/* Folder sidebar */}
                  <div className="w-72 border-r bg-card/50 flex flex-col">
                    <div className="p-4 border-b">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          placeholder="Search documents..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-9"
                          data-testid="input-search"
                        />
                      </div>
                    </div>

                    {readiness && (
                      <div className="p-4 border-b">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Bid Readiness</span>
                          <Badge variant={readiness.status === "critical" ? "destructive" : "secondary"}>
                            {readiness.overallScore}%
                          </Badge>
                        </div>
                        <Progress value={readiness.overallScore} className="h-2" />
                        {readiness.missingItems.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            {readiness.missingItems.filter(m => m.severity === "critical").length} critical items missing
                          </p>
                        )}
                      </div>
                    )}

                    {herbieSuggestions.length > 0 && (
                      <div className="p-4 border-b">
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="w-4 h-4 text-primary" />
                          <span className="text-sm font-medium">HERBIE Suggestions</span>
                        </div>
                        <div className="space-y-2">
                          {herbieSuggestions.slice(0, 3).map((s, i) => (
                            <div key={i} className="p-2 bg-muted rounded-md text-xs">
                              <div className="flex items-start gap-2">
                                {s.priority === "high" ? (
                                  <AlertTriangle className="w-3 h-3 text-destructive mt-0.5" />
                                ) : (
                                  <Sparkles className="w-3 h-3 text-primary mt-0.5" />
                                )}
                                <span>{s.message}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <ScrollArea className="flex-1">
                      <div className="p-2">
                        {folders.map(folder => (
                          <div key={folder.id} className="group flex items-center gap-1 mb-1">
                            <Button
                              variant={selectedFolderId === folder.id ? "secondary" : "ghost"}
                              className="flex-1 justify-start"
                              onClick={() => handleFolderClick(folder.id)}
                              data-testid={`button-folder-${folder.id}`}
                            >
                              <FolderOpen className="w-4 h-4 mr-2" />
                              <span className="truncate flex-1 text-left">{folder.name}</span>
                              <Badge variant="outline" className="ml-2">{folder.documents?.length || 0}</Badge>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="invisible group-hover:visible shrink-0"
                              onClick={(e) => { e.stopPropagation(); setUploadFolderId(folder.id); setUploadDialogOpen(true); }}
                              data-testid={`button-folder-upload-${folder.id}`}
                            >
                              <FilePlus className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Document content area */}
                  <div className="flex-1 overflow-auto" ref={rightPanelRef}>
                    <div className="p-4">
                    {bulkMode && selectedDocs.size > 0 && (
                      <div className="flex items-center gap-3 p-3 mb-4 rounded-md bg-primary text-primary-foreground">
                        <span className="text-sm font-medium">{selectedDocs.size} selected</span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="sm" data-testid="button-bulk-move">
                              <FolderOpen className="w-4 h-4 mr-1" />
                              Move
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {folders.map(f => (
                              <DropdownMenuItem key={f.id} onClick={() => handleBulkMove(f.id)}>
                                {f.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="secondary" size="sm" onClick={handleBulkDelete} data-testid="button-bulk-delete">
                          <Trash2 className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="secondary" size="sm" data-testid="button-bulk-status">
                              <Activity className="w-4 h-4 mr-1" />
                              Status
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            {["draft", "in_review", "approved", "superseded", "final", "active", "archived"].map(s => (
                              <DropdownMenuItem key={s} onClick={() => handleBulkStatusChange(s)} data-testid={`menuitem-bulk-status-${s}`}>
                                {s.replace(/_/g, " ")}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <Button variant="secondary" size="sm" onClick={() => setSelectedDocs(new Set())}>
                          Deselect All
                        </Button>
                      </div>
                    )}

                    {viewMode === "grid" && (
                      <div className="space-y-6">
                        {folders.map(folder => {
                          const folderDocs = filteredDocuments.filter(d => d.folderId === folder.id);
                          const isFolderPhotos = folder.name?.includes("Photos") || folder.name?.includes("15-");
                          const photoDocs = isFolderPhotos ? folderDocs.filter(d => isImageFile(d.fileName)) : [];
                          const nonPhotoDocs = isFolderPhotos ? folderDocs.filter(d => !isImageFile(d.fileName)) : folderDocs;
                          return (
                            <div key={folder.id} id={`folder-section-${folder.id}`} data-folder-id={folder.id}>
                              <div className="flex items-center gap-2 mb-3">
                                <FolderOpen className="w-4 h-4 text-amber-500" />
                                <span className="text-sm font-medium">{folder.name}</span>
                                <Badge variant="outline">{folderDocs.length}</Badge>
                              </div>
                              {isFolderPhotos && photoDocs.length > 0 && (
                                <div className="mb-4">
                                  <div className="flex items-center justify-end mb-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => { setUploadFolderId(folder.id); setUploadDialogOpen(true); }}
                                      data-testid="button-photos-upload"
                                    >
                                      <ImageIcon className="w-4 h-4 mr-1" />
                                      Add Photos
                                    </Button>
                                  </div>
                                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                                    {photoDocs.map(doc => (
                                      <div
                                        key={doc.id}
                                        className="group relative aspect-square rounded-md overflow-hidden cursor-pointer border hover-elevate"
                                        onClick={() => setPhotoLightboxDoc(doc)}
                                        data-testid={`photo-thumb-${doc.id}`}
                                      >
                                        {isDocMissing(doc.id) ? (
                                          <div className="w-full h-full flex flex-col items-center justify-center bg-muted/30 text-muted-foreground">
                                            <AlertTriangle className="w-8 h-8 mb-1 opacity-50" />
                                            <span className="text-[10px]">Missing</span>
                                          </div>
                                        ) : (
                                          <img
                                            src={`/api/documents/${doc.id}/download`}
                                            alt={doc.fileName}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                            onError={handleImgError(doc.id)}
                                          />
                                        )}
                                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <p className="text-white text-xs truncate">{doc.fileName}</p>
                                        </div>
                                        {bulkMode && (
                                          <div className="absolute top-1 left-1" onClick={(e) => e.stopPropagation()}>
                                            <Checkbox
                                              checked={selectedDocs.has(doc.id)}
                                              onCheckedChange={() => toggleDocSelection(doc.id)}
                                            />
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {nonPhotoDocs.length > 0 && (
                                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                  {nonPhotoDocs.map(doc => (
                          <Card
                            key={doc.id}
                            className="cursor-pointer hover-elevate relative"
                            onClick={() => openDocumentViewer(doc)}
                            data-testid={`card-document-${doc.id}`}
                          >
                            <CardContent className="p-4">
                              {bulkMode && (
                                <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
                                  <Checkbox
                                    checked={selectedDocs.has(doc.id)}
                                    onCheckedChange={() => toggleDocSelection(doc.id)}
                                    data-testid={`checkbox-doc-${doc.id}`}
                                  />
                                </div>
                              )}
                              <div className="absolute top-2 right-2 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" asChild data-testid={`button-download-${doc.id}`}>
                                  <a href={`/api/documents/${doc.id}/download`} download={doc.fileName}>
                                    <Download className="w-3 h-3" />
                                  </a>
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-${doc.id}`}>
                                      <MoreHorizontal className="w-3 h-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      data-testid={`menuitem-rename-${doc.id}`}
                                      onClick={() => { setRenamingDocId(doc.id); setRenameValue(doc.fileName); }}
                                    >
                                      <Pencil className="w-4 h-4 mr-2" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>
                                        <FolderOpen className="w-4 h-4 mr-2" />
                                        Move to Folder
                                      </DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent>
                                        {folders.map(f => (
                                          <DropdownMenuItem key={f.id} onClick={() => moveMutation.mutate({ docId: doc.id, targetFolderId: f.id })}>
                                            {f.name}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuItem
                                      data-testid={`menuitem-duplicate-${doc.id}`}
                                      onClick={() => duplicateMutation.mutate(doc.id)}
                                    >
                                      <Copy className="w-4 h-4 mr-2" />
                                      Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      data-testid={`menuitem-version-${doc.id}`}
                                      onClick={() => setVersionHistoryDoc(doc)}
                                    >
                                      <Layers className="w-4 h-4 mr-2" />
                                      Version History
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      data-testid={`menuitem-details-${doc.id}`}
                                      onClick={() => setDetailDoc(doc)}
                                    >
                                      <Eye className="w-4 h-4 mr-2" />
                                      Details
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      data-testid={`menuitem-delete-${doc.id}`}
                                      className="text-destructive"
                                      onClick={() => setDeleteConfirmDoc(doc)}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              <div className="aspect-[3/4] bg-muted rounded-md mb-3 flex items-center justify-center overflow-hidden">
                                {isImageFile(doc.fileName) ? (
                                  isDocMissing(doc.id) ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                                      <AlertTriangle className="w-8 h-8 mb-1 opacity-50" />
                                      <span className="text-[10px]">Missing</span>
                                    </div>
                                  ) : (
                                    <img
                                      src={`/api/documents/${doc.id}/download`}
                                      alt={doc.fileName}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                      data-testid={`img-thumb-${doc.id}`}
                                      onError={handleImgError(doc.id)}
                                    />
                                  )
                                ) : isPdfFile(doc.fileName) ? (
                                  <FileText className="w-12 h-12 text-red-400" />
                                ) : (
                                  <FileText className="w-12 h-12 text-muted-foreground" />
                                )}
                              </div>
                              <div className="space-y-1">
                                {renamingDocId === doc.id ? (
                                  <Input
                                    value={renameValue}
                                    onChange={(e) => setRenameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") renameMutation.mutate({ docId: doc.id, title: renameValue });
                                      if (e.key === "Escape") { setRenamingDocId(null); setRenameValue(""); }
                                    }}
                                    onBlur={() => { setRenamingDocId(null); setRenameValue(""); }}
                                    onClick={(e) => e.stopPropagation()}
                                    autoFocus
                                    className="text-sm"
                                    data-testid={`input-rename-${doc.id}`}
                                  />
                                ) : (
                                  <p className="text-sm font-medium truncate" title={doc.fileName}>
                                    {doc.fileName}
                                  </p>
                                )}
                                <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                                  <span>{formatFileSize(doc.fileSizeBytes)}</span>
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                      <Badge variant={getDocStatusVariant(doc.status)} className="text-[10px] cursor-pointer" data-testid={`badge-status-${doc.id}`}>
                                        {doc.status}
                                      </Badge>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent>
                                      {["draft", "in_review", "approved", "superseded", "final", "active", "archived"].map(s => (
                                        <DropdownMenuItem key={s} onClick={() => statusMutation.mutate({ docId: doc.id, status: s })}>
                                          {s}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                                  ))}
                                </div>
                              )}
                              {folderDocs.length === 0 && (
                                <p className="text-sm text-muted-foreground italic pl-6">No documents</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {viewMode === "list" && (
                      <div className="space-y-6">
                        {folders.map(folder => {
                          const folderDocs = filteredDocuments.filter(d => d.folderId === folder.id);
                          return (
                            <div key={folder.id} id={`folder-section-${folder.id}`} data-folder-id={folder.id}>
                              <div className="flex items-center gap-2 mb-3">
                                <FolderOpen className="w-4 h-4 text-amber-500" />
                                <span className="text-sm font-medium">{folder.name}</span>
                                <Badge variant="outline">{folderDocs.length}</Badge>
                              </div>
                              {folderDocs.length > 0 ? (
                              <div className="border rounded-md">
                        <div className="grid grid-cols-12 gap-4 p-3 bg-muted/50 text-xs font-medium text-muted-foreground border-b">
                          {bulkMode && <div className="col-span-1"></div>}
                          <div className={bulkMode ? "col-span-4" : "col-span-4"}>Name</div>
                          <div className="col-span-2">Type</div>
                          <div className="col-span-1">Status</div>
                          <div className="col-span-1">Size</div>
                          <div className="col-span-2">Modified</div>
                          <div className={bulkMode ? "col-span-1" : "col-span-2"}></div>
                        </div>
                        {folderDocs.map(doc => (
                          <div
                            key={doc.id}
                            className="grid grid-cols-12 gap-4 p-3 border-b last:border-b-0 hover:bg-muted/30 cursor-pointer items-center"
                            onClick={() => openDocumentViewer(doc)}
                            data-testid={`row-document-${doc.id}`}
                          >
                            {bulkMode && (
                              <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedDocs.has(doc.id)}
                                  onCheckedChange={() => toggleDocSelection(doc.id)}
                                  data-testid={`checkbox-doc-${doc.id}`}
                                />
                              </div>
                            )}
                            <div className="col-span-4 flex items-center gap-2">
                              {getDocTypeIcon(doc.documentType)}
                              {renamingDocId === doc.id ? (
                                <Input
                                  value={renameValue}
                                  onChange={(e) => setRenameValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") renameMutation.mutate({ docId: doc.id, title: renameValue });
                                    if (e.key === "Escape") { setRenamingDocId(null); setRenameValue(""); }
                                  }}
                                  onBlur={() => { setRenamingDocId(null); setRenameValue(""); }}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                  className="text-sm"
                                  data-testid={`input-rename-${doc.id}`}
                                />
                              ) : (
                                <span className="truncate text-sm">{doc.fileName}</span>
                              )}
                            </div>
                            <div className="col-span-2">
                              <Badge variant="outline" className="text-xs">
                                {doc.documentType || doc.fileType}
                              </Badge>
                            </div>
                            <div className="col-span-1" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Badge variant={getDocStatusVariant(doc.status)} className="text-xs cursor-pointer" data-testid={`badge-status-${doc.id}`}>
                                    {doc.status}
                                  </Badge>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent>
                                  {["draft", "in_review", "approved", "superseded", "final", "active", "archived"].map(s => (
                                    <DropdownMenuItem key={s} onClick={() => statusMutation.mutate({ docId: doc.id, status: s })}>
                                      {s}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                            <div className="col-span-1 text-sm text-muted-foreground">
                              {formatFileSize(doc.fileSizeBytes)}
                            </div>
                            <div className="col-span-2 text-sm text-muted-foreground">
                              {new Date(doc.uploadedAt).toLocaleDateString()}
                            </div>
                            <div className={bulkMode ? "col-span-1" : "col-span-2"} onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" asChild data-testid={`button-download-${doc.id}`}>
                                  <a href={`/api/documents/${doc.id}/download`} download={doc.fileName}>
                                    <Download className="w-4 h-4" />
                                  </a>
                                </Button>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" data-testid={`button-actions-${doc.id}`}>
                                      <MoreHorizontal className="w-4 h-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      data-testid={`menuitem-rename-${doc.id}`}
                                      onClick={() => { setRenamingDocId(doc.id); setRenameValue(doc.fileName); }}
                                    >
                                      <Pencil className="w-4 h-4 mr-2" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuSub>
                                      <DropdownMenuSubTrigger>
                                        <FolderOpen className="w-4 h-4 mr-2" />
                                        Move to Folder
                                      </DropdownMenuSubTrigger>
                                      <DropdownMenuSubContent>
                                        {folders.map(f => (
                                          <DropdownMenuItem key={f.id} onClick={() => moveMutation.mutate({ docId: doc.id, targetFolderId: f.id })}>
                                            {f.name}
                                          </DropdownMenuItem>
                                        ))}
                                      </DropdownMenuSubContent>
                                    </DropdownMenuSub>
                                    <DropdownMenuItem
                                      data-testid={`menuitem-duplicate-${doc.id}`}
                                      onClick={() => duplicateMutation.mutate(doc.id)}
                                    >
                                      <Copy className="w-4 h-4 mr-2" />
                                      Duplicate
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      data-testid={`menuitem-version-${doc.id}`}
                                      onClick={() => setVersionHistoryDoc(doc)}
                                    >
                                      <Layers className="w-4 h-4 mr-2" />
                                      Version History
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      data-testid={`menuitem-details-${doc.id}`}
                                      onClick={() => setDetailDoc(doc)}
                                    >
                                      <Eye className="w-4 h-4 mr-2" />
                                      Details
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      data-testid={`menuitem-delete-${doc.id}`}
                                      className="text-destructive"
                                      onClick={() => setDeleteConfirmDoc(doc)}
                                    >
                                      <Trash2 className="w-4 h-4 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                              ) : (
                                <p className="text-sm text-muted-foreground italic pl-6">No documents</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {viewMode === "tree" && (
                      <div className="space-y-1">
                        {folders.map(folder => (
                          <div
                            key={folder.id}
                            id={`folder-section-${folder.id}`}
                            data-folder-id={folder.id}
                          >
                          <Collapsible
                            open={expandedFolders.has(folder.id)}
                            onOpenChange={() => toggleFolder(folder.id)}
                          >
                            <CollapsibleTrigger asChild>
                              <div
                                className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                                data-testid={`tree-folder-${folder.id}`}
                              >
                                {expandedFolders.has(folder.id) ? (
                                  <ChevronDown className="w-4 h-4" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                                <FolderOpen className="w-4 h-4 text-amber-500" />
                                <span className="font-medium">{folder.name}</span>
                                <Badge variant="outline" className="ml-auto">
                                  {folder.documents?.length || 0}
                                </Badge>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => { e.stopPropagation(); setUploadFolderId(folder.id); setUploadDialogOpen(true); }}
                                  data-testid={`button-folder-upload-${folder.id}`}
                                >
                                  <FilePlus className="w-3 h-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={(e) => { e.stopPropagation(); setCreateDocFolderId(folder.id); setCreateDocOpen(true); }}
                                  data-testid={`button-folder-newdoc-${folder.id}`}
                                >
                                  <FileText className="w-3 h-3" />
                                </Button>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="ml-6 pl-4 border-l space-y-1 mt-1">
                                {(folder.documents || []).map(doc => (
                                  <div
                                    key={doc.id}
                                    className="flex items-center gap-2 p-2 rounded-md hover:bg-muted cursor-pointer"
                                    onClick={() => openDocumentViewer(doc)}
                                    data-testid={`tree-document-${doc.id}`}
                                  >
                                    {bulkMode && (
                                      <div onClick={(e) => e.stopPropagation()}>
                                        <Checkbox
                                          checked={selectedDocs.has(doc.id)}
                                          onCheckedChange={() => toggleDocSelection(doc.id)}
                                          data-testid={`checkbox-doc-${doc.id}`}
                                        />
                                      </div>
                                    )}
                                    {getDocTypeIcon(doc.documentType)}
                                    {renamingDocId === doc.id ? (
                                      <Input
                                        value={renameValue}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") renameMutation.mutate({ docId: doc.id, title: renameValue });
                                          if (e.key === "Escape") { setRenamingDocId(null); setRenameValue(""); }
                                        }}
                                        onBlur={() => { setRenamingDocId(null); setRenameValue(""); }}
                                        onClick={(e) => e.stopPropagation()}
                                        autoFocus
                                        className="text-sm flex-1"
                                        data-testid={`input-rename-${doc.id}`}
                                      />
                                    ) : (
                                      <span className="text-sm truncate flex-1">{doc.fileName}</span>
                                    )}
                                    <div onClick={(e) => e.stopPropagation()}>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Badge variant={getDocStatusVariant(doc.status)} className="text-[10px] cursor-pointer" data-testid={`badge-status-${doc.id}`}>
                                            {doc.status}
                                          </Badge>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                          {["draft", "in_review", "approved", "superseded", "final", "active", "archived"].map(s => (
                                            <DropdownMenuItem key={s} onClick={() => statusMutation.mutate({ docId: doc.id, status: s })}>
                                              {s}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {formatFileSize(doc.fileSizeBytes)}
                                    </span>
                                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                      <Button variant="ghost" size="icon" asChild data-testid={`button-download-${doc.id}`}>
                                        <a href={`/api/documents/${doc.id}/download`} download={doc.fileName}>
                                          <Download className="w-3 h-3" />
                                        </a>
                                      </Button>
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button variant="ghost" size="icon" data-testid={`button-actions-${doc.id}`}>
                                            <MoreHorizontal className="w-3 h-3" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          <DropdownMenuItem
                                            data-testid={`menuitem-rename-${doc.id}`}
                                            onClick={() => { setRenamingDocId(doc.id); setRenameValue(doc.fileName); }}
                                          >
                                            <Pencil className="w-4 h-4 mr-2" />
                                            Rename
                                          </DropdownMenuItem>
                                          <DropdownMenuSub>
                                            <DropdownMenuSubTrigger>
                                              <FolderOpen className="w-4 h-4 mr-2" />
                                              Move to Folder
                                            </DropdownMenuSubTrigger>
                                            <DropdownMenuSubContent>
                                              {folders.map(f => (
                                                <DropdownMenuItem key={f.id} onClick={() => moveMutation.mutate({ docId: doc.id, targetFolderId: f.id })}>
                                                  {f.name}
                                                </DropdownMenuItem>
                                              ))}
                                            </DropdownMenuSubContent>
                                          </DropdownMenuSub>
                                          <DropdownMenuItem
                                            data-testid={`menuitem-duplicate-${doc.id}`}
                                            onClick={() => duplicateMutation.mutate(doc.id)}
                                          >
                                            <Copy className="w-4 h-4 mr-2" />
                                            Duplicate
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            data-testid={`menuitem-version-${doc.id}`}
                                            onClick={() => setVersionHistoryDoc(doc)}
                                          >
                                            <Layers className="w-4 h-4 mr-2" />
                                            Version History
                                          </DropdownMenuItem>
                                          <DropdownMenuItem
                                            data-testid={`menuitem-details-${doc.id}`}
                                            onClick={() => setDetailDoc(doc)}
                                          >
                                            <Eye className="w-4 h-4 mr-2" />
                                            Details
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            data-testid={`menuitem-delete-${doc.id}`}
                                            className="text-destructive"
                                            onClick={() => setDeleteConfirmDoc(doc)}
                                          >
                                            <Trash2 className="w-4 h-4 mr-2" />
                                            Delete
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                ))}
                                {(!folder.documents || folder.documents.length === 0) && (
                                  <div className="p-2 text-sm text-muted-foreground italic">
                                    No documents
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                          </div>
                        ))}
                      </div>
                    )}

                    {filteredDocuments.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                        <FileText className="w-12 h-12 mb-4" />
                        <p>No documents found</p>
                        {searchQuery && (
                          <Button variant="ghost" onClick={() => setSearchQuery("")} data-testid="button-clear-search">
                            Clear search
                          </Button>
                        )}
                      </div>
                    )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ==================== RFIs TAB ==================== */}
          <TabsContent value="rfis" className="flex-1 overflow-auto p-4 mt-0">
            {rfisLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : rfis.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FileQuestion className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium" data-testid="text-rfis-empty">No RFIs yet</p>
                <p className="text-sm">Requests for Information will appear here</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RFI #</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Response</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rfis.map(rfi => (
                    <TableRow key={rfi.id} data-testid={`row-rfi-${rfi.id}`}>
                      <TableCell className="font-medium" data-testid={`text-rfi-number-${rfi.id}`}>
                        <div className="flex items-center gap-1">
                          <Hash className="w-3 h-3 text-muted-foreground" />
                          {rfi.number}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-rfi-subject-${rfi.id}`}>{rfi.subject}</TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(rfi.status)} data-testid={`badge-rfi-status-${rfi.id}`}>
                          {rfi.status}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-rfi-assigned-${rfi.id}`}>{rfi.assignedTo}</TableCell>
                      <TableCell data-testid={`text-rfi-due-${rfi.id}`}>
                        {new Date(rfi.dueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-muted-foreground" data-testid={`text-rfi-response-${rfi.id}`}>
                        {rfi.response || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ==================== SUBMITTALS TAB ==================== */}
          <TabsContent value="submittals" className="flex-1 overflow-auto p-4 mt-0">
            {submittalsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : submittals.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <ClipboardList className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium" data-testid="text-submittals-empty">No submittals yet</p>
                <p className="text-sm">Submission requirements will appear here</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Spec Section</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Linked Doc</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submittals.map(sub => (
                    <TableRow key={sub.id} data-testid={`row-submittal-${sub.id}`}>
                      <TableCell className="font-medium" data-testid={`text-submittal-item-${sub.id}`}>{sub.item}</TableCell>
                      <TableCell data-testid={`text-submittal-spec-${sub.id}`}>{sub.specSection}</TableCell>
                      <TableCell data-testid={`text-submittal-due-${sub.id}`}>
                        {new Date(sub.dueDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(sub.status)} data-testid={`badge-submittal-status-${sub.id}`}>
                          {sub.status}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-submittal-doc-${sub.id}`}>
                        {sub.linkedDocName ? (
                          <Button variant="ghost" size="sm" className="gap-1" data-testid={`button-submittal-doc-${sub.id}`}>
                            <Link className="w-3 h-3" />
                            {sub.linkedDocName}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ==================== CHANGE ORDERS TAB ==================== */}
          <TabsContent value="change-orders" className="flex-1 overflow-auto p-4 mt-0">
            {changeOrdersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : changeOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <FilePlus className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium" data-testid="text-change-orders-empty">No change orders yet</p>
                <p className="text-sm">Change orders will appear here</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>CO #</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Schedule Impact</TableHead>
                    <TableHead>Approval</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {changeOrders.map(co => (
                    <TableRow key={co.id} data-testid={`row-co-${co.id}`}>
                      <TableCell className="font-medium" data-testid={`text-co-number-${co.id}`}>
                        <div className="flex items-center gap-1">
                          <Hash className="w-3 h-3 text-muted-foreground" />
                          {co.number}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-co-desc-${co.id}`}>{co.description}</TableCell>
                      <TableCell data-testid={`text-co-amount-${co.id}`}>
                        <span className={co.amount >= 0 ? "text-green-600" : "text-destructive"}>
                          {formatCurrency(co.amount)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(co.status)} data-testid={`badge-co-status-${co.id}`}>
                          {co.status}
                        </Badge>
                      </TableCell>
                      <TableCell data-testid={`text-co-impact-${co.id}`}>{co.scheduleImpact || "—"}</TableCell>
                      <TableCell data-testid={`text-co-approval-${co.id}`}>{co.approval || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ==================== DAILY LOG TAB ==================== */}
          <TabsContent value="daily-log" className="flex-1 overflow-auto p-4 mt-0">
            {dailyLogsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
              </div>
            ) : dailyLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <CalendarDays className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium" data-testid="text-daily-log-empty">No daily logs yet</p>
                <p className="text-sm">Daily entries will appear here</p>
              </div>
            ) : (
              <div className="space-y-4">
                {dailyLogs.map(log => (
                  <Card key={log.id} data-testid={`card-daily-log-${log.id}`}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        {new Date(log.date).toLocaleDateString("en-US", {
                          weekday: "long",
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="flex items-center gap-2">
                          <Cloud className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm" data-testid={`text-log-weather-${log.id}`}>{log.weather}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <span className="text-sm" data-testid={`text-log-crew-${log.id}`}>{log.crewCount} crew members</span>
                        </div>
                      </div>
                      <Separator className="my-3" />
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Work Performed</p>
                        <p className="text-sm" data-testid={`text-log-work-${log.id}`}>{log.workPerformed}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ==================== FINANCIALS TAB ==================== */}
          <TabsContent value="financials" className="flex-1 overflow-auto p-4 mt-0">
            {financialsLoading ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24" />)}
                </div>
                <Skeleton className="h-64 w-full" />
              </div>
            ) : !financials ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <DollarSign className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium" data-testid="text-financials-empty">No financial data yet</p>
                <p className="text-sm">Budget and cost information will appear here</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Estimated Total</CardTitle>
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-estimated-total">
                        {formatCurrency(financials.estimatedTotal)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Committed</CardTitle>
                      <Receipt className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-committed">
                        {formatCurrency(financials.committed)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Actual</CardTitle>
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-actual">
                        {formatCurrency(financials.actual)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Variance</CardTitle>
                      {financials.variance >= 0 ? (
                        <TrendingUp className="w-4 h-4 text-green-500" />
                      ) : (
                        <TrendingDown className="w-4 h-4 text-destructive" />
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className={`text-2xl font-bold ${financials.variance >= 0 ? "text-green-600" : "text-destructive"}`} data-testid="stat-variance">
                        {formatCurrency(financials.variance)}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {financials.costCodes && financials.costCodes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Cost Codes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Estimated</TableHead>
                            <TableHead>Actual</TableHead>
                            <TableHead>Variance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {financials.costCodes.map((cc, i) => (
                            <TableRow key={i} data-testid={`row-cost-code-${i}`}>
                              <TableCell className="font-medium" data-testid={`text-cc-code-${i}`}>{cc.code}</TableCell>
                              <TableCell data-testid={`text-cc-desc-${i}`}>{cc.description}</TableCell>
                              <TableCell data-testid={`text-cc-est-${i}`}>{formatCurrency(cc.estimated)}</TableCell>
                              <TableCell data-testid={`text-cc-actual-${i}`}>{formatCurrency(cc.actual)}</TableCell>
                              <TableCell data-testid={`text-cc-var-${i}`}>
                                <span className={cc.variance >= 0 ? "text-green-600" : "text-destructive"}>
                                  {formatCurrency(cc.variance)}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </TabsContent>

          {/* ==================== DIRECTORY TAB ==================== */}
          <TabsContent value="directory" className="flex-1 overflow-auto p-4 mt-0">
            {directoryLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : directory.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <Users className="w-12 h-12 mb-4" />
                <p className="text-lg font-medium" data-testid="text-directory-empty">No contacts yet</p>
                <p className="text-sm">Project contacts will appear here</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Trade</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Email</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {directory.map(entry => (
                    <TableRow key={entry.id} data-testid={`row-directory-${entry.id}`}>
                      <TableCell className="font-medium" data-testid={`text-dir-company-${entry.id}`}>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-muted-foreground" />
                          {entry.company}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-dir-contact-${entry.id}`}>{entry.contact}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" data-testid={`badge-dir-role-${entry.id}`}>{entry.role}</Badge>
                      </TableCell>
                      <TableCell data-testid={`text-dir-trade-${entry.id}`}>{entry.trade}</TableCell>
                      <TableCell data-testid={`text-dir-phone-${entry.id}`}>
                        <div className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-muted-foreground" />
                          {entry.phone}
                        </div>
                      </TableCell>
                      <TableCell data-testid={`text-dir-email-${entry.id}`}>
                        <div className="flex items-center gap-1">
                          <Mail className="w-3 h-3 text-muted-foreground" />
                          {entry.email}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          {/* ==================== COMPLIANCE TAB ==================== */}
          <TabsContent value="compliance" className="flex-1 overflow-auto p-4 mt-0">
            <ComplianceTab bidId={bidId} data={complianceData} isLoading={complianceLoading} />
          </TabsContent>

          {/* ==================== PROPOSAL TAB ==================== */}
          <TabsContent value="proposal" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-semibold" data-testid="proposal-heading">AI-Generated Proposal Documentation</h2>
                  <p className="text-sm text-muted-foreground">Shipley-methodology bid content generated by HERBIE using GPT-5.1</p>
                </div>
                <Badge variant="secondary" data-testid="badge-proposal-sections">
                  {bidProject?.documentationJson ? Object.values(bidProject.documentationJson).filter(v => v && v.length > 0).length : 0} / 8 Sections
                </Badge>
              </div>

              {!bidProject?.documentationJson || Object.values(bidProject.documentationJson).every(v => !v || v.length === 0) ? (
                <Card>
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Brain className="w-12 h-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Proposal Documentation Yet</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md">
                      HERBIE has not generated proposal documentation for this bid project yet.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {[
                    { key: "executiveSummary", title: "Executive Summary", icon: FileText },
                    { key: "technicalApproach", title: "Technical Approach", icon: ClipboardList },
                    { key: "pastPerformance", title: "Past Performance", icon: TrendingUp },
                    { key: "keyPersonnel", title: "Key Personnel", icon: Users },
                    { key: "complianceNotes", title: "Compliance Notes", icon: Shield },
                    { key: "riskAssessment", title: "Risk Assessment", icon: AlertTriangle },
                    { key: "competitiveAnalysis", title: "Competitive Analysis", icon: Activity },
                    { key: "pricingStrategy", title: "Pricing Strategy", icon: DollarSign },
                  ].map(({ key, title, icon: Icon }) => {
                    const content = (bidProject.documentationJson as any)?.[key] as string | undefined;
                    if (!content || content.length === 0) return null;
                    return (
                      <Card key={key} data-testid={`proposal-section-${key}`}>
                        <CardHeader className="flex flex-row items-center gap-2 pb-2">
                          <Icon className="w-5 h-5 text-muted-foreground" />
                          <CardTitle className="text-base">{title}</CardTitle>
                          <Badge variant="outline" className="ml-auto">{Math.round(content.length / 5)} words</Badge>
                        </CardHeader>
                        <CardContent>
                          <div className="prose prose-sm dark:prose-invert max-w-none" data-testid={`proposal-content-${key}`}
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== BINDER TAB ==================== */}
          <TabsContent value="binder" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-semibold">Binder Versions</h2>
                  <p className="text-sm text-muted-foreground">{binderVersions.length} version{binderVersions.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (latestBinder) {
                        setBinderViewerOpen(true);
                      } else {
                        toast({ title: "No binder generated yet. Generate one first." });
                      }
                    }}
                    data-testid="button-binder-view"
                  >
                    <BookOpen className="w-4 h-4 mr-2" />
                    View Binder
                  </Button>
                  <Button
                    onClick={() => setBinderModalOpen(true)}
                    disabled={generateBinderMutation.isPending || !!binderJobId}
                    data-testid="button-binder-generate"
                  >
                    {(generateBinderMutation.isPending || !!binderJobId) ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Generate Binder
                  </Button>
                </div>
              </div>

              {binderJobStatus && (binderJobStatus.status === "queued" || binderJobStatus.status === "running") && (
                <Card data-testid="card-binder-progress">
                  <CardContent className="pt-6 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {binderJobStatus.status === "queued" ? "Waiting to start..." : "Generating binder..."}
                      </span>
                      <span className="text-sm text-muted-foreground">{binderJobStatus.progress}%</span>
                    </div>
                    <Progress value={binderJobStatus.progress} className="h-2" data-testid="progress-binder" />
                    <p className="text-xs text-muted-foreground">
                      {binderJobStatus.progress < 40 ? "Downloading documents..." :
                       binderJobStatus.progress < 80 ? "Merging PDF pages..." :
                       binderJobStatus.progress < 95 ? "Creating ZIP package..." :
                       "Saving outputs..."}
                    </p>
                  </CardContent>
                </Card>
              )}

              {binderJobStatus?.status === "complete" && binderJobStatus.outputs && (
                <Card data-testid="card-binder-complete">
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                      <span className="font-medium">Binder Generated Successfully</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {binderJobStatus.outputs.pdfDocumentId && (
                        <Button variant="outline" asChild data-testid="button-download-binder-pdf">
                          <a href={`/api/documents/${binderJobStatus.outputs.pdfDocumentId}/download`} download>
                            <FileText className="w-4 h-4 mr-2" />
                            Download PDF
                          </a>
                        </Button>
                      )}
                      {binderJobStatus.outputs.zipDocumentId && (
                        <Button variant="outline" asChild data-testid="button-download-binder-zip">
                          <a href={`/api/documents/${binderJobStatus.outputs.zipDocumentId}/download`} download>
                            <Download className="w-4 h-4 mr-2" />
                            Download ZIP
                          </a>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {binderVersions.length === 0 && !binderJobId ? (
                <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                  <BookOpen className="w-12 h-12 mb-4" />
                  <p className="text-lg font-medium" data-testid="text-binder-empty">No binder versions yet</p>
                  <p className="text-sm">Generate a binder to get started</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version #</TableHead>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Page Count</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {binderVersions.map(bv => (
                      <TableRow key={bv.id} data-testid={`row-binder-${bv.id}`}>
                        <TableCell className="font-medium" data-testid={`text-binder-version-${bv.id}`}>
                          v{bv.version}
                        </TableCell>
                        <TableCell data-testid={`text-binder-time-${bv.id}`}>
                          {bv.generatedAt ? new Date(bv.generatedAt).toLocaleString() : "—"}
                        </TableCell>
                        <TableCell data-testid={`text-binder-pages-${bv.id}`}>{bv.pageCount ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusBadgeVariant(bv.status)} data-testid={`badge-binder-status-${bv.id}`}>
                            {bv.status}
                          </Badge>
                        </TableCell>
                        <TableCell data-testid={`text-binder-trigger-${bv.id}`}>{bv.triggerType}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {bv.status === "ready" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setBinderViewerOpen(true);
                                  }}
                                  data-testid={`button-binder-view-${bv.id}`}
                                >
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" asChild data-testid={`button-binder-download-${bv.id}`}>
                                  <a href={`/api/bids/${bidId}/binder/${bv.id}/download`} download>
                                    <Download className="w-4 h-4" />
                                  </a>
                                </Button>
                              </>
                            )}
                            {bv.pageMapJson != null && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setExpandedBinderJson(prev => {
                                    const next = new Set(prev);
                                    if (next.has(bv.id)) next.delete(bv.id);
                                    else next.add(bv.id);
                                    return next;
                                  });
                                }}
                                data-testid={`button-binder-json-${bv.id}`}
                              >
                                <FileText className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {binderVersions.filter(bv => expandedBinderJson.has(bv.id) && bv.pageMapJson).map(bv => (
                <Card key={`json-${bv.id}`}>
                  <CardHeader>
                    <CardTitle className="text-sm">Page Map - v{bv.version}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="max-h-64">
                      <pre className="text-xs bg-muted p-3 rounded-md overflow-auto" data-testid={`text-binder-pagemap-${bv.id}`}>
                        {JSON.stringify(bv.pageMapJson, null, 2)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* ==================== BIDDERS TAB ==================== */}
          <TabsContent value="bidders" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold" data-testid="text-bidders-title">Bid Invitations</h2>
                <Button onClick={() => setInviteDialogOpen(true)} data-testid="button-invite-vendors">
                  <Plus className="w-4 h-4 mr-2" />
                  Invite Vendors
                </Button>
              </div>

              {lastCreatedLinks.length > 0 && (
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">Portal Links Created</CardTitle>
                      <CardDescription>Copy these links to send to vendors. They are shown only once.</CardDescription>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setLastCreatedLinks([])} data-testid="button-dismiss-links">
                      <X className="w-4 h-4" />
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {lastCreatedLinks.map((link, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-2 rounded-md bg-muted">
                          <span className="text-sm flex-1 font-mono truncate" data-testid={`text-portal-link-${idx}`}>
                            {window.location.origin}{link.portalUrl}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              navigator.clipboard.writeText(`${window.location.origin}${link.portalUrl}`);
                              toast({ title: "Copied", description: "Portal link copied to clipboard." });
                            }}
                            data-testid={`button-copy-portal-link-${idx}`}
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {invitationsData?.metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Total Invited</CardTitle>
                      <Mail className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-bidders-total">{invitationsData.metrics.total}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Opened</CardTitle>
                      <Eye className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-bidders-opened">{invitationsData.metrics.opened}</div>
                      <p className="text-xs text-muted-foreground">{invitationsData.metrics.engagementRate}% open rate</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Intending</CardTitle>
                      <CheckCircle2 className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-bidders-intending">{invitationsData.metrics.intends}</div>
                      <p className="text-xs text-muted-foreground">{invitationsData.metrics.responseRate}% response rate</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
                      <CardTitle className="text-sm font-medium">Submitted</CardTitle>
                      <FileCheck className="w-4 h-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold" data-testid="stat-bidders-submitted">{invitationsData.metrics.submitted}</div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {invitationsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : !invitationsData?.invitations?.length ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Users className="w-12 h-12 mb-4" />
                  <p className="text-lg font-medium" data-testid="text-bidders-empty">No vendors invited yet</p>
                  <p className="text-sm">Invite vendors to submit bids for this project</p>
                  <Button variant="outline" className="mt-4" onClick={() => setInviteDialogOpen(true)} data-testid="button-invite-vendors-empty">
                    <Plus className="w-4 h-4 mr-2" />
                    Invite Vendors
                  </Button>
                </div>
              ) : (
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                        <TableHead>Opened</TableHead>
                        <TableHead>Last Activity</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitationsData.invitations.map(inv => (
                        <TableRow key={inv.id} data-testid={`row-bidder-${inv.id}`}>
                          <TableCell>
                            <div className="font-medium" data-testid={`text-bidder-company-${inv.id}`}>
                              {inv.vendor?.companyName || "Unknown Vendor"}
                            </div>
                            <div className="text-xs text-muted-foreground">{inv.vendor?.vendorType || ""}</div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{inv.vendor?.contactName || "-"}</div>
                            <div className="text-xs text-muted-foreground">{inv.vendor?.email || ""}</div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                inv.status === "submitted" ? "default" :
                                inv.status === "intends_to_bid" ? "secondary" :
                                inv.status === "declined" ? "destructive" :
                                inv.status === "opened" ? "outline" :
                                "outline"
                              }
                              data-testid={`badge-bidder-status-${inv.id}`}
                            >
                              {inv.status === "intends_to_bid" ? "Intending" :
                               inv.status === "invited" ? "Invited" :
                               inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.sentAt ? new Date(inv.sentAt).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.openedAt ? new Date(inv.openedAt).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.lastActivityAt ? new Date(inv.lastActivityAt).toLocaleString() : "-"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" data-testid={`button-bidder-actions-${inv.id}`}>
                                  <MoreHorizontal className="w-4 h-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => resendInviteMutation.mutate(inv.id)}
                                  data-testid={`button-resend-${inv.id}`}
                                >
                                  <RefreshCw className="w-4 h-4 mr-2" />
                                  Resend Invitation
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => {
                                    toast({ title: "Portal Link", description: "Portal links are shown once when invitations are created. Resend the invitation to generate a new link." });
                                  }}
                                  data-testid={`button-info-link-${inv.id}`}
                                >
                                  <Link className="w-4 h-4 mr-2" />
                                  Portal Link Info
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Card>
              )}
            </div>

            {inviteDialogOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" data-testid="dialog-invite-vendors">
                <Card className="w-full max-w-lg max-h-[80vh] flex flex-col">
                  <CardHeader className="flex flex-row items-center justify-between gap-2">
                    <CardTitle>Invite Vendors to Bid</CardTitle>
                    <Button size="icon" variant="ghost" onClick={() => { setInviteDialogOpen(false); setSelectedVendorIds(new Set()); }} data-testid="button-close-invite">
                      <X className="w-4 h-4" />
                    </Button>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-hidden flex flex-col gap-3">
                    <Input
                      placeholder="Search vendors..."
                      value={bidderSearch}
                      onChange={e => setBidderSearch(e.target.value)}
                      data-testid="input-vendor-search"
                    />
                    <ScrollArea className="flex-1 max-h-64">
                      <div className="space-y-1">
                        {vendorsList
                          .filter(v => v.status === "active")
                          .filter(v => {
                            const alreadyInvited = invitationsData?.invitations?.some(i => i.vendorId === v.id);
                            return !alreadyInvited;
                          })
                          .filter(v => !bidderSearch || v.companyName.toLowerCase().includes(bidderSearch.toLowerCase()) || (v.contactName && v.contactName.toLowerCase().includes(bidderSearch.toLowerCase())))
                          .map(v => (
                            <div
                              key={v.id}
                              className={`flex items-center gap-3 p-2 rounded-md cursor-pointer hover-elevate ${selectedVendorIds.has(v.id) ? "bg-primary/10" : ""}`}
                              onClick={() => {
                                setSelectedVendorIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(v.id)) next.delete(v.id);
                                  else next.add(v.id);
                                  return next;
                                });
                              }}
                              data-testid={`vendor-option-${v.id}`}
                            >
                              <Checkbox checked={selectedVendorIds.has(v.id)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{v.companyName}</div>
                                <div className="text-xs text-muted-foreground truncate">{v.contactName} {v.email ? `- ${v.email}` : ""}</div>
                              </div>
                              <Badge variant="outline">{v.vendorType}</Badge>
                            </div>
                          ))}
                      </div>
                    </ScrollArea>
                    <Separator />
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-sm text-muted-foreground">{selectedVendorIds.size} vendor(s) selected</span>
                      <Button
                        onClick={() => sendInvitesMutation.mutate(Array.from(selectedVendorIds))}
                        disabled={selectedVendorIds.size === 0 || sendInvitesMutation.isPending}
                        data-testid="button-send-invitations"
                      >
                        {sendInvitesMutation.isPending ? "Sending..." : `Send ${selectedVendorIds.size} Invitation(s)`}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ==================== BID FORM TAB ==================== */}
          <TabsContent value="bid-form" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-4">
              {bidFormLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-8 w-64" />
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : !bidFormData || bidFormData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <ClipboardList className="w-16 h-16 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">No Bid Form Yet</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    Create a bid form to define the scope of work, line items, and alternates that vendors will price against.
                  </p>
                  <Button
                    data-testid="button-create-bid-form"
                    onClick={async () => {
                      try {
                        await apiRequest("POST", `/api/bid-projects/${bidId}/bid-forms`, {});
                        queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'bid-forms'] });
                        toast({ title: "Bid Form Created", description: "You can now add sections and line items." });
                      } catch (err: any) {
                        const msg = err?.message || "";
                        if (msg.startsWith("409:")) {
                          queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'bid-forms'] });
                          toast({ title: "Bid Form Loaded", description: "An existing bid form was found and loaded." });
                        } else {
                          toast({ title: "Error", description: "Failed to create bid form.", variant: "destructive" });
                        }
                      }
                    }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create Bid Form
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-semibold">Bid Form Builder</h2>
                      <Badge
                        variant={bidFormFull?.status === "published" ? "default" : bidFormFull?.status === "closed" ? "secondary" : "outline"}
                        data-testid="badge-bid-form-status"
                      >
                        {bidFormFull?.status || bidFormData[0]?.status || "draft"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(bidFormFull?.status || bidFormData[0]?.status) === "draft" && (
                        <Button
                          variant="default"
                          data-testid="button-publish-bid-form"
                          onClick={async () => {
                            try {
                              const formId = bidFormData[0].id;
                              await apiRequest("POST", `/api/bid-forms/${formId}/publish`);
                              queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'bid-forms'] });
                              queryClient.invalidateQueries({ queryKey: ['/api/bid-forms', 'full'] });
                              toast({ title: "Bid Form Published", description: "Vendors can now view and respond." });
                            } catch (err: any) {
                              const msg = err?.message || "Failed to publish";
                              toast({ title: "Cannot Publish", description: msg, variant: "destructive" });
                            }
                          }}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-2" />
                          Publish
                        </Button>
                      )}
                      {(bidFormFull?.status || bidFormData[0]?.status) === "published" && (
                        <Button
                          variant="secondary"
                          data-testid="button-close-bid-form"
                          onClick={async () => {
                            try {
                              const formId = bidFormData[0].id;
                              await apiRequest("POST", `/api/bid-forms/${formId}/close`);
                              queryClient.invalidateQueries({ queryKey: ['/api/bid-projects', bidId, 'bid-forms'] });
                              queryClient.invalidateQueries({ queryKey: ['/api/bid-forms', 'full'] });
                              toast({ title: "Bid Form Closed" });
                            } catch {
                              toast({ title: "Error", description: "Failed to close form.", variant: "destructive" });
                            }
                          }}
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Close Form
                        </Button>
                      )}
                    </div>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Instructions for Bidders</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Textarea
                        data-testid="textarea-bid-form-instructions"
                        placeholder="Enter instructions for vendors..."
                        value={bidFormFull?.instructions || ""}
                        onChange={async (e) => {
                          const formId = bidFormData[0].id;
                          try {
                            await apiRequest("PUT", `/api/bid-forms/${formId}`, { instructions: e.target.value });
                            queryClient.invalidateQueries({ queryKey: ['/api/bid-forms', 'full'] });
                          } catch {}
                        }}
                        className="min-h-[80px]"
                      />
                      <div className="flex items-center gap-2 mt-3">
                        <Checkbox
                          checked={bidFormFull?.allowUnitPricing || false}
                          onCheckedChange={async (checked) => {
                            const formId = bidFormData[0].id;
                            try {
                              await apiRequest("PUT", `/api/bid-forms/${formId}`, { allowUnitPricing: !!checked });
                              queryClient.invalidateQueries({ queryKey: ['/api/bid-forms', 'full'] });
                            } catch {}
                          }}
                          data-testid="checkbox-allow-unit-pricing"
                        />
                        <span className="text-sm">Allow Unit Pricing</span>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h3 className="text-base font-semibold">Sections</h3>
                      <Button
                        variant="outline"
                        onClick={() => setShowAddSection(true)}
                        data-testid="button-add-section"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Section
                      </Button>
                    </div>

                    {showAddSection && (
                      <Card>
                        <CardContent className="pt-4">
                          <div className="flex items-end gap-3 flex-wrap">
                            <div className="flex-1 min-w-[200px]">
                              <label className="text-sm font-medium mb-1 block">Section Title</label>
                              <Input
                                value={newSectionTitle}
                                onChange={(e) => setNewSectionTitle(e.target.value)}
                                placeholder="e.g. Base Bid, Alternate 1..."
                                data-testid="input-section-title"
                              />
                            </div>
                            <div className="w-48">
                              <label className="text-sm font-medium mb-1 block">Type</label>
                              <Select value={newSectionType} onValueChange={setNewSectionType}>
                                <SelectTrigger data-testid="select-section-type">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="base">Base</SelectItem>
                                  <SelectItem value="alternate">Alternate</SelectItem>
                                  <SelectItem value="allowance">Allowance</SelectItem>
                                  <SelectItem value="unit_price">Unit Price</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <Button
                              data-testid="button-save-section"
                              onClick={async () => {
                                if (!newSectionTitle.trim()) return;
                                try {
                                  const formId = bidFormData[0].id;
                                  await apiRequest("POST", `/api/bid-forms/${formId}/sections`, {
                                    title: newSectionTitle,
                                    sectionType: newSectionType,
                                  });
                                  queryClient.invalidateQueries({ queryKey: ['/api/bid-forms', 'full'] });
                                  setNewSectionTitle("");
                                  setNewSectionType("base");
                                  setShowAddSection(false);
                                  toast({ title: "Section Added" });
                                } catch {
                                  toast({ title: "Error", description: "Failed to add section.", variant: "destructive" });
                                }
                              }}
                            >
                              Save
                            </Button>
                            <Button variant="ghost" onClick={() => { setShowAddSection(false); setNewSectionTitle(""); setNewSectionType("base"); }}>
                              Cancel
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {bidFormFull?.sections?.map((section: any) => (
                      <Collapsible key={section.id} defaultOpen>
                        <Card>
                          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                            <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              <CardTitle className="text-sm font-medium">{section.title}</CardTitle>
                              <Badge variant="outline">{section.sectionType}</Badge>
                              <span className="text-xs text-muted-foreground">({section.lineItems?.length || 0} items)</span>
                            </CollapsibleTrigger>
                            <div className="flex items-center gap-1">
                              <Button
                                size="icon"
                                variant="ghost"
                                data-testid={`button-delete-section-${section.id}`}
                                onClick={async () => {
                                  try {
                                    await apiRequest("DELETE", `/api/bid-form-sections/${section.id}`);
                                    queryClient.invalidateQueries({ queryKey: ['/api/bid-forms', 'full'] });
                                    toast({ title: "Section Deleted" });
                                  } catch {
                                    toast({ title: "Error", description: "Failed to delete section.", variant: "destructive" });
                                  }
                                }}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardHeader>
                          <CollapsibleContent>
                            <CardContent className="pt-0">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Cost Code</TableHead>
                                    <TableHead>UOM</TableHead>
                                    <TableHead>Qty</TableHead>
                                    <TableHead className="w-10"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {section.lineItems?.map((item: any) => (
                                    <TableRow key={item.id} data-testid={`row-line-item-${item.id}`}>
                                      <TableCell className="text-sm">{item.description}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">
                                        {item.costCode ? `${item.costCode.code} - ${item.costCode.name}` : "-"}
                                      </TableCell>
                                      <TableCell className="text-sm">{item.uom || "-"}</TableCell>
                                      <TableCell className="text-sm">{item.qty || "-"}</TableCell>
                                      <TableCell>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          data-testid={`button-delete-line-item-${item.id}`}
                                          onClick={async () => {
                                            try {
                                              await apiRequest("DELETE", `/api/bid-form-line-items/${item.id}`);
                                              queryClient.invalidateQueries({ queryKey: ['/api/bid-forms', 'full'] });
                                              toast({ title: "Line Item Deleted" });
                                            } catch {
                                              toast({ title: "Error", description: "Failed to delete item.", variant: "destructive" });
                                            }
                                          }}
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>

                              {showAddLineItem === section.id ? (
                                <div className="flex items-end gap-2 mt-3 flex-wrap">
                                  <div className="flex-1 min-w-[150px]">
                                    <label className="text-xs font-medium mb-1 block">Description</label>
                                    <Input
                                      value={newItemDesc}
                                      onChange={(e) => setNewItemDesc(e.target.value)}
                                      placeholder="Line item description"
                                      data-testid="input-line-item-desc"
                                    />
                                  </div>
                                  <div className="w-48">
                                    <label className="text-xs font-medium mb-1 block">Cost Code</label>
                                    <Select value={newItemCostCode} onValueChange={setNewItemCostCode}>
                                      <SelectTrigger data-testid="select-line-item-cost-code">
                                        <SelectValue placeholder="Select..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {(costCodesData || []).map((cc: any) => (
                                          <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="w-24">
                                    <label className="text-xs font-medium mb-1 block">UOM</label>
                                    <Input
                                      value={newItemUom}
                                      onChange={(e) => setNewItemUom(e.target.value)}
                                      placeholder="EA, LF..."
                                      data-testid="input-line-item-uom"
                                    />
                                  </div>
                                  <div className="w-24">
                                    <label className="text-xs font-medium mb-1 block">Qty</label>
                                    <Input
                                      value={newItemQty}
                                      onChange={(e) => setNewItemQty(e.target.value)}
                                      placeholder="0"
                                      data-testid="input-line-item-qty"
                                    />
                                  </div>
                                  <Button
                                    data-testid="button-save-line-item"
                                    onClick={async () => {
                                      if (!newItemDesc.trim()) return;
                                      try {
                                        const formId = bidFormData[0].id;
                                        await apiRequest("POST", `/api/bid-forms/${formId}/line-items`, {
                                          sectionId: section.id,
                                          description: newItemDesc,
                                          costCodeId: newItemCostCode && newItemCostCode !== "none" ? newItemCostCode : null,
                                          uom: newItemUom || null,
                                          qty: newItemQty || null,
                                        });
                                        queryClient.invalidateQueries({ queryKey: ['/api/bid-forms', 'full'] });
                                        setNewItemDesc("");
                                        setNewItemCostCode("");
                                        setNewItemUom("");
                                        setNewItemQty("");
                                        setShowAddLineItem(null);
                                        toast({ title: "Line Item Added" });
                                      } catch {
                                        toast({ title: "Error", description: "Failed to add line item.", variant: "destructive" });
                                      }
                                    }}
                                  >
                                    Save
                                  </Button>
                                  <Button variant="ghost" onClick={() => { setShowAddLineItem(null); setNewItemDesc(""); setNewItemCostCode(""); setNewItemUom(""); setNewItemQty(""); }}>
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  className="mt-2"
                                  onClick={() => setShowAddLineItem(section.id)}
                                  data-testid={`button-add-line-item-${section.id}`}
                                >
                                  <Plus className="w-4 h-4 mr-2" />
                                  Add Line Item
                                </Button>
                              )}
                            </CardContent>
                          </CollapsibleContent>
                        </Card>
                      </Collapsible>
                    ))}

                    {bidFormFull && (!bidFormFull.sections || bidFormFull.sections.length === 0) && (
                      <div className="text-center py-8 text-sm text-muted-foreground">
                        No sections yet. Click "Add Section" to get started.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== LEVELING TAB ==================== */}
          <TabsContent value="leveling" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-4">
              {awardData?.activeAward && (
                <Card className="border-green-600/40" data-testid="card-award-banner">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between flex-wrap gap-4">
                      <div className="flex items-start gap-3">
                        <Trophy className="w-8 h-8 text-green-600 mt-1" />
                        <div>
                          <h3 className="text-lg font-bold" data-testid="text-award-vendor">
                            Awarded to {(awardData.activeAward.awardSnapshotJson as any)?.winningVendor?.companyName || "Unknown"}
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Grand Total: <span className="font-semibold">${Number((awardData.activeAward.awardSnapshotJson as any)?.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
                            {" | "}Awarded {new Date(awardData.activeAward.awardedAt).toLocaleDateString()}
                          </p>
                          {awardData.activeAward.notes && (
                            <p className="text-sm text-muted-foreground mt-1">Notes: {awardData.activeAward.notes}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="outline"
                          data-testid="button-download-packet"
                          onClick={() => window.open(`/api/bid-projects/${bidId}/award/packet/download`, '_blank')}
                        >
                          <Download className="w-4 h-4 mr-2" />
                          Download Packet {awardData.packets?.[0] ? `(v${awardData.packets[0].version})` : ""}
                        </Button>
                        <Button
                          variant="outline"
                          data-testid="button-regenerate-packet"
                          disabled={regeneratePacketMutation.isPending}
                          onClick={() => regeneratePacketMutation.mutate()}
                        >
                          <RefreshCw className={`w-4 h-4 mr-2 ${regeneratePacketMutation.isPending ? "animate-spin" : ""}`} />
                          Regenerate
                        </Button>
                        <Button
                          variant="destructive"
                          data-testid="button-rescind-award"
                          onClick={() => setRescindModalOpen(true)}
                        >
                          <Undo2 className="w-4 h-4 mr-2" />
                          Rescind
                        </Button>
                      </div>
                    </div>
                    {awardData.packets?.length > 1 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Packet History</p>
                        <div className="flex flex-wrap gap-2">
                          {awardData.packets.map((p: any) => (
                            <Badge
                              key={p.id}
                              variant="outline"
                              className="cursor-pointer"
                              onClick={() => window.open(`/api/bid-projects/${bidId}/award/packet/download?packetId=${p.id}`, '_blank')}
                            >
                              v{p.version} - {new Date(p.generatedAt).toLocaleDateString()}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {awardData.history?.filter((h: any) => h.status === "rescinded").length > 0 && (
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs text-muted-foreground mb-2">Previous Awards (Rescinded)</p>
                        <div className="space-y-1">
                          {awardData.history.filter((h: any) => h.status === "rescinded").map((h: any) => (
                            <p key={h.id} className="text-xs text-muted-foreground">
                              {(h.awardSnapshotJson as any)?.winningVendor?.companyName} - Rescinded {new Date(h.rescindedAt).toLocaleDateString()}
                              {h.rescindReason ? ` (${h.rescindReason})` : ""}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold">Bid Leveling</h2>
                {levelingData?.vendors?.length > 0 && (
                  <Button
                    variant="outline"
                    data-testid="button-export-leveling-csv"
                    onClick={() => {
                      const params = new URLSearchParams();
                      if (selectedAlternates.length > 0) params.set('alternates', selectedAlternates.join(','));
                      window.open(`/api/bid-projects/${bidId}/leveling/csv?${params}`, '_blank');
                    }}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                )}
              </div>

              {!levelingData?.form || !levelingData?.vendors?.length ? (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <Grid3X3 className="w-16 h-16 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">No Leveling Data</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-md">
                    {!levelingData?.form
                      ? "Create and publish a bid form first, then invite vendors to submit their pricing."
                      : "No vendor responses have been submitted yet. Leveling will be available once vendors submit their bids."}
                  </p>
                </div>
              ) : (
                <>
                  {(() => {
                    const altSections = levelingData.sections?.filter((s: any) => s.sectionType === "alternate") || [];
                    return altSections.length > 0 ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm font-medium">Include Alternates in Grand Total</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-4">
                            {altSections.map((alt: any) => (
                              <div key={alt.id} className="flex items-center gap-2">
                                <Checkbox
                                  checked={selectedAlternates.includes(alt.id)}
                                  onCheckedChange={(checked) => {
                                    const next = checked
                                      ? [...selectedAlternates, alt.id]
                                      : selectedAlternates.filter((id: string) => id !== alt.id);
                                    setSelectedAlternates(next);
                                    setTimeout(() => refetchLeveling(), 100);
                                  }}
                                  data-testid={`checkbox-alternate-${alt.id}`}
                                />
                                <span className="text-sm">{alt.title}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    ) : null;
                  })()}

                  <Card>
                    <CardContent className="pt-4 overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="min-w-[200px]">Section / Line Item</TableHead>
                            <TableHead className="min-w-[120px]">Cost Code</TableHead>
                            {levelingData.vendors.map((v: any) => (
                              <TableHead key={v.vendorId} className="min-w-[120px] text-right">
                                {v.vendorName}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {levelingData.sections?.map((section: any) => {
                            const sectionItems = section.lineItems || [];
                            return (
                              <>{/* Section header */}
                                <TableRow key={`section-${section.id}`} className="bg-muted/50">
                                  <TableCell colSpan={2} className="font-semibold text-sm">
                                    {section.title}
                                    <Badge variant="outline" className="ml-2">{section.sectionType}</Badge>
                                  </TableCell>
                                  {levelingData.vendors.map((v: any) => (
                                    <TableCell key={v.vendorId} className="text-right text-sm font-semibold">
                                      {(() => {
                                        const total = sectionItems.reduce((sum: number, item: any) => {
                                          const ri = v.lineItems?.[item.id];
                                          return sum + (ri?.included ? Number(ri.totalPrice || 0) : 0);
                                        }, 0);
                                        return `$${Number(total).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                      })()}
                                    </TableCell>
                                  ))}
                                </TableRow>
                                {sectionItems.map((item: any) => {
                                  const vendorPrices = levelingData.vendors.map((v: any) => {
                                    const ri = v.lineItems?.[item.id];
                                    return ri?.included ? Number(ri.totalPrice || 0) : 0;
                                  });
                                  const nonZeroPrices = vendorPrices.filter((p: number) => p > 0);
                                  const minPrice = nonZeroPrices.length > 0 ? Math.min(...nonZeroPrices) : 0;
                                  const maxPrice = nonZeroPrices.length > 0 ? Math.max(...nonZeroPrices) : 0;
                                  return (
                                    <TableRow key={`item-${item.id}`} data-testid={`leveling-row-${item.id}`}>
                                      <TableCell className="text-sm pl-8">{item.description}</TableCell>
                                      <TableCell className="text-sm text-muted-foreground">
                                        {item.costCode ? item.costCode.code : "-"}
                                      </TableCell>
                                      {levelingData.vendors.map((v: any, vi: number) => {
                                        const price = vendorPrices[vi];
                                        const isLow = price > 0 && price === minPrice && nonZeroPrices.length > 1;
                                        const isHigh = price > 0 && price === maxPrice && nonZeroPrices.length > 1 && minPrice !== maxPrice;
                                        return (
                                          <TableCell
                                            key={v.vendorId}
                                            className={`text-sm text-right ${isLow ? "text-green-600" : ""} ${isHigh ? "text-red-500" : ""}`}
                                          >
                                            ${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                          </TableCell>
                                        );
                                      })}
                                    </TableRow>
                                  );
                                })}
                              </>
                            );
                          })}
                          <TableRow className="border-t-2 font-bold">
                            <TableCell colSpan={2} className="text-sm font-bold">GRAND TOTAL</TableCell>
                            {levelingData.vendors.map((v: any) => (
                              <TableCell key={v.vendorId} className="text-right text-sm font-bold">
                                ${Number(v.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </TableCell>
                            ))}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {levelingData.vendors.map((v: any) => {
                      const isLowBid = v.grandTotal === levelingData.lowBid && levelingData.lowBid > 0;
                      return (
                        <Card key={v.vendorId} data-testid={`card-vendor-summary-${v.vendorId}`}>
                          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">{v.vendorName}</CardTitle>
                            {isLowBid ? (
                              <Badge variant="default" className="bg-green-600" data-testid={`badge-low-bid-${v.vendorId}`}>Low Bid</Badge>
                            ) : v.varianceFromLow > 0 ? (
                              <Badge variant="destructive" data-testid={`badge-variance-${v.vendorId}`}>
                                +{Number(v.varianceFromLow).toFixed(1)}%
                              </Badge>
                            ) : null}
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Base Total</span>
                                <span className="text-sm font-medium" data-testid={`text-base-total-${v.vendorId}`}>
                                  ${Number(v.baseTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Grand Total</span>
                                <span className="text-sm font-bold" data-testid={`text-grand-total-${v.vendorId}`}>
                                  ${Number(v.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                              </div>
                            </div>
                            {!awardData?.activeAward && (
                              <Button
                                className="w-full mt-3"
                                variant={isLowBid ? "default" : "outline"}
                                data-testid={`button-award-bid-${v.vendorId}`}
                                onClick={() => {
                                  setAwardVendor(v);
                                  setAwardNotes("");
                                  setAwardModalOpen(true);
                                }}
                              >
                                <Trophy className="w-4 h-4 mr-2" />
                                Award Bid
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <Dialog open={awardModalOpen} onOpenChange={setAwardModalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-green-600" />
                    Award Bid
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div>
                    <p className="text-sm text-muted-foreground">Vendor</p>
                    <p className="font-medium" data-testid="text-award-modal-vendor">{awardVendor?.vendorName}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Grand Total</p>
                    <p className="font-medium" data-testid="text-award-modal-total">
                      ${Number(awardVendor?.grandTotal || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Notes (optional)</label>
                    <Textarea
                      data-testid="input-award-notes"
                      placeholder="Add notes about this award decision..."
                      value={awardNotes}
                      onChange={(e) => setAwardNotes(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAwardModalOpen(false)}>Cancel</Button>
                    <Button
                      data-testid="button-confirm-award"
                      disabled={awardMutation.isPending}
                      onClick={() => awardMutation.mutate({
                        winningBidResponseId: awardVendor?.responseId,
                        notes: awardNotes || undefined,
                      })}
                    >
                      {awardMutation.isPending ? "Awarding..." : "Confirm Award"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={rescindModalOpen} onOpenChange={setRescindModalOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Undo2 className="w-5 h-5 text-destructive" />
                    Rescind Award
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <p className="text-sm text-muted-foreground">
                    Rescinding will remove the current award and allow vendors to submit bids again. This action is logged in the audit trail.
                  </p>
                  <div>
                    <label className="text-sm font-medium">Reason for Rescinding</label>
                    <Textarea
                      data-testid="input-rescind-reason"
                      placeholder="Provide a reason for rescinding this award..."
                      value={rescindReason}
                      onChange={(e) => setRescindReason(e.target.value)}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setRescindModalOpen(false)}>Cancel</Button>
                    <Button
                      variant="destructive"
                      data-testid="button-confirm-rescind"
                      disabled={rescindMutation.isPending}
                      onClick={() => rescindMutation.mutate({ reason: rescindReason || undefined })}
                    >
                      {rescindMutation.isPending ? "Rescinding..." : "Confirm Rescind"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ==================== ARTIFACTS TAB ==================== */}
          <TabsContent value="artifacts" className="flex-1 overflow-auto p-4 mt-0">
            <ArtifactsPanel bidProjectId={bidId} />
          </TabsContent>

          {/* ==================== MASTER CHECKLIST TAB ==================== */}
          <TabsContent value="master-checklist" className="flex-1 overflow-auto p-4 mt-0">
            <MasterChecklistPanel bidProjectId={bidId} />
          </TabsContent>

          {/* ==================== ACTIVITY TAB ==================== */}
          <TabsContent value="activity" className="flex-1 overflow-auto p-4 mt-0">
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-lg font-semibold">Activity Log</h2>
                <Select value={activityFilter} onValueChange={setActivityFilter}>
                  <SelectTrigger className="w-48" data-testid="select-activity-filter">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Filter by type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Events</SelectItem>
                    {eventTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {auditLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : filteredAuditEvents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Activity className="w-12 h-12 mb-4" />
                  <p className="text-lg font-medium" data-testid="text-activity-empty">No activity yet</p>
                  <p className="text-sm">Audit trail events will appear here</p>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
                  <div className="space-y-4">
                    {filteredAuditEvents.map(event => (
                      <div key={event.id} className="relative pl-10" data-testid={`row-activity-${event.id}`}>
                        <div className="absolute left-2.5 top-2 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                        <Card>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-2 flex-wrap">
                              <div className="flex-1">
                                <p className="text-sm font-medium" data-testid={`text-activity-action-${event.id}`}>{event.action}</p>
                                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  <span data-testid={`text-activity-time-${event.id}`}>
                                    {new Date(event.timestamp).toLocaleString()}
                                  </span>
                                  <span data-testid={`text-activity-actor-${event.id}`}>by {event.actor}</span>
                                </div>
                              </div>
                              <Badge variant="outline" data-testid={`badge-activity-type-${event.id}`}>{event.eventType}</Badge>
                            </div>
                            {(event.beforeValues || event.afterValues) && (
                              <div className="mt-2 grid grid-cols-2 gap-2">
                                {event.beforeValues && (
                                  <div className="p-2 bg-muted rounded-md">
                                    <p className="text-xs text-muted-foreground mb-1">Before</p>
                                    <pre className="text-xs overflow-auto max-h-20" data-testid={`text-activity-before-${event.id}`}>
                                      {JSON.stringify(event.beforeValues, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {event.afterValues && (
                                  <div className="p-2 bg-muted rounded-md">
                                    <p className="text-xs text-muted-foreground mb-1">After</p>
                                    <pre className="text-xs overflow-auto max-h-20" data-testid={`text-activity-after-${event.id}`}>
                                      {JSON.stringify(event.afterValues, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ==================== PRICING TAB ==================== */}
          <TabsContent value="pricing" className="flex-1 overflow-auto p-4 mt-0">
            <PricingTab bidId={bidId!} data={pricingData} isLoading={pricingLoading} />
          </TabsContent>

          {/* ==================== TRANSITION TAB ==================== */}
          <TabsContent value="transition" className="flex-1 overflow-auto p-4 mt-0">
            <TransitionTab bidId={bidId!} data={transitionData} isLoading={transitionLoading} />
          </TabsContent>
          </div>
        </Tabs>

        {/* Document Viewer Dialog */}
        <Dialog open={documentViewerOpen} onOpenChange={setDocumentViewerOpen}>
          <DialogContent className="max-w-6xl h-[90vh] p-0">
            {selectedDocument && (
              selectedDocument.fileType === "pdf" || selectedDocument.fileName.toLowerCase().endsWith(".pdf") ? (
                <PDFViewer
                  url={`/api/documents/${selectedDocument.id}/download`}
                  fileName={selectedDocument.fileName}
                  onClose={() => setDocumentViewerOpen(false)}
                  mode="inline"
                />
              ) : selectedDocument.fileType.startsWith("image") || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(selectedDocument.fileName) ? (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{selectedDocument.fileName}</span>
                      <Badge variant="secondary" className="text-xs">
                        {selectedDocument.documentType || selectedDocument.fileType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(25, z - 25))} data-testid="button-zoom-out">
                        <ZoomOut className="w-4 h-4" />
                      </Button>
                      <span className="text-xs font-medium min-w-[50px] text-center">{zoom}%</span>
                      <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(300, z + 25))} data-testid="button-zoom-in">
                        <ZoomIn className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" asChild data-testid="button-download-doc">
                        <a href={`/api/documents/${selectedDocument.id}/download`} download={selectedDocument.fileName}>
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDocumentViewerOpen(false)} data-testid="button-close-viewer">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/20 p-4">
                    {isDocMissing(selectedDocument.id) ? (
                      <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                        <AlertTriangle className="w-16 h-16 opacity-50" />
                        <p className="text-sm font-medium">File missing from storage</p>
                        <p className="text-xs">This document record exists but the file is no longer available.</p>
                      </div>
                    ) : (
                    <img
                      src={`/api/documents/${selectedDocument.id}/download`}
                      alt={selectedDocument.fileName}
                      style={{ transform: `scale(${zoom / 100})`, maxWidth: "100%", maxHeight: "100%" }}
                      className="shadow-lg"
                      onError={handleImgError(selectedDocument.id)}
                    />
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{selectedDocument.fileName}</span>
                      <Badge variant="secondary" className="text-xs">
                        {selectedDocument.documentType || selectedDocument.fileType}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" asChild data-testid="button-download-doc">
                        <a href={`/api/documents/${selectedDocument.id}/download`} download={selectedDocument.fileName}>
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDocumentViewerOpen(false)} data-testid="button-close-viewer">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <TextFileViewer doc={selectedDocument} onStorageMissing={markDocMissing} />
                  <div className="flex items-center gap-3 p-3 border-t">
                    <Button variant="outline" asChild data-testid="button-download-fallback">
                      <a href={`/api/documents/${selectedDocument.id}/download`} download={selectedDocument.fileName}>
                        <Download className="w-4 h-4 mr-2" />
                        Download
                      </a>
                    </Button>
                    <Button variant="destructive" onClick={() => setDeleteConfirmDoc(selectedDocument)} data-testid="button-delete-from-viewer">
                      <XCircle className="w-4 h-4 mr-2" />
                      Delete
                    </Button>
                    <Select onValueChange={(fid) => { moveMutation.mutate({ docId: selectedDocument.id, targetFolderId: fid }); }}>
                      <SelectTrigger className="w-[180px]" data-testid="select-move-folder">
                        <SelectValue placeholder="Move to folder..." />
                      </SelectTrigger>
                      <SelectContent>
                        {folders.filter(f => f.id !== selectedDocument.folderId).map(f => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )
            )}
          </DialogContent>
        </Dialog>

        {/* Binder Viewer Dialog with Page Jump */}
        <Dialog open={binderViewerOpen} onOpenChange={(open) => { setBinderViewerOpen(open); if (!open) setInlineViewDoc(null); }}>
          <DialogContent className={inlineViewDoc ? "max-w-[95vw] h-[90vh]" : "max-w-6xl h-[90vh]"}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Bid Binder - Version {latestBinder?.version || 1}
              </DialogTitle>
              <DialogDescription>
                {latestBinder?.pageCount || 0} pages {binderPage > 1 ? `• Viewing page ${binderPage}` : ""} • Generated {latestBinder?.generatedAt ? new Date(latestBinder.generatedAt).toLocaleString() : "Not yet generated"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between gap-2 border-b pb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Select defaultValue={String(latestBinder?.version || 1)}>
                  <SelectTrigger className="w-32" data-testid="select-binder-version">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {binderVersions.map(v => (
                      <SelectItem key={v.id} value={String(v.version)}>
                        Version {v.version}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1 ml-2">
                  <span className="text-xs text-muted-foreground">Go to page:</span>
                  <Input
                    data-testid="input-binder-page-jump"
                    type="number"
                    min={1}
                    max={latestBinder?.pageCount || 1}
                    value={binderPage}
                    onChange={(e) => setBinderPage(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 h-8"
                  />
                  <span className="text-xs text-muted-foreground">/ {latestBinder?.pageCount || "?"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" data-testid="button-download-binder" asChild>
                  <a href={latestBinder ? `/api/bids/${bidId}/binder/${latestBinder.id}/download` : "#"} download>
                    <Download className="w-4 h-4 mr-2" />
                    Download PDF
                  </a>
                </Button>
                <Button variant="outline" data-testid="button-print-binder" onClick={() => {
                  const printArea = document.getElementById("binder-print-area");
                  if (printArea) {
                    const w = window.open("", "_blank");
                    if (w) {
                      const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
                        .map(el => el.outerHTML).join("\n");
                      w.document.write(`<html><head><title>Bid Binder - ${bidProject?.opportunityTitle || "Print"}</title>${cssLinks}<style>@media print{.no-print{display:none!important}.page-break{page-break-before:always}}body{background:white!important}</style></head><body class="light">${printArea.innerHTML}</body></html>`);
                      w.document.close();
                      w.focus();
                      setTimeout(() => w.print(), 500);
                    }
                  }
                }}>
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button variant="outline" data-testid="button-share-binder">
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>

            <div className="flex flex-1 overflow-hidden gap-4">
              <div className="w-64 border-r pr-4">
                <h3 className="font-medium mb-3">Table of Contents</h3>
                <ScrollArea className="h-full">
                  <div className="space-y-1">
                    <div
                      className={`p-2 rounded-md cursor-pointer ${binderPage === 1 ? "bg-primary/10" : "hover-elevate"}`}
                      onClick={() => setBinderPage(1)}
                    >
                      <span className="text-sm">Cover Page</span>
                      <span className="text-xs text-muted-foreground ml-2">p. 1</span>
                    </div>
                    <div
                      className={`p-2 rounded-md cursor-pointer ${binderPage === 2 ? "bg-primary/10" : "hover-elevate"}`}
                      onClick={() => setBinderPage(2)}
                    >
                      <span className="text-sm">Table of Contents</span>
                      <span className="text-xs text-muted-foreground ml-2">p. 2</span>
                    </div>
                    {latestBinder?.pageMapJson?.sections ? (
                      latestBinder.pageMapJson.sections.map((sec, i) => {
                        const sectionPage = i + 3;
                        return (
                          <div
                            key={i}
                            className={`p-2 rounded-md cursor-pointer ${binderPage === sec.startPage ? "bg-primary/10" : "hover-elevate"}`}
                            onClick={() => {
                              setBinderPage(sec.startPage);
                              const el = document.getElementById(`binder-section-${sec.sectionCode}`);
                              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            data-testid={`toc-nav-${sec.sectionCode}`}
                          >
                            <span className="text-sm">{sec.sectionName}</span>
                            <span className="text-xs text-muted-foreground ml-2">p. {sec.startPage}</span>
                          </div>
                        );
                      })
                    ) : (
                      folders.map((folder, i) => {
                        const code = String(folder.sortOrder ?? i).padStart(2, "0");
                        const folderPage = 3 + i * 5;
                        return (
                          <div
                            key={folder.id}
                            className={`p-2 rounded-md cursor-pointer ${binderPage === folderPage ? "bg-primary/10" : "hover-elevate"}`}
                            onClick={() => {
                              setBinderPage(folderPage);
                              const el = document.getElementById(`binder-section-${code}`);
                              if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                            }}
                            data-testid={`toc-nav-folder-${code}`}
                          >
                            <span className="text-sm">{folder.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">p. {folderPage}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>

              <div className="flex-1 bg-muted rounded-lg flex items-center justify-center overflow-auto">
                {latestBinder ? (
                  <BinderHtmlRenderer
                    bidId={bidId}
                    latestBinder={latestBinder}
                    folders={folders}
                    binderPage={binderPage}
                    onNavigatePage={(p) => setBinderPage(p)}
                    onClose={() => setBinderViewerOpen(false)}
                    onViewDocument={(doc) => setInlineViewDoc(doc)}
                    bidTitle={bidProject?.opportunityTitle || "Bid Package"}
                    noticeId={bidProject?.noticeId || ""}
                    agency={bidProject?.agency || ""}
                    dueAt={bidProject?.dueAt || ""}
                  />
                ) : (
                  <div className="bg-white dark:bg-card shadow-lg p-8 m-8">
                    <div className="w-[612px] h-[792px] flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 rounded-lg">
                      <BookOpen className="w-24 h-24 mb-4 text-muted-foreground" />
                      <p className="text-lg font-medium text-muted-foreground">Binder Preview</p>
                      <p className="text-sm text-muted-foreground mt-2">Generate a binder first</p>
                      <Button
                        className="mt-4"
                        onClick={() => {
                          setBinderViewerOpen(false);
                          setBinderModalOpen(true);
                        }}
                        data-testid="button-generate-binder-preview"
                      >
                        Generate Binder
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {!inlineViewDoc && (
                <div className="w-24">
                  <h3 className="font-medium mb-3 text-sm">Pages</h3>
                  <ScrollArea className="h-full">
                    <div className="space-y-2">
                      {Array.from({ length: Math.min(latestBinder?.pageCount || 5, 50) }).map((_, i) => (
                        <div
                          key={i}
                          data-testid={`button-page-thumb-${i + 1}`}
                          className={`aspect-[4/5] border rounded cursor-pointer flex items-center justify-center text-xs ${
                            binderPage === i + 1 
                              ? "border-primary bg-primary/10 font-bold" 
                              : "bg-white dark:bg-card hover:border-primary text-muted-foreground"
                          }`}
                          onClick={() => setBinderPage(i + 1)}
                        >
                          {i + 1}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
              {inlineViewDoc && (
                <div className="w-[45%] min-w-[320px] max-w-[600px]" data-testid="inline-viewer-panel">
                  <InlineDocumentViewer doc={inlineViewDoc} onClose={() => setInlineViewDoc(null)} />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Upload Dialog */}
        <UploadDialog
          open={uploadDialogOpen}
          onOpenChange={setUploadDialogOpen}
          bidId={bidId}
          folders={folders}
          initialFolderId={uploadFolderId}
          onComplete={handleUploadComplete}
        />

        {/* Delete Confirmation */}
        <Dialog open={!!deleteConfirmDoc} onOpenChange={(open) => { if (!open) setDeleteConfirmDoc(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Document</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deleteConfirmDoc?.fileName}"? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleteConfirmDoc(null)} data-testid="button-cancel-delete">
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => deleteConfirmDoc && deleteMutation.mutate(deleteConfirmDoc.id)}
                disabled={deleteMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Photo Lightbox Dialog */}
        <Dialog open={!!photoLightboxDoc} onOpenChange={(open) => { if (!open) { setPhotoLightboxDoc(null); setEditingTagsDocId(null); setTagInputValue(""); } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] p-0">
            {photoLightboxDoc && (() => {
              const currentIdx = photoDocuments.findIndex(d => d.id === photoLightboxDoc.id);
              const prevDoc = currentIdx > 0 ? photoDocuments[currentIdx - 1] : null;
              const nextDoc = currentIdx < photoDocuments.length - 1 ? photoDocuments[currentIdx + 1] : null;
              const docTags = (photoLightboxDoc.tagsJson as string[]) || [];
              return (
                <div className="flex flex-col h-full">
                  <div className="flex items-center justify-between p-3 border-b">
                    <div className="flex items-center gap-2 min-w-0">
                      <ImageIcon className="w-4 h-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm font-medium truncate" data-testid="text-lightbox-filename">{photoLightboxDoc.fileName}</span>
                      <Badge variant="outline" className="text-[10px] shrink-0">{currentIdx + 1}/{photoDocuments.length}</Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" asChild data-testid="button-lightbox-download">
                        <a href={`/api/documents/${photoLightboxDoc.id}/download`} download={photoLightboxDoc.fileName}>
                          <Download className="w-4 h-4" />
                        </a>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setPhotoLightboxDoc(null); openDocumentViewer(photoLightboxDoc); }} data-testid="button-lightbox-details">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="relative flex-1 flex items-center justify-center bg-black/5 dark:bg-black/20 min-h-[400px] max-h-[60vh]">
                    {prevDoc && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute left-2 z-10 bg-background/80"
                        onClick={() => setPhotoLightboxDoc(prevDoc)}
                        data-testid="button-lightbox-prev"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </Button>
                    )}
                    {isDocMissing(photoLightboxDoc.id) ? (
                      <div className="flex flex-col items-center justify-center text-muted-foreground gap-2 py-16">
                        <AlertTriangle className="w-16 h-16 opacity-50" />
                        <p className="text-sm font-medium">File missing from storage</p>
                        <p className="text-xs">This document record exists but the file is no longer available.</p>
                      </div>
                    ) : (
                      <img
                        src={`/api/documents/${photoLightboxDoc.id}/download`}
                        alt={photoLightboxDoc.fileName}
                        className="max-w-full max-h-[60vh] object-contain"
                        data-testid="img-lightbox"
                        onError={handleImgError(photoLightboxDoc.id)}
                      />
                    )}
                    {nextDoc && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 z-10 bg-background/80"
                        onClick={() => setPhotoLightboxDoc(nextDoc)}
                        data-testid="button-lightbox-next"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                  <div className="p-3 border-t space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="w-3 h-3 text-muted-foreground shrink-0" />
                      {docTags.map(tag => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-xs cursor-pointer"
                          onClick={() => {
                            const newTags = docTags.filter(t => t !== tag);
                            tagsMutation.mutate({ docId: photoLightboxDoc.id, tags: newTags });
                            setPhotoLightboxDoc({ ...photoLightboxDoc, tagsJson: newTags });
                          }}
                          data-testid={`badge-tag-${tag}`}
                        >
                          {tag}
                          <X className="w-3 h-3 ml-1" />
                        </Badge>
                      ))}
                      {editingTagsDocId === photoLightboxDoc.id ? (
                        <div className="flex items-center gap-1">
                          <Input
                            value={tagInputValue}
                            onChange={(e) => setTagInputValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && tagInputValue.trim()) {
                                const newTags = [...docTags, tagInputValue.trim()];
                                tagsMutation.mutate({ docId: photoLightboxDoc.id, tags: newTags });
                                setPhotoLightboxDoc({ ...photoLightboxDoc, tagsJson: newTags });
                                setTagInputValue("");
                              }
                              if (e.key === "Escape") { setEditingTagsDocId(null); setTagInputValue(""); }
                            }}
                            placeholder="Add tag..."
                            className="w-24 text-xs"
                            autoFocus
                            data-testid="input-add-tag"
                          />
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => setEditingTagsDocId(photoLightboxDoc.id)}
                          data-testid="button-add-tag"
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Tag
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span>{formatFileSize(photoLightboxDoc.fileSizeBytes)}</span>
                      <span>{new Date(photoLightboxDoc.uploadedAt).toLocaleDateString()}</span>
                      <Badge variant={getDocStatusVariant(photoLightboxDoc.status)} className="text-[10px]">{photoLightboxDoc.status}</Badge>
                    </div>
                  </div>
                </div>
              );
            })()}
          </DialogContent>
        </Dialog>

        {/* Create New Document Dialog */}
        <Dialog open={createDocOpen} onOpenChange={setCreateDocOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Document</DialogTitle>
              <DialogDescription>
                Create a blank document in the selected folder.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={createDocTitle}
                  onChange={(e) => setCreateDocTitle(e.target.value)}
                  placeholder="Document title"
                  data-testid="input-create-doc-title"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Document Type</label>
                <Select value={createDocType} onValueChange={setCreateDocType}>
                  <SelectTrigger data-testid="select-create-doc-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="checklist">Checklist</SelectItem>
                    <SelectItem value="letter">Letter</SelectItem>
                    <SelectItem value="specification">Specification</SelectItem>
                    <SelectItem value="plan">Plan</SelectItem>
                    <SelectItem value="report">Report</SelectItem>
                    <SelectItem value="correspondence">Correspondence</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Folder</label>
                <Select value={createDocFolderId || folders[0]?.id || ""} onValueChange={setCreateDocFolderId}>
                  <SelectTrigger data-testid="select-create-doc-folder">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {folders.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Notes (optional)</label>
                <Textarea
                  value={createDocNotes}
                  onChange={(e) => setCreateDocNotes(e.target.value)}
                  placeholder="Add notes or initial content..."
                  rows={4}
                  data-testid="textarea-create-doc-notes"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setCreateDocOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateDocument} disabled={!createDocTitle.trim()} data-testid="button-create-doc-submit">
                  Create Document
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Final Approval Gate Dialog */}
        <Dialog open={binderModalOpen} onOpenChange={setBinderModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                Generate Bid Binder
              </DialogTitle>
              <DialogDescription>
                Assemble all bid jacket documents into a professional binder package with cover page, table of contents, and section dividers.
              </DialogDescription>
            </DialogHeader>
            <BinderOptionsForm
              onSubmit={(opts) => {
                setBinderModalOpen(false);
                generateBinderMutation.mutate(opts);
              }}
              isPending={generateBinderMutation.isPending}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={approvalGateOpen} onOpenChange={setApprovalGateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Final Approval Gate
              </DialogTitle>
              <DialogDescription>
                Submit this bid for final leadership approval before official submission. This action will lock the bid package.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Bid Title</span>
                    <span className="text-sm font-medium" data-testid="text-gate-title">{bidProject?.opportunityTitle}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Documents</span>
                    <span className="text-sm font-medium" data-testid="text-gate-docs">{allDocuments.length}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Binder Status</span>
                    <Badge variant={latestBinder ? "default" : "destructive"} data-testid="badge-gate-binder">
                      {latestBinder ? `v${latestBinder.version} Ready` : "Not Generated"}
                    </Badge>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Current Status</span>
                    <Badge variant="outline" data-testid="badge-gate-status">{bidProject?.status || "Unknown"}</Badge>
                  </div>
                </CardContent>
              </Card>

              {!latestBinder && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>A binder must be generated before submission. Please generate a binder first.</span>
                </div>
              )}

              <div className="flex items-center gap-2 p-3 rounded-md bg-muted text-sm">
                <Shield className="w-4 h-4 shrink-0" />
                <span>Once submitted, the bid package will be locked and sent to leadership for final sign-off. No further changes can be made without reopening the bid.</span>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setApprovalGateOpen(false)} data-testid="button-gate-cancel">
                  Cancel
                </Button>
                <Button
                  onClick={() => submitApprovalMutation.mutate()}
                  disabled={!latestBinder || submitApprovalMutation.isPending}
                  data-testid="button-gate-submit"
                >
                  {submitApprovalMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Submit for Final Approval
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

      {detailDoc && (
        <Dialog open={!!detailDoc} onOpenChange={() => setDetailDoc(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Document Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">File Name</p>
                  <p className="text-sm font-medium" data-testid="detail-doc-filename">{detailDoc.fileName}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Type</p>
                  <p className="text-sm font-medium">{detailDoc.documentType || detailDoc.fileType}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Size</p>
                  <p className="text-sm font-medium">{formatFileSize(detailDoc.fileSizeBytes)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p>
                  <Badge variant={getDocStatusVariant(detailDoc.status)} data-testid="detail-doc-status">{detailDoc.status}</Badge>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Version</p>
                  <p className="text-sm font-medium">v{detailDoc.version}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Uploaded</p>
                  <p className="text-sm font-medium">{new Date(detailDoc.uploadedAt).toLocaleString()}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">MIME Type</p>
                  <p className="text-sm font-medium">{detailDoc.mimeType || "—"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Source</p>
                  <p className="text-sm font-medium">{(detailDoc as any).source || "manual"}</p>
                </div>
                <div className="col-span-2 space-y-1">
                  <p className="text-xs text-muted-foreground">Storage Key</p>
                  <p className="text-sm font-mono text-muted-foreground break-all">{detailDoc.storageKey || "—"}</p>
                </div>
                <div className="col-span-2 space-y-1">
                  <p className="text-xs text-muted-foreground">Visibility</p>
                  <Badge variant="outline">{(detailDoc as any).visibility || "internal"}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => { setDetailDoc(null); setVersionHistoryDoc(detailDoc); }} data-testid="button-detail-versions">
                  <Layers className="w-4 h-4 mr-2" />
                  Version History
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/documents/${detailDoc.id}/download`} download={detailDoc.fileName} data-testid="button-detail-download">
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </a>
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  const fullUrl = `${window.location.origin}/api/documents/${detailDoc.id}/download`;
                  navigator.clipboard.writeText(fullUrl);
                  toast({ title: "Link Copied" });
                }} data-testid="button-detail-copy-link">
                  <Link className="w-4 h-4 mr-2" />
                  Copy Link
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {versionHistoryDoc && (
        <Dialog open={!!versionHistoryDoc} onOpenChange={() => setVersionHistoryDoc(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Version History</DialogTitle>
              <DialogDescription>{versionHistoryDoc.fileName}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 p-3 border rounded-md bg-muted/30">
                <div className="flex items-center gap-3">
                  <Badge>v{versionHistoryDoc.version}</Badge>
                  <div>
                    <p className="text-sm font-medium">Current Version</p>
                    <p className="text-xs text-muted-foreground">{new Date(versionHistoryDoc.uploadedAt).toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" asChild>
                    <a href={`/api/documents/${versionHistoryDoc.id}/download`} download={versionHistoryDoc.fileName}>
                      <Download className="w-4 h-4" />
                    </a>
                  </Button>
                </div>
              </div>
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setVersionHistoryDoc(null);
                    setUploadFolderId(versionHistoryDoc.folderId);
                    setUploadDialogOpen(true);
                  }}
                  data-testid="button-upload-new-version"
                >
                  <FilePlus className="w-4 h-4 mr-2" />
                  Upload New Version
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      </div>
    </TooltipProvider>
  );
}

function formatBytesCompact(bytes: number) {
  if (bytes == null) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const SECTION_REQUIREMENTS: Record<string, string[]> = {
  "00": ["Solicitation Document", "Amendment Notices", "Cover Letter"],
  "01": ["Technical Approach", "Management Plan", "Work Breakdown Structure"],
  "02": ["Past Performance References", "Contract History", "Performance Ratings"],
  "03": ["Cost Proposal", "Price Schedule", "Rate Tables"],
  "04": ["Certifications", "Representations", "SAM Registration"],
  "05": ["Key Personnel Resumes", "Org Chart", "Staffing Plan"],
  "06": ["Quality Control Plan", "Safety Plan", "Environmental Compliance"],
  "07": ["Subcontracting Plan", "Small Business Goals", "Teaming Agreements"],
  "08": ["Bonding Capacity", "Insurance Certificates", "Financial Statements"],
  "09": ["Project Schedule", "Milestones", "Critical Path"],
  "10": ["Equipment List", "Material Sources", "Logistics Plan"],
  "11": ["Site Plans", "Drawings", "Specifications"],
  "12": ["Permits", "Licenses", "Regulatory Approvals"],
  "13": ["Correspondence", "Meeting Minutes", "RFI Responses"],
  "14": ["Award Notice", "Post-Award Documents", "Transition Plan"],
};

function getSectionCompleteness(sectionCode: string, docs: JacketDocument[]) {
  const code = sectionCode?.replace(/[^0-9]/g, "").slice(0, 2) || "00";
  const required = SECTION_REQUIREMENTS[code] || [];
  if (required.length === 0) return { score: docs.length > 0 ? 100 : 0, status: docs.length > 0 ? "complete" as const : "empty" as const, matched: 0, total: 0 };

  let matched = 0;
  for (const req of required) {
    const reqLower = req.toLowerCase();
    const found = docs.some(d => {
      const title = (d.title || d.fileName || "").toLowerCase();
      return reqLower.split(" ").some(word => word.length > 3 && title.includes(word));
    });
    if (found) matched++;
  }
  const score = Math.round((matched / required.length) * 100);
  const status = score >= 80 ? "complete" as const : score >= 40 ? "partial" as const : "missing" as const;
  return { score, status, matched, total: required.length };
}

function getEvidenceMap(sectionCode: string, doc: JacketDocument) {
  const code = sectionCode?.replace(/[^0-9]/g, "").slice(0, 2) || "00";
  const required = SECTION_REQUIREMENTS[code] || [];
  const title = (doc.title || doc.fileName || "").toLowerCase();
  const matches: string[] = [];
  for (const req of required) {
    const reqLower = req.toLowerCase();
    if (reqLower.split(" ").some(word => word.length > 3 && title.includes(word))) {
      matches.push(req);
    }
  }
  return matches;
}

function InlineDocumentViewer({ doc, onClose }: { doc: JacketDocument; onClose: () => void }) {
  const downloadUrl = `/api/documents/${doc.id}/download`;
  const ext = (doc.fileName || "").split(".").pop()?.toLowerCase() || "";
  const mime = (doc.mimeType || "").toLowerCase();

  const isPdf = ext === "pdf" || mime === "application/pdf";
  const isImage = /^(jpg|jpeg|png|gif|webp|bmp|svg|tiff?)$/i.test(ext) || mime.startsWith("image/");
  const isDocx = ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isText = /^(txt|csv|json|xml|md|log|html|css|js|ts|yaml|yml|ini|cfg|toml|env|sh|bat|py|rb|go|rs|java|cpp|c|h)$/i.test(ext) || mime.startsWith("text/") || mime === "application/json";

  return (
    <div className="flex flex-col h-full bg-background border-l" data-testid="inline-doc-viewer">
      <div className="flex items-center justify-between gap-2 p-3 border-b bg-muted/30">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate" data-testid="inline-viewer-filename">{doc.fileName}</p>
          <p className="text-xs text-muted-foreground">{doc.fileType?.toUpperCase()} &middot; {formatBytesCompact(doc.fileSizeBytes)}</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => {
            const fullUrl = `${window.location.origin}${downloadUrl}`;
            navigator.clipboard.writeText(fullUrl);
          }} data-testid="button-inline-copy-link" title="Copy link">
            <Link className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" asChild data-testid="button-inline-download" title="Download">
            <a href={downloadUrl} download={doc.fileName}>
              <Download className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild data-testid="button-inline-open-tab" title="Open in new tab">
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-inline-close" title="Close viewer">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {isPdf && <PdfJsViewer url={downloadUrl} />}
        {isImage && <ImageViewer url={downloadUrl} alt={doc.fileName} />}
        {isDocx && <DocxViewer url={downloadUrl} />}
        {isText && !isPdf && !isImage && !isDocx && <TextInlineViewer url={downloadUrl} fileName={doc.fileName} />}
        {!isPdf && !isImage && !isDocx && !isText && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6">
            <FileText className="w-16 h-16 text-muted-foreground" />
            <p className="text-sm font-medium">{doc.fileName}</p>
            <p className="text-xs text-muted-foreground">Preview not available for this file type</p>
            <Button variant="outline" asChild>
              <a href={downloadUrl} download={doc.fileName}>
                <Download className="w-4 h-4 mr-2" />
                Download to view
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function PdfJsViewer({ url }: { url: string }) {
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);
  const loadingTaskRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentPage(1);

    if (pdfDocRef.current) {
      pdfDocRef.current.destroy();
      pdfDocRef.current = null;
    }

    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
        const loadingTask = pdfjsLib.getDocument(url);
        loadingTaskRef.current = loadingTask;
        const pdf = await loadingTask.promise;
        if (cancelled) { pdf.destroy(); return; }
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to load PDF");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (loadingTaskRef.current) {
        try { loadingTaskRef.current.destroy(); } catch {}
        loadingTaskRef.current = null;
      }
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
  }, [url]);

  useEffect(() => {
    if (!pdfDocRef.current || !canvasContainerRef.current || numPages === 0) return;
    const pageToRender = Math.min(currentPage, numPages);
    let cancelled = false;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch {}
      renderTaskRef.current = null;
    }

    (async () => {
      try {
        const page = await pdfDocRef.current.getPage(pageToRender);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const container = canvasContainerRef.current;
        if (!container) return;
        container.innerHTML = "";
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = "100%";
        canvas.style.height = "auto";
        container.appendChild(canvas);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const task = page.render({ canvasContext: ctx, viewport });
          renderTaskRef.current = task;
          await task.promise;
        }
      } catch (err: any) {
        if (!cancelled && err?.name !== "RenderingCancelledException") {
          console.error("PDF render error:", err);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel(); } catch {}
        renderTaskRef.current = null;
      }
    };
  }, [currentPage, scale, numPages]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="pdfjs-viewer">
      <div className="flex items-center justify-center gap-2 p-2 border-b bg-muted/20 flex-wrap">
        <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)} data-testid="button-pdf-prev">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs font-medium" data-testid="text-pdf-page">{currentPage} / {numPages}</span>
        <Button variant="outline" size="sm" disabled={currentPage >= numPages} onClick={() => setCurrentPage(p => p + 1)} data-testid="button-pdf-next">
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Separator orientation="vertical" className="h-4 mx-1" />
        <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.max(0.5, s - 0.25))} data-testid="button-pdf-zoom-out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs w-12 text-center">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" onClick={() => setScale(s => Math.min(3.0, s + 0.25))} data-testid="button-pdf-zoom-in">
          <ZoomIn className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto flex justify-center p-4 bg-muted/10" data-testid="pdf-canvas-container">
        <div ref={canvasContainerRef} className="inline-block" />
      </div>
    </div>
  );
}

function ImageViewer({ url, alt }: { url: string; alt: string }) {
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  return (
    <div className="flex flex-col h-full" data-testid="image-viewer">
      <div className="flex items-center justify-center gap-2 p-2 border-b bg-muted/20">
        <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} data-testid="button-img-zoom-out">
          <ZoomOut className="w-4 h-4" />
        </Button>
        <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
        <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(5.0, z + 0.25))} data-testid="button-img-zoom-in">
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => setZoom(1)} data-testid="button-img-fit">
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-muted/10 relative">
        {loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 z-10">
            <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Loading image...</span>
          </div>
        )}
        {error ? (
          <div className="flex flex-col items-center gap-2">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-destructive">Failed to load image</p>
          </div>
        ) : (
          <img
            src={url}
            alt={alt}
            data-testid="inline-image"
            className="transition-transform duration-200"
            style={{ transform: `scale(${zoom})`, transformOrigin: "center center", maxWidth: zoom === 1 ? "100%" : "none" }}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
      </div>
    </div>
  );
}

function DocxViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch document");
        const arrayBuffer = await response.arrayBuffer();
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (!cancelled) {
          setHtml(result.value);
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Failed to render document");
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Rendering DOCX...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-6 overflow-auto h-full bg-white dark:bg-card" data-testid="docx-viewer">
      <div
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html || "" }}
      />
    </div>
  );
}

function TextInlineViewer({ url, fileName }: { url: string; fileName: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error("Failed to fetch");
        return r.text();
      })
      .then(text => { if (!cancelled) { setContent(text); setLoading(false); } })
      .catch(() => { if (!cancelled) { setError(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full gap-2">
        <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading file...</span>
      </div>
    );
  }

  if (error || content === null) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-4">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-sm text-destructive">Failed to load file</p>
      </div>
    );
  }

  if (ext === "csv") {
    const rows = content.split("\n").filter(r => r.trim()).map(r => r.split(","));
    return (
      <div className="overflow-auto h-full p-4" data-testid="csv-viewer">
        <Table>
          <TableHeader>
            <TableRow>
              {rows[0]?.map((cell, i) => <TableHead key={i}>{cell.trim()}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(1).map((row, ri) => (
              <TableRow key={ri}>
                {row.map((cell, ci) => <TableCell key={ci}>{cell.trim()}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (ext === "json") {
    let formatted = content;
    try { formatted = JSON.stringify(JSON.parse(content), null, 2); } catch {}
    return (
      <ScrollArea className="h-full" data-testid="json-viewer">
        <pre className="p-6 text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">{formatted}</pre>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea className="h-full" data-testid="text-viewer">
      <pre className="p-6 text-sm font-mono whitespace-pre-wrap leading-relaxed text-foreground">{content}</pre>
    </ScrollArea>
  );
}

function BinderHtmlRenderer(props: {
  bidId: string;
  latestBinder: BinderVersion;
  folders: JacketFolder[];
  binderPage: number;
  onNavigatePage: (page: number) => void;
  onClose?: () => void;
  onViewDocument?: (doc: JacketDocument) => void;
  bidTitle: string;
  noticeId: string;
  agency: string;
  dueAt: string;
}) {
  const { bidId, latestBinder, folders, binderPage, onNavigatePage, onClose, onViewDocument, bidTitle, noticeId, agency, dueAt } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollMode, setScrollMode] = useState(false);

  const sortedFolders = useMemo(() => {
    return [...(folders || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [folders]);

  const folderByName = useMemo(() => {
    const m = new Map<string, JacketFolder>();
    for (const f of sortedFolders) {
      m.set(f.name, f);
      const match = f.name.match(/^\d{2}\s*-\s*(.+)$/);
      if (match) m.set(match[1].trim(), f);
    }
    return m;
  }, [sortedFolders]);

  const sectionsList = latestBinder.pageMapJson?.sections || [];

  type BinderPage = { type: "cover" | "toc" | "section-divider" | "document"; pageNum: number; sectionCode?: string; sectionName?: string; doc?: JacketDocument; folder?: JacketFolder };

  const pages = useMemo(() => {
    const result: BinderPage[] = [];
    let pageNum = 1;

    result.push({ type: "cover", pageNum: pageNum++ });
    result.push({ type: "toc", pageNum: pageNum++ });

    if (sectionsList.length > 0) {
      for (const section of sectionsList) {
        result.push({ type: "section-divider", pageNum: pageNum++, sectionCode: section.sectionCode, sectionName: section.sectionName });
        const folder = folderByName.get(section.sectionName);
        if (folder && folder.documents) {
          for (const doc of folder.documents) {
            result.push({ type: "document", pageNum: pageNum++, doc, folder, sectionCode: section.sectionCode, sectionName: section.sectionName });
          }
        }
      }
    } else {
      for (const folder of sortedFolders) {
        if (!folder.documents?.length) continue;
        result.push({ type: "section-divider", pageNum: pageNum++, sectionCode: String(folder.sortOrder).padStart(2, "0"), sectionName: folder.name });
        for (const doc of folder.documents) {
          result.push({ type: "document", pageNum: pageNum++, doc, folder, sectionCode: String(folder.sortOrder).padStart(2, "0"), sectionName: folder.name });
        }
      }
    }
    return result;
  }, [sectionsList, folderByName, sortedFolders]);

  const totalPages = pages.length;
  const clampedPage = Math.max(1, Math.min(binderPage, totalPages));
  const currentPage = pages.find(p => p.pageNum === clampedPage) || pages[0];

  const overallCompleteness = useMemo(() => {
    const sectionEntries = sectionsList.length > 0
      ? sectionsList.map(s => ({ code: s.sectionCode, docs: folderByName.get(s.sectionName)?.documents || [] }))
      : sortedFolders.filter(f => f.documents?.length).map(f => ({ code: String(f.sortOrder).padStart(2, "0"), docs: f.documents || [] }));
    if (sectionEntries.length === 0) return 0;
    const total = sectionEntries.reduce((sum, s) => sum + getSectionCompleteness(s.code, s.docs).score, 0);
    return Math.round(total / sectionEntries.length);
  }, [sectionsList, folderByName, sortedFolders]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (scrollMode) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        onNavigatePage(Math.max(1, binderPage - 1));
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        onNavigatePage(Math.min(totalPages, binderPage + 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        onNavigatePage(1);
      } else if (e.key === "End") {
        e.preventDefault();
        onNavigatePage(totalPages);
      } else if (e.key === "Escape" && onClose) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [scrollMode, binderPage, totalPages, onNavigatePage, onClose]);

  const renderPage = (page: BinderPage) => {
    if (!page) return null;

    if (page.type === "cover") {
      const completenessColor = overallCompleteness >= 80 ? "text-green-600 dark:text-green-400" : overallCompleteness >= 50 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
      return (
        <div className="w-[612px] h-[792px] bg-white dark:bg-card flex flex-col items-center justify-center p-12 text-center" data-testid="binder-cover-page">
          <div className="border-b-4 border-primary pb-6 mb-6 w-full">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground mb-2">BlackHawk Construction</p>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">BID PACKAGE</h1>
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-6">{bidTitle}</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm text-left w-full max-w-sm mb-6">
            {noticeId && <><span className="text-muted-foreground text-right">Notice ID:</span><span className="font-medium">{noticeId}</span></>}
            {agency && <><span className="text-muted-foreground text-right">Agency:</span><span className="font-medium">{agency}</span></>}
            {dueAt && <><span className="text-muted-foreground text-right">Due Date:</span><span className="font-medium">{new Date(dueAt).toLocaleDateString()}</span></>}
            <span className="text-muted-foreground text-right">Sections:</span><span className="font-medium">{(sectionsList.length || sortedFolders.filter(f => f.documents?.length).length)} sections</span>
            <span className="text-muted-foreground text-right">Total Pages:</span><span className="font-medium">{totalPages}</span>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${overallCompleteness >= 80 ? "bg-green-500" : overallCompleteness >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${overallCompleteness}%` }} />
            </div>
            <span className={`text-sm font-bold ${completenessColor}`} data-testid="text-completeness-score">{overallCompleteness}% Complete</span>
          </div>
          <div className="mt-auto pt-6 border-t w-full flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Version {latestBinder.version}</p>
            <p className="text-xs text-muted-foreground">{latestBinder.generatedAt ? new Date(latestBinder.generatedAt).toLocaleString() : "N/A"}</p>
          </div>
        </div>
      );
    }

    if (page.type === "toc") {
      const tocSections = sectionsList.length > 0
        ? sectionsList.map(s => ({ code: s.sectionCode, name: s.sectionName, docs: folderByName.get(s.sectionName)?.documents || [] }))
        : sortedFolders.filter(f => f.documents?.length).map(f => ({ code: String(f.sortOrder).padStart(2, "0"), name: f.name, docs: f.documents || [] }));

      return (
        <div className="w-[612px] h-[792px] bg-white dark:bg-card p-10 overflow-auto" data-testid="binder-toc-page">
          <h2 className="text-2xl font-bold border-b-2 border-primary pb-3 mb-4">TABLE OF CONTENTS</h2>
          <div className="space-y-1">
            {tocSections.map((s, i) => {
              const sectionPage = pages.find(p => p.type === "section-divider" && p.sectionCode === s.code);
              const completeness = getSectionCompleteness(s.code, s.docs);
              return (
                <div key={i} className="flex items-center gap-2 cursor-pointer hover-elevate rounded px-2 py-1.5" onClick={() => sectionPage && onNavigatePage(sectionPage.pageNum)} data-testid={`toc-entry-${s.code}`}>
                  {completeness.status === "complete" && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
                  {completeness.status === "partial" && <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />}
                  {completeness.status === "missing" && <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                  {completeness.status === "empty" && <CircleDot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="font-mono text-xs font-bold text-primary min-w-[2.5rem]">{s.code}</span>
                  <span className="text-sm font-medium flex-1 truncate">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.docs.length} doc{s.docs.length !== 1 ? "s" : ""}</span>
                  <Badge variant={completeness.status === "complete" ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">{completeness.score}%</Badge>
                  <span className="text-xs text-muted-foreground font-mono w-6 text-right">p{sectionPage?.pageNum || "?"}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Overall Completeness</span>
            <div className="flex items-center gap-2">
              <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${overallCompleteness >= 80 ? "bg-green-500" : overallCompleteness >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${overallCompleteness}%` }} />
              </div>
              <span className="text-xs font-bold">{overallCompleteness}%</span>
            </div>
          </div>
        </div>
      );
    }

    if (page.type === "section-divider") {
      const folder = folderByName.get(page.sectionName || "");
      const docs = folder?.documents || [];
      const completeness = getSectionCompleteness(page.sectionCode || "00", docs);
      const code = (page.sectionCode || "00").replace(/[^0-9]/g, "").slice(0, 2);
      const required = SECTION_REQUIREMENTS[code] || [];

      return (
        <div className="w-[612px] h-[792px] bg-white dark:bg-card flex flex-col p-10" data-testid={`binder-section-${page.sectionCode}`}>
          <div className="text-center mb-6">
            <p className="text-xs font-mono text-primary tracking-widest mb-2">SECTION {page.sectionCode}</p>
            <h2 className="text-2xl font-bold">{page.sectionName}</h2>
            <div className="h-1 w-20 bg-primary mx-auto mt-3" />
          </div>
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${completeness.status === "complete" ? "bg-green-500" : completeness.status === "partial" ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${completeness.score}%` }} />
            </div>
            <span className={`text-sm font-bold ${completeness.status === "complete" ? "text-green-600 dark:text-green-400" : completeness.status === "partial" ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>{completeness.score}% Complete</span>
          </div>
          {required.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Requirements Checklist</p>
              <div className="space-y-1">
                {required.map((req, i) => {
                  const met = docs.some(d => {
                    const title = (d.title || d.fileName || "").toLowerCase();
                    return req.toLowerCase().split(" ").some(word => word.length > 3 && title.includes(word));
                  });
                  return (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      {met ? <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" /> : <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                      <span className={met ? "text-foreground" : "text-muted-foreground"}>{req}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Documents ({docs.length})</p>
            <div className="space-y-1">
              {docs.slice(0, 8).map((doc, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  <FileText className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{doc.title || doc.fileName}</span>
                  <Badge variant={doc.status === "approved" || doc.status === "final" ? "default" : "secondary"} className="text-[9px] px-1 py-0">{doc.status}</Badge>
                  <span className="text-muted-foreground">{formatBytesCompact(doc.fileSizeBytes)}</span>
                </div>
              ))}
              {docs.length > 8 && <p className="text-xs text-muted-foreground italic pl-5">+{docs.length - 8} more</p>}
            </div>
          </div>
          <div className="border-t pt-2 text-xs text-muted-foreground text-center">
            Section {page.sectionCode} &mdash; {bidTitle}
          </div>
        </div>
      );
    }

    if (page.type === "document" && page.doc) {
      const doc = page.doc;
      const downloadUrl = `/api/documents/${doc.id}/download`;
      const evidenceMatches = getEvidenceMap(page.sectionCode || "00", doc);
      return (
        <div className="w-[612px] h-[792px] bg-white dark:bg-card p-8 flex flex-col" data-testid={`binder-doc-${doc.id}`}>
          <div className="flex items-center justify-between gap-2 border-b pb-2 mb-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-primary">{page.sectionCode}</span>
              <span className="text-xs text-muted-foreground">{page.sectionName}</span>
            </div>
            <span className="text-xs text-muted-foreground">Page {page.pageNum} of {totalPages}</span>
          </div>
          <div className="flex-1 flex flex-col items-center gap-3">
            <FileText className="w-14 h-14 text-primary/30" />
            <h3 className="text-lg font-semibold text-center leading-tight">{doc.title || doc.fileName}</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm mt-2">
              <span className="text-muted-foreground text-right">File:</span>
              <span className="font-medium truncate max-w-[200px]">{doc.fileName}</span>
              <span className="text-muted-foreground text-right">Type:</span>
              <span className="font-medium">{doc.fileType?.toUpperCase() || "—"}</span>
              <span className="text-muted-foreground text-right">Size:</span>
              <span className="font-medium">{formatBytesCompact(doc.fileSizeBytes)}</span>
              <span className="text-muted-foreground text-right">Version:</span>
              <span className="font-medium">v{doc.version}</span>
              <span className="text-muted-foreground text-right">Status:</span>
              <Badge variant={doc.status === "approved" || doc.status === "final" ? "default" : "secondary"} className="w-fit">{doc.status}</Badge>
            </div>
            {evidenceMatches.length > 0 && (
              <div className="w-full max-w-sm mt-3 p-3 bg-muted/50 rounded-lg" data-testid={`evidence-map-${doc.id}`}>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  Evidence Map
                </p>
                <div className="space-y-1">
                  {evidenceMatches.map((req, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0" />
                      <span>Satisfies: <span className="font-medium">{req}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3 mt-4 flex-wrap">
              <Button variant="outline" onClick={() => onViewDocument?.(doc)} data-testid={`button-view-doc-${doc.id}`}>
                <Eye className="w-4 h-4 mr-2" />
                View Inline
              </Button>
              <Button variant="outline" asChild data-testid={`button-download-doc-${doc.id}`}>
                <a href={downloadUrl} download={doc.fileName}>
                  <Download className="w-4 h-4 mr-2" />
                  Download
                </a>
              </Button>
            </div>
          </div>
          <div className="border-t pt-2 mt-auto text-xs text-muted-foreground text-center">
            {doc.title || doc.fileName} &mdash; {bidTitle}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4 w-full h-full overflow-auto" ref={containerRef} id="binder-print-area" data-testid="binder-html-renderer" tabIndex={0}>
      <div className="flex items-center gap-3 mb-2 no-print flex-wrap">
        {!scrollMode && (
          <>
            <Button variant="outline" size="sm" disabled={clampedPage <= 1} onClick={() => onNavigatePage(clampedPage - 1)} data-testid="button-binder-prev">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-medium" data-testid="text-binder-page-info">Page {clampedPage} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={clampedPage >= totalPages} onClick={() => onNavigatePage(clampedPage + 1)} data-testid="button-binder-next">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </>
        )}
        <Button variant={scrollMode ? "default" : "outline"} size="sm" onClick={() => setScrollMode(!scrollMode)} data-testid="button-scroll-mode">
          <Layers className="w-4 h-4 mr-1" />
          {scrollMode ? "Single Page" : "Scroll All"}
        </Button>
      </div>
      {scrollMode ? (
        <div className="space-y-6">
          {pages.map((page) => (
            <div
              key={page.pageNum}
              id={page.type === "section-divider" ? `binder-section-${page.sectionCode}` : page.type === "cover" ? "binder-section-cover" : page.type === "toc" ? "binder-section-toc" : undefined}
              className="shadow-xl rounded-lg overflow-hidden border"
              data-testid={`binder-scroll-page-${page.pageNum}`}
            >
              {renderPage(page)}
            </div>
          ))}
        </div>
      ) : (
        <div className="shadow-xl rounded-lg overflow-hidden border">
          {renderPage(currentPage)}
        </div>
      )}
    </div>
  );
}
