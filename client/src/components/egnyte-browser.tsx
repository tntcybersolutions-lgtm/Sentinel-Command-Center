import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FolderOpen, File, ChevronRight, ArrowLeft, Download, Loader2, Link2 } from "lucide-react";

interface EgnyteFile {
  path: string;
  name: string;
  is_folder: boolean;
  size?: number;
  last_modified?: string;
}

interface EgnyteFolderListing {
  path: string;
  name: string;
  folder_id?: string;
  is_folder: boolean;
  files?: EgnyteFile[];
  folders?: EgnyteFile[];
}

interface EgnyteStatus {
  configured: boolean;
  connected: boolean;
  domain?: string;
}

interface EgnyteBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

export function EgnyteBrowser({ open, onOpenChange, onImportComplete }: EgnyteBrowserProps) {
  const { toast } = useToast();
  const [currentPath, setCurrentPath] = useState("/Shared");
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [pathHistory, setPathHistory] = useState<string[]>(["/Shared"]);

  const { data: status } = useQuery<EgnyteStatus>({
    queryKey: ["/api/egnyte/status"],
  });

  const { data: folderContents, isLoading } = useQuery<EgnyteFolderListing>({
    queryKey: ["/api/egnyte/files", currentPath],
    queryFn: async () => {
      const response = await fetch(`/api/egnyte/files?path=${encodeURIComponent(currentPath)}`);
      if (!response.ok) throw new Error("Failed to load folder");
      return response.json();
    },
    enabled: open && status?.connected === true,
  });

  const importMutation = useMutation({
    mutationFn: async (files: { path: string; name: string }[]) => {
      const results = [];
      for (const file of files) {
        const result = await apiRequest("POST", "/api/egnyte/import", file);
        results.push(result);
      }
      return results;
    },
    onSuccess: (data) => {
      toast({ 
        title: "Import Complete", 
        description: `Successfully imported ${data.length} file(s) to Knowledge Vault` 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/stats"] });
      setSelectedFiles(new Set());
      onImportComplete?.();
    },
    onError: (error: Error) => {
      toast({ 
        title: "Import Failed", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });

  const handleFolderClick = (folder: EgnyteFile) => {
    setPathHistory([...pathHistory, folder.path]);
    setCurrentPath(folder.path);
  };

  const handleGoBack = () => {
    if (pathHistory.length > 1) {
      const newHistory = [...pathHistory];
      newHistory.pop();
      setPathHistory(newHistory);
      setCurrentPath(newHistory[newHistory.length - 1]);
    }
  };

  const toggleFileSelection = (path: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(path)) {
      newSelection.delete(path);
    } else {
      newSelection.add(path);
    }
    setSelectedFiles(newSelection);
  };

  const handleImportSelected = () => {
    const files = Array.from(selectedFiles).map(path => {
      const name = path.split("/").pop() || path;
      return { path, name };
    });
    importMutation.mutate(files);
  };

  const handleConnectEgnyte = () => {
    window.location.href = "/api/egnyte/authorize";
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const allFiles = folderContents?.files || [];
  const allFolders = folderContents?.folders || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-green-600" />
            Egnyte File Browser
          </DialogTitle>
          <DialogDescription>
            Browse and import files from Egnyte to the Knowledge Vault
          </DialogDescription>
        </DialogHeader>

        {!status?.connected ? (
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <FolderOpen className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Connect to Egnyte to browse files</p>
            <Button onClick={handleConnectEgnyte} data-testid="button-connect-egnyte-dialog">
              <Link2 className="h-4 w-4 mr-2" />
              Connect Egnyte
            </Button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 pb-2 border-b">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleGoBack}
                disabled={pathHistory.length <= 1}
                data-testid="button-egnyte-back"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-1 text-sm text-muted-foreground overflow-hidden">
                {currentPath.split("/").filter(Boolean).map((segment, i, arr) => (
                  <span key={i} className="flex items-center">
                    {i > 0 && <ChevronRight className="h-3 w-3 mx-1" />}
                    <span className={i === arr.length - 1 ? "font-medium text-foreground" : ""}>
                      {segment}
                    </span>
                  </span>
                ))}
              </div>
            </div>

            <ScrollArea className="h-[400px]">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-1">
                  {allFolders.map((folder) => (
                    <div 
                      key={folder.path}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate cursor-pointer"
                      onClick={() => handleFolderClick(folder)}
                      data-testid={`folder-${folder.name}`}
                    >
                      <FolderOpen className="h-5 w-5 text-amber-500" />
                      <span className="flex-1 font-medium">{folder.name}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  ))}
                  
                  {allFiles.map((file) => (
                    <div 
                      key={file.path}
                      className="flex items-center gap-3 p-2 rounded-md hover-elevate"
                      data-testid={`file-${file.name}`}
                    >
                      <Checkbox 
                        checked={selectedFiles.has(file.path)}
                        onCheckedChange={() => toggleFileSelection(file.path)}
                        data-testid={`checkbox-${file.name}`}
                      />
                      <File className="h-5 w-5 text-blue-500" />
                      <span className="flex-1">{file.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {formatFileSize(file.size)}
                      </Badge>
                    </div>
                  ))}

                  {allFolders.length === 0 && allFiles.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      This folder is empty
                    </div>
                  )}
                </div>
              )}
            </ScrollArea>

            <DialogFooter className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                {selectedFiles.size} file(s) selected
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleImportSelected}
                  disabled={selectedFiles.size === 0 || importMutation.isPending}
                  data-testid="button-import-from-egnyte"
                >
                  {importMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Import Selected
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
