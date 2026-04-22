import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { DocumentViewer } from "@/components/document-viewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Image, File, AlertCircle, CheckCircle } from "lucide-react";

interface DebugInfo {
  docId?: string;
  resolvedSource: string | null;
  contentType: string | null;
  size: number | null;
  supported: boolean;
  viewerCompatible: boolean;
  error: string | null;
  documentTitle?: string;
  documentType?: string;
}

export default function ViewerDemo() {
  const [, setLocation] = useLocation();
  const [docId, setDocId] = useState<string>("");
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("docId");
    if (id) {
      setDocId(id);
      setActiveDocId(id);
      setShowViewer(true);
    }
  }, []);

  const { data: debugInfo, isLoading: debugLoading, refetch: refetchDebug } = useQuery<DebugInfo>({
    queryKey: ["/api/debug/viewer", activeDocId],
    queryFn: async () => {
      if (!activeDocId) return null;
      const res = await fetch(`/api/debug/viewer?docId=${activeDocId}`);
      return res.json();
    },
    enabled: !!activeDocId,
  });

  const { data: documents } = useQuery<any[]>({
    queryKey: ["/api/knowledge/documents"],
  });

  const handleLoadDocument = () => {
    if (docId) {
      setActiveDocId(docId);
      setShowViewer(true);
      refetchDebug();
    }
  };

  const handleSelectDocument = (id: string) => {
    setDocId(id);
    setActiveDocId(id);
    setShowViewer(true);
    refetchDebug();
  };

  const fileUrl = activeDocId ? `/api/knowledge/documents/${activeDocId}/file` : "";

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" onClick={() => setLocation("/")} data-testid="button-back-home">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <h1 className="text-2xl font-bold">Document Viewer Test Demo</h1>
          <Badge variant="outline">E2E Testing Page</Badge>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Load Document by ID</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter document ID..."
                    value={docId}
                    onChange={(e) => setDocId(e.target.value)}
                    data-testid="input-doc-id"
                  />
                  <Button onClick={handleLoadDocument} data-testid="button-load-doc">
                    Load
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Debug Info</CardTitle>
              </CardHeader>
              <CardContent>
                {debugLoading && <p className="text-muted-foreground">Loading...</p>}
                {debugInfo && (
                  <div className="space-y-2 text-sm" data-testid="debug-info">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Document ID:</span>
                      <span className="font-mono">{debugInfo.docId || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Title:</span>
                      <span className="truncate max-w-[200px]">{debugInfo.documentTitle || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type:</span>
                      <span>{debugInfo.documentType || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Content-Type:</span>
                      <span className="font-mono text-xs">{debugInfo.contentType || "N/A"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Size:</span>
                      <span>{debugInfo.size ? `${(debugInfo.size / 1024).toFixed(1)} KB` : "N/A"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Supported:</span>
                      {debugInfo.supported ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" /> Yes
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" /> No
                        </Badge>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Viewer Compatible:</span>
                      {debugInfo.viewerCompatible ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" /> Yes
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <AlertCircle className="h-3 w-3" /> No
                        </Badge>
                      )}
                    </div>
                    {debugInfo.error && (
                      <div className="p-2 bg-destructive/10 rounded text-destructive text-xs">
                        Error: {debugInfo.error}
                      </div>
                    )}
                    <div className="pt-2 border-t">
                      <span className="text-muted-foreground text-xs">Source URL:</span>
                      <p className="font-mono text-xs break-all">{debugInfo.resolvedSource || "N/A"}</p>
                    </div>
                  </div>
                )}
                {!debugInfo && !debugLoading && (
                  <p className="text-muted-foreground text-sm">Load a document to see debug info</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Available Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="max-h-[300px] overflow-y-auto space-y-1">
                  {documents?.slice(0, 20).map((doc: any) => (
                    <button
                      key={doc.id}
                      onClick={() => handleSelectDocument(doc.id)}
                      className={`w-full text-left p-2 rounded text-sm hover:bg-muted transition-colors flex items-center gap-2 ${
                        activeDocId === doc.id ? "bg-primary/10 border border-primary" : ""
                      }`}
                      data-testid={`button-select-doc-${doc.id}`}
                    >
                      {doc.documentType?.includes("pdf") ? (
                        <FileText className="h-4 w-4 text-red-500" />
                      ) : doc.documentType?.includes("image") || doc.documentType?.includes("jpg") || doc.documentType?.includes("png") ? (
                        <Image className="h-4 w-4 text-blue-500" />
                      ) : (
                        <File className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="truncate">{doc.title}</span>
                    </button>
                  ))}
                  {(!documents || documents.length === 0) && (
                    <p className="text-muted-foreground text-sm">No documents found</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card className="h-[700px]">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center justify-between">
                  <span>Document Viewer Preview</span>
                  {showViewer && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowViewer(false)}
                      data-testid="button-close-preview"
                    >
                      Close Preview
                    </Button>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-60px)]">
                {showViewer && activeDocId ? (
                  <div className="h-full border rounded overflow-hidden" data-testid="viewer-container">
                    <DocumentViewer
                      url={fileUrl}
                      fileName={debugInfo?.documentTitle || "Document"}
                      fileType={debugInfo?.documentType || undefined}
                      onClose={() => setShowViewer(false)}
                    />
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-muted-foreground" data-testid="viewer-placeholder">
                    <div className="text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p>Select a document to preview</p>
                      <p className="text-sm mt-2">Use the list on the left or enter a document ID</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Test Scenarios</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
              <div className="p-3 border rounded" data-testid="test-scenario-pdf">
                <h4 className="font-medium mb-2">PDF Test</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Multi-page navigation</li>
                  <li>• Thumbnails sidebar</li>
                  <li>• Zoom in/out</li>
                  <li>• Keyboard shortcuts</li>
                </ul>
              </div>
              <div className="p-3 border rounded" data-testid="test-scenario-image">
                <h4 className="font-medium mb-2">Image Test</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• JPG, PNG, WebP, GIF</li>
                  <li>• Zoom and rotate</li>
                  <li>• Fullscreen mode</li>
                  <li>• Download button</li>
                </ul>
              </div>
              <div className="p-3 border rounded" data-testid="test-scenario-unsupported">
                <h4 className="font-medium mb-2">Unsupported Files</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• DOCX, XLSX, DWG, ZIP</li>
                  <li>• Shows clear message</li>
                  <li>• Download button</li>
                  <li>• Open in Egnyte link</li>
                </ul>
              </div>
              <div className="p-3 border rounded" data-testid="test-scenario-error">
                <h4 className="font-medium mb-2">Error Handling</h4>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• Missing file → error UI</li>
                  <li>• Retry button</li>
                  <li>• Download fallback</li>
                  <li>• No white screens</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
