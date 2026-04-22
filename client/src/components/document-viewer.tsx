import { useState, useCallback, useEffect } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Download,
  Printer,
  RotateCw,
  FileText,
  Image as ImageIcon,
  X,
  Columns,
  PanelLeftClose,
  PanelLeft,
  Search,
  Loader2,
} from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  url: string;
  fileName?: string;
  fileType?: string;
  onClose?: () => void;
}

export function DocumentViewer({ url, fileName, fileType, onClose }: DocumentViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState<number>(1.0);
  const [rotation, setRotation] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showThumbnails, setShowThumbnails] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInputValue, setPageInputValue] = useState<string>("1");
  const [searchText, setSearchText] = useState<string>("");
  const [docxHtml, setDocxHtml] = useState<string>("");
  const [textContent, setTextContent] = useState<string>("");

  const ext = fileType?.toLowerCase() || fileName?.split('.').pop()?.toLowerCase() || "";
  const isPdf = ext === "pdf" || url.toLowerCase().endsWith(".pdf");
  const isImage = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "webp", "svg"].some(
    (e) => ext === e || url.toLowerCase().endsWith(`.${e}`)
  );
  const isDocx = ext === "docx" || url.toLowerCase().endsWith(".docx");
  const isText = ["txt", "csv", "json", "xml", "md", "log", "cfg", "ini", "yaml", "yml"].some(
    (e) => ext === e || url.toLowerCase().endsWith(`.${e}`)
  );
  const isSpreadsheet = ["xlsx", "xls"].some(
    (e) => ext === e || url.toLowerCase().endsWith(`.${e}`)
  );

  // Check if URL returns an error from the API (JSON error response)
  useEffect(() => {
    const checkUrlValidity = async () => {
      try {
        const response = await fetch(url, { method: 'HEAD' });
        const contentType = response.headers.get('content-type');
        
        // If server returns JSON, it might be an error response
        if (contentType?.includes('application/json') && !response.ok) {
          const errorData = await fetch(url).then(r => r.json());
          if (errorData.error) {
            setError(errorData.error);
            setLoading(false);
          }
        }
      } catch (e) {
        // Network errors will be handled by component loaders
      }
    };
    
    checkUrlValidity();
  }, [url]);

  useEffect(() => {
    if (isDocx) {
      setLoading(true);
      fetch(url)
        .then(res => res.arrayBuffer())
        .then(async (buffer) => {
          const mammoth = await import("mammoth");
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          setDocxHtml(result.value);
          setNumPages(1);
          setLoading(false);
        })
        .catch((err) => {
          setError(`Failed to render DOCX: ${err.message}`);
          setLoading(false);
        });
    } else if (isText) {
      setLoading(true);
      fetch(url)
        .then(res => res.text())
        .then((text) => {
          setTextContent(text);
          setNumPages(1);
          setLoading(false);
        })
        .catch((err) => {
          setError(`Failed to load text file: ${err.message}`);
          setLoading(false);
        });
    }
  }, [url, isDocx, isText]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (err: Error) => {
    // Check if the error is a redirect or JSON response
    if (err.message.includes('PDF')) {
      setError("This file cannot be displayed as a PDF. It may be a different format or the file is unavailable.");
    } else {
      setError(`Failed to load document: ${err.message}`);
    }
    setLoading(false);
  };

  const goToPage = useCallback((page: number) => {
    const newPage = Math.max(1, Math.min(page, numPages));
    setCurrentPage(newPage);
    setPageInputValue(String(newPage));
  }, [numPages]);

  const handlePageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInputValue(e.target.value);
  };

  const handlePageInputBlur = () => {
    const page = parseInt(pageInputValue, 10);
    if (!isNaN(page)) {
      goToPage(page);
    } else {
      setPageInputValue(String(currentPage));
    }
  };

  const handlePageInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handlePageInputBlur();
    }
  };

  const zoomIn = () => setScale((s) => Math.min(s + 0.25, 3));
  const zoomOut = () => setScale((s) => Math.max(s - 0.25, 0.5));
  const fitWidth = () => setScale(1.0);
  const fitPage = () => setScale(0.75);
  const rotate = () => setRotation((r) => (r + 90) % 360);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "document";
    link.click();
  };

  const handlePrint = () => {
    const printWindow = window.open(url, "_blank");
    if (printWindow) {
      printWindow.onload = () => printWindow.print();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        goToPage(currentPage - 1);
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goToPage(1);
      } else if (e.key === "End") {
        e.preventDefault();
        goToPage(numPages);
      } else if (e.key === "Escape" && onClose) {
        onClose();
      } else if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        zoomOut();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, numPages, goToPage, onClose]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background" data-testid="document-viewer">
      <div className="flex items-center justify-between gap-2 p-2 border-b bg-muted/30">
        <div className="flex items-center gap-2 min-w-0">
          {isPdf ? (
            <FileText className="h-4 w-4 text-red-500 shrink-0" />
          ) : (
            <ImageIcon className="h-4 w-4 text-blue-500 shrink-0" />
          )}
          <span className="text-sm font-medium truncate" title={fileName}>
            {fileName || "Document"}
          </span>
          {numPages > 0 && (
            <Badge variant="secondary" className="shrink-0">
              {numPages} pages
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowThumbnails(!showThumbnails)}
            title={showThumbnails ? "Hide thumbnails" : "Show thumbnails"}
            data-testid="button-toggle-thumbnails"
          >
            {showThumbnails ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </Button>
          <Separator orientation="vertical" className="h-6" />

          <Button variant="ghost" size="icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} title="Previous page" data-testid="button-prev-page">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-1">
            <Input
              type="text"
              value={pageInputValue}
              onChange={handlePageInputChange}
              onBlur={handlePageInputBlur}
              onKeyDown={handlePageInputKeyDown}
              className="w-12 h-8 text-center text-sm"
              data-testid="input-page-number"
            />
            <span className="text-sm text-muted-foreground">/ {numPages}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages} title="Next page" data-testid="button-next-page">
            <ChevronRight className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button variant="ghost" size="icon" onClick={zoomOut} title="Zoom out" data-testid="button-zoom-out">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <div className="w-24">
            <Slider
              value={[scale * 100]}
              onValueChange={([v]) => setScale(v / 100)}
              min={50}
              max={300}
              step={10}
              className="cursor-pointer"
              data-testid="slider-zoom"
            />
          </div>
          <span className="text-xs text-muted-foreground w-10">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={zoomIn} title="Zoom in" data-testid="button-zoom-in">
            <ZoomIn className="h-4 w-4" />
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button variant="ghost" size="icon" onClick={rotate} title="Rotate" data-testid="button-rotate">
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={toggleFullscreen} title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} data-testid="button-fullscreen">
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Separator orientation="vertical" className="h-6" />

          <Button variant="ghost" size="icon" onClick={handleDownload} title="Download" data-testid="button-download">
            <Download className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handlePrint} title="Print" data-testid="button-print">
            <Printer className="h-4 w-4" />
          </Button>

          {onClose && (
            <>
              <Separator orientation="vertical" className="h-6" />
              <Button variant="ghost" size="icon" onClick={onClose} title="Close" data-testid="button-close-viewer">
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {showThumbnails && isPdf && numPages > 0 && (
          <div className="w-32 border-r bg-muted/20 shrink-0">
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={`w-full p-1 rounded border-2 transition-colors ${
                      pageNum === currentPage
                        ? "border-primary bg-primary/10"
                        : "border-transparent hover:border-muted-foreground/20"
                    }`}
                    data-testid={`button-thumbnail-${pageNum}`}
                  >
                    <Document file={url} loading={null}>
                      <Page
                        pageNumber={pageNum}
                        width={100}
                        renderTextLayer={false}
                        renderAnnotationLayer={false}
                      />
                    </Document>
                    <span className="text-xs text-muted-foreground">{pageNum}</span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <div className="flex-1 overflow-auto bg-muted/10">
          {loading && (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading document...</span>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <FileText className="h-12 w-12 mb-2 text-destructive" />
              <p className="text-destructive font-medium mb-2">{error}</p>
              <p className="text-sm text-muted-foreground mb-4">
                The document file could not be loaded in the viewer.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleDownload} data-testid="button-error-download">
                  <Download className="h-4 w-4 mr-2" />
                  Download Instead
                </Button>
                <Button variant="ghost" onClick={() => { setError(null); setLoading(true); }} data-testid="button-error-retry">
                  Retry
                </Button>
              </div>
            </div>
          )}

          {isPdf && !error && (
            <div className="flex justify-center p-4">
              <Document
                file={url}
                onLoadSuccess={onDocumentLoadSuccess}
                onLoadError={onDocumentLoadError}
                loading={null}
              >
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  rotate={rotation}
                  renderTextLayer={true}
                  renderAnnotationLayer={true}
                  className="shadow-lg"
                />
              </Document>
            </div>
          )}

          {isImage && !error && (
            <div className="flex justify-center items-center h-full p-4">
              <img
                src={url}
                alt={fileName || "Document"}
                style={{
                  transform: `scale(${scale}) rotate(${rotation}deg)`,
                  maxWidth: "100%",
                  maxHeight: "100%",
                  objectFit: "contain",
                }}
                onLoad={() => {
                  setLoading(false);
                  setNumPages(1);
                }}
                onError={() => setError("Failed to load image")}
                className="shadow-lg"
              />
            </div>
          )}

          {isDocx && docxHtml && !error && (
            <div className="flex justify-center p-4" data-testid="docx-viewer">
              <div
                className="bg-white dark:bg-gray-900 shadow-lg p-8 max-w-4xl w-full prose dark:prose-invert prose-sm"
                style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
                dangerouslySetInnerHTML={{ __html: docxHtml }}
              />
            </div>
          )}

          {isText && textContent && !error && (
            <div className="flex justify-center p-4" data-testid="text-viewer">
              <pre
                className="bg-white dark:bg-gray-900 shadow-lg p-6 max-w-5xl w-full text-sm font-mono whitespace-pre-wrap break-words overflow-auto border rounded-md"
                style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
              >
                {textContent}
              </pre>
            </div>
          )}

          {isSpreadsheet && !error && !loading && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground" data-testid="spreadsheet-view">
              <FileText className="h-16 w-16 mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2">Spreadsheet File</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Excel files can be downloaded for viewing in your spreadsheet application.
              </p>
              <Button variant="default" onClick={handleDownload} className="gap-2" data-testid="button-spreadsheet-download">
                <Download className="h-4 w-4" />
                Download {fileName || "Spreadsheet"}
              </Button>
            </div>
          )}

          {!isPdf && !isImage && !isDocx && !isText && !isSpreadsheet && !loading && !error && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground" data-testid="unsupported-file-view">
              <FileText className="h-16 w-16 mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2">Download to View</h3>
              <p className="text-sm text-muted-foreground mb-1">
                This file type requires an external application to view.
              </p>
              <p className="text-xs text-muted-foreground mb-6">
                {fileName || "Document"} ({fileType?.toUpperCase() || "Unknown format"})
              </p>
              <div className="flex flex-col gap-3 items-center">
                <Button variant="default" onClick={handleDownload} className="gap-2" data-testid="button-unsupported-download">
                  <Download className="h-4 w-4" />
                  Download File
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-6">
                Supported preview: PDF, Images, DOCX, Text, CSV, JSON, XML
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1 border-t bg-muted/30 text-xs text-muted-foreground">
        <span>
          Page {currentPage} of {numPages} | Zoom: {Math.round(scale * 100)}%
        </span>
        <span>
          Use arrow keys to navigate | +/- to zoom | ESC to close
        </span>
      </div>
    </div>
  );
}

export function DocumentViewerModal({
  isOpen,
  onClose,
  url,
  fileName,
  fileType,
}: {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  fileName?: string;
  fileType?: string;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm" data-testid="document-viewer-modal">
      <DocumentViewer url={url} fileName={fileName} fileType={fileType} onClose={onClose} />
    </div>
  );
}
