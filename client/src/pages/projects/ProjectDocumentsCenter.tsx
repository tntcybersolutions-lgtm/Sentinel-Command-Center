import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
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
  FolderOpen,
  FolderPlus,
  FilePlus,
  FileText,
  FileImage,
  File,
  Link2,
  ChevronRight,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

type Folder = {
  id: string;
  name: string;
  parentFolderId: string | null;
  sortOrder: number;
};

type DocEntry = {
  id: string;
  title: string;
  folderId: string | null;
  sourceType: string;
  sourceUrl: string | null;
  fileName: string | null;
  mimeType: string | null;
  linkedEntityType: string | null;
  linkedEntityId: string | null;
  createdAt: string;
};

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function getFileIcon(mimeType: string | null, sourceType: string) {
  if (sourceType === "link") return Link2;
  if (mimeType?.startsWith("image/")) return FileImage;
  if (mimeType?.includes("pdf")) return FileText;
  return File;
}

function FolderTree({
  folders,
  selectedFolderId,
  onSelect,
  expandedIds,
  onToggle,
}: {
  folders: Folder[];
  selectedFolderId: string | null;
  onSelect: (id: string | null) => void;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  function renderLevel(parentId: string | null, depth: number) {
    const children = folders
      .filter((f) => f.parentFolderId === parentId)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    if (children.length === 0) return null;

    return (
      <div>
        {children.map((folder) => {
          const hasChildren = folders.some((f) => f.parentFolderId === folder.id);
          const isExpanded = expandedIds.has(folder.id);
          const isSelected = selectedFolderId === folder.id;

          return (
            <div key={folder.id}>
              <button
                className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md hover:bg-muted/60 transition-colors ${
                  isSelected ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                }`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => onSelect(folder.id)}
                data-testid={`folder-${folder.id}`}
              >
                {hasChildren ? (
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(folder.id);
                    }}
                    className="cursor-pointer"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                ) : (
                  <span className="w-3.5" />
                )}
                <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="truncate">{folder.name}</span>
              </button>
              {hasChildren && isExpanded && renderLevel(folder.id, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <button
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md hover:bg-muted/60 transition-colors ${
          selectedFolderId === null ? "bg-primary/10 text-primary font-medium" : "text-foreground"
        }`}
        onClick={() => onSelect(null)}
        data-testid="folder-all"
      >
        <FolderOpen className="h-4 w-4 text-amber-500" />
        <span>All Documents</span>
      </button>
      {renderLevel(null, 1)}
    </div>
  );
}

export default function ProjectDocumentsCenter() {
  const params = useParams() as { projectId: string };
  const { projectId } = params;

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<Set<string>>(new Set());
  const [selectedDoc, setSelectedDoc] = useState<DocEntry | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showNewDoc, setShowNewDoc] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [newDocTitle, setNewDocTitle] = useState("");
  const [newDocSourceType, setNewDocSourceType] = useState("link");
  const [newDocSourceUrl, setNewDocSourceUrl] = useState("");
  const [newDocEntityType, setNewDocEntityType] = useState("");
  const [newDocEntityId, setNewDocEntityId] = useState("");

  const foldersQ = useQuery<Folder[]>({
    queryKey: ["/api/projects", projectId, "doc-folders"],
    queryFn: () => fetchJson(`/api/projects/${projectId}/doc-folders`),
  });

  const docsQ = useQuery<DocEntry[]>({
    queryKey: ["/api/projects", projectId, "project-documents", selectedFolderId],
    queryFn: () => {
      const url = selectedFolderId
        ? `/api/projects/${projectId}/project-documents?folderId=${selectedFolderId}`
        : `/api/projects/${projectId}/project-documents`;
      return fetchJson(url);
    },
  });

  const seedMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/documents/seed-default-folders`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "doc-folders"] });
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/doc-folders`, {
        name: newFolderName.trim(),
        parentFolderId: selectedFolderId,
      }),
    onSuccess: () => {
      setShowNewFolder(false);
      setNewFolderName("");
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "doc-folders"] });
    },
  });

  const createDocMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/projects/${projectId}/project-documents`, {
        folderId: selectedFolderId,
        title: newDocTitle.trim(),
        sourceType: newDocSourceType,
        sourceUrl: newDocSourceUrl || null,
        linkedEntityType: newDocEntityType || null,
        linkedEntityId: newDocEntityId || null,
      }),
    onSuccess: () => {
      setShowNewDoc(false);
      setNewDocTitle("");
      setNewDocSourceUrl("");
      setNewDocEntityType("");
      setNewDocEntityId("");
      queryClient.invalidateQueries({
        queryKey: ["/api/projects", projectId, "project-documents"],
      });
    },
  });

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolderIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolderIds(next);
  };

  const folders = foldersQ.data ?? [];
  const docs = docsQ.data ?? [];
  const selectedFolderName =
    selectedFolderId === null
      ? "All Documents"
      : folders.find((f) => f.id === selectedFolderId)?.name ?? "Folder";

  return (
    <div className="flex h-[calc(100vh-180px)] gap-0 border rounded-lg overflow-hidden bg-background" data-testid="documents-center">
      {/* Left: Folder tree */}
      <div className="w-64 shrink-0 border-r bg-muted/20 flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <span className="text-sm font-semibold">Folders</span>
          <div className="flex gap-1">
            {folders.length === 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
                data-testid="button-seed-folders"
                title="Create default folders"
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowNewFolder(true)}
              data-testid="button-new-folder"
              title="New folder"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {foldersQ.isLoading ? (
            <div className="space-y-2 p-2">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-6 w-full" />
            </div>
          ) : (
            <FolderTree
              folders={folders}
              selectedFolderId={selectedFolderId}
              onSelect={(id) => {
                setSelectedFolderId(id);
                setSelectedDoc(null);
              }}
              expandedIds={expandedFolderIds}
              onToggle={toggleFolder}
            />
          )}
        </div>
      </div>

      {/* Middle: File list */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="p-3 border-b flex items-center justify-between">
          <div>
            <span className="text-sm font-semibold">{selectedFolderName}</span>
            <span className="text-xs text-muted-foreground ml-2">
              {docs.length} file{docs.length !== 1 ? "s" : ""}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNewDoc(true)}
            data-testid="button-add-document"
          >
            <FilePlus className="h-4 w-4 mr-1" />
            Add Document
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {docsQ.isLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : docs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p className="font-medium">No documents</p>
              <p className="text-sm">Add a document or link to get started.</p>
            </div>
          ) : (
            <div>
              {docs.map((doc) => {
                const Icon = getFileIcon(doc.mimeType, doc.sourceType);
                const isSelected = selectedDoc?.id === doc.id;
                return (
                  <button
                    key={doc.id}
                    className={`w-full flex items-center gap-3 px-4 py-3 border-b text-left hover:bg-muted/40 transition-colors ${
                      isSelected ? "bg-primary/5" : ""
                    }`}
                    onClick={() => setSelectedDoc(doc)}
                    data-testid={`doc-row-${doc.id}`}
                  >
                    <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{doc.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.sourceType} · {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {doc.linkedEntityType && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {doc.linkedEntityType}
                      </Badge>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Preview/Details */}
      <div className="w-72 shrink-0 border-l bg-muted/10 flex flex-col">
        <div className="p-3 border-b">
          <span className="text-sm font-semibold">Details</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {selectedDoc ? (
            <div className="space-y-4" data-testid="doc-details">
              <div>
                <p className="text-xs text-muted-foreground">Title</p>
                <p className="text-sm font-medium" data-testid="doc-detail-title">{selectedDoc.title}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Source Type</p>
                <Badge variant="outline" className="capitalize">{selectedDoc.sourceType}</Badge>
              </div>
              {selectedDoc.sourceUrl && (
                <div>
                  <p className="text-xs text-muted-foreground">Source URL</p>
                  <a
                    href={selectedDoc.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                    data-testid="doc-detail-url"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
              {selectedDoc.fileName && (
                <div>
                  <p className="text-xs text-muted-foreground">File Name</p>
                  <p className="text-sm">{selectedDoc.fileName}</p>
                </div>
              )}
              {selectedDoc.mimeType && (
                <div>
                  <p className="text-xs text-muted-foreground">MIME Type</p>
                  <p className="text-sm">{selectedDoc.mimeType}</p>
                </div>
              )}
              {selectedDoc.linkedEntityType && (
                <div>
                  <p className="text-xs text-muted-foreground">Linked To</p>
                  <p className="text-sm capitalize">
                    {selectedDoc.linkedEntityType}
                    {selectedDoc.linkedEntityId && `: ${selectedDoc.linkedEntityId.slice(0, 8)}…`}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Created</p>
                <p className="text-sm">{new Date(selectedDoc.createdAt).toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div className="text-center text-muted-foreground pt-8">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Select a document to see details</p>
            </div>
          )}
        </div>
      </div>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolder} onOpenChange={setShowNewFolder}>
        <DialogContent data-testid="dialog-new-folder">
          <DialogHeader>
            <DialogTitle>New Folder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              data-testid="input-folder-name"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newFolderName.trim())
                  createFolderMutation.mutate();
              }}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewFolder(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createFolderMutation.mutate()}
                disabled={createFolderMutation.isPending || !newFolderName.trim()}
                data-testid="button-create-folder"
              >
                {createFolderMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Document Dialog */}
      <Dialog open={showNewDoc} onOpenChange={setShowNewDoc}>
        <DialogContent data-testid="dialog-new-document">
          <DialogHeader>
            <DialogTitle>Add Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Title</label>
              <Input
                value={newDocTitle}
                onChange={(e) => setNewDocTitle(e.target.value)}
                placeholder="Document title"
                data-testid="input-doc-title"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Source Type</label>
              <Select value={newDocSourceType} onValueChange={setNewDocSourceType}>
                <SelectTrigger data-testid="select-source-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">Link</SelectItem>
                  <SelectItem value="upload">Upload</SelectItem>
                  <SelectItem value="generated">Generated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(newDocSourceType === "link" || newDocSourceType === "upload") && (
              <div>
                <label className="text-sm font-medium">
                  {newDocSourceType === "link" ? "URL" : "File URL / Storage Key"}
                </label>
                <Input
                  value={newDocSourceUrl}
                  onChange={(e) => setNewDocSourceUrl(e.target.value)}
                  placeholder={newDocSourceType === "link" ? "https://..." : "storage key or URL"}
                  data-testid="input-doc-url"
                />
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Link to Entity (optional)</label>
              <div className="flex gap-2">
                <Select value={newDocEntityType} onValueChange={setNewDocEntityType}>
                  <SelectTrigger className="w-40" data-testid="select-entity-type">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="rfi">RFI</SelectItem>
                    <SelectItem value="submittal">Submittal</SelectItem>
                    <SelectItem value="change_order">Change Order</SelectItem>
                    <SelectItem value="purchase_order">Purchase Order</SelectItem>
                    <SelectItem value="invoice">Invoice</SelectItem>
                    <SelectItem value="bid_request">Bid Request</SelectItem>
                    <SelectItem value="task">Task</SelectItem>
                  </SelectContent>
                </Select>
                {newDocEntityType && newDocEntityType !== "none" && (
                  <Input
                    value={newDocEntityId}
                    onChange={(e) => setNewDocEntityId(e.target.value)}
                    placeholder="Entity ID"
                    className="flex-1"
                    data-testid="input-entity-id"
                  />
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowNewDoc(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createDocMutation.mutate()}
                disabled={createDocMutation.isPending || !newDocTitle.trim()}
                data-testid="button-create-document"
              >
                {createDocMutation.isPending ? "Creating…" : "Add Document"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
