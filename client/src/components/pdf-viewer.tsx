import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  ZoomIn,
  ZoomOut,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  Download,
  Maximize2,
  Minimize2,
  X,
  FileText,
  Loader2,
} from "lucide-react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  fileName?: string;
  onClose?: () => void;
  isOpen?: boolean;
  mode?: "inline" | "modal" | "fullscreen";
}

export function PDFViewer({
  url,
  fileName = "Document",
  onClose,
  isOpen = true,
  mode = "inline",
}: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(mode === "fullscreen");

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
      setIsLoading(false);
      setError(null);
    },
    []
  );

  const onDocumentLoadError = useCallback((err: Error) => {
    setIsLoading(false);
    setError(err.message || "Failed to load PDF");
  }, []);

  const goToPrevPage = () => setPageNumber((prev) => Math.max(1, prev - 1));
  const goToNextPage = () =>
    setPageNumber((prev) => Math.min(numPages || 1, prev + 1));
  const zoomIn = () => setScale((prev) => Math.min(3, prev + 0.25));
  const zoomOut = () => setScale((prev) => Math.max(0.25, prev - 0.25));
  const rotate = () => setRotation((prev) => (prev + 90) % 360);
  const toggleFullscreen = () => setIsFullscreen((prev) => !prev);

  const handleDownload = () => {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
  };

  const ViewerContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm truncate max-w-[200px]">
            {fileName}
          </span>
          {numPages && (
            <Badge variant="secondary" className="text-xs">
              {numPages} pages
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1}
            data-testid="button-prev-page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <span className="text-sm font-medium min-w-[80px] text-center">
            {pageNumber} / {numPages || "?"}
          </span>

          <Button
            size="icon"
            variant="ghost"
            onClick={goToNextPage}
            disabled={pageNumber >= (numPages || 1)}
            data-testid="button-next-page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-2" />

          <Button
            size="icon"
            variant="ghost"
            onClick={zoomOut}
            disabled={scale <= 0.25}
            data-testid="button-zoom-out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>

          <span className="text-xs font-medium min-w-[50px] text-center">
            {Math.round(scale * 100)}%
          </span>

          <Button
            size="icon"
            variant="ghost"
            onClick={zoomIn}
            disabled={scale >= 3}
            data-testid="button-zoom-in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>

          <div className="w-px h-6 bg-border mx-2" />

          <Button
            size="icon"
            variant="ghost"
            onClick={rotate}
            data-testid="button-rotate"
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={toggleFullscreen}
            data-testid="button-fullscreen"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            onClick={handleDownload}
            data-testid="button-download"
          >
            <Download className="h-4 w-4" />
          </Button>

          {onClose && (
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
              data-testid="button-close-viewer"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-muted/20 flex items-start justify-center p-4">
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Loading document...
            </p>
          </div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center py-20">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                setIsLoading(true);
                setError(null);
              }}
            >
              Retry
            </Button>
          </div>
        )}

        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
          error={null}
          className={isLoading || error ? "hidden" : ""}
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            rotate={rotation}
            renderTextLayer={true}
            renderAnnotationLayer={true}
            className="shadow-lg"
          />
        </Document>
      </div>

      {numPages && numPages > 1 && (
        <div className="p-3 border-t bg-muted/30">
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Page</span>
            <Slider
              value={[pageNumber]}
              min={1}
              max={numPages}
              step={1}
              onValueChange={([value]) => setPageNumber(value)}
              className="flex-1"
              data-testid="slider-page"
            />
          </div>
        </div>
      )}
    </div>
  );

  if (mode === "modal") {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose?.()}>
        <DialogContent
          className={`p-0 gap-0 ${
            isFullscreen
              ? "max-w-[95vw] max-h-[95vh] w-[95vw] h-[95vh]"
              : "max-w-4xl h-[80vh]"
          }`}
        >
          <ViewerContent />
        </DialogContent>
      </Dialog>
    );
  }

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <ViewerContent />
      </div>
    );
  }

  return (
    <Card className="h-full">
      <ViewerContent />
    </Card>
  );
}

interface PDFThumbnailProps {
  url: string;
  onClick?: () => void;
  className?: string;
}

export function PDFThumbnail({ url, onClick, className }: PDFThumbnailProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div
      className={`relative cursor-pointer hover-elevate rounded-md overflow-hidden border bg-muted/20 ${className}`}
      onClick={onClick}
      data-testid="pdf-thumbnail"
    >
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <Document
        file={url}
        loading={null}
        error={null}
        onLoadSuccess={() => setIsLoaded(true)}
      >
        <Page
          pageNumber={1}
          width={150}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
    </div>
  );
}

export default PDFViewer;
