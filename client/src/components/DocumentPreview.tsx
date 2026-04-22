import { useState, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Download, X, RotateCw, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface DocumentPreviewProps {
  isOpen: boolean;
  onClose: () => void;
  document: {
    id: string;
    title: string;
    fileName: string;
    mimeType: string;
    storageKey: string;
  } | null;
}

export function DocumentPreview({ isOpen, onClose, document }: DocumentPreviewProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const onDocumentLoadSuccess = useCallback(({ numPages }: { numPages: number }) => {
    setNumPages(numPages);
    setPageNumber(1);
  }, []);

  const goToPreviousPage = () => {
    setPageNumber((prev) => Math.max(1, prev - 1));
  };

  const goToNextPage = () => {
    setPageNumber((prev) => Math.min(numPages || 1, prev + 1));
  };

  const zoomIn = () => {
    setScale((prev) => Math.min(3, prev + 0.25));
  };

  const zoomOut = () => {
    setScale((prev) => Math.max(0.5, prev - 0.25));
  };

  const rotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const handleDownload = () => {
    if (document) {
      window.open(`/api/documents/${document.id}/download`, "_blank");
    }
  };

  if (!document) return null;

  const isPdf = document.mimeType === "application/pdf" || document.fileName.toLowerCase().endsWith(".pdf");
  const isImage = document.mimeType.startsWith("image/") || 
    /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(document.fileName);
  const isOffice = /\.(doc|docx|xls|xlsx|ppt|pptx)$/i.test(document.fileName);

  const renderPreview = () => {
    if (isPdf) {
      return (
        <div className="flex flex-col items-center justify-center h-full overflow-auto">
          <Document
            file={document.storageKey}
            onLoadSuccess={onDocumentLoadSuccess}
            loading={
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            }
            error={
              <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                <p>Failed to load PDF</p>
                <Button onClick={handleDownload} variant="outline" className="mt-4">
                  <Download className="h-4 w-4 mr-2" />
                  Download Instead
                </Button>
              </div>
            }
          >
            <Page
              pageNumber={pageNumber}
              scale={scale}
              rotate={rotation}
              renderTextLayer={false}
              renderAnnotationLayer={false}
              className="shadow-lg"
            />
          </Document>
        </div>
      );
    }

    if (isImage) {
      return (
        <div className="flex items-center justify-center h-full overflow-auto p-4">
          <img
            src={document.storageKey}
            alt={document.title}
            className="max-w-full max-h-full object-contain shadow-lg"
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg)`,
              transition: "transform 0.2s ease-in-out",
            }}
          />
        </div>
      );
    }

    if (isOffice) {
      const officeUrl = encodeURIComponent(`${window.location.origin}${document.storageKey}`);
      return (
        <div className="flex items-center justify-center h-full">
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${officeUrl}`}
            className="w-full h-full border-0"
            title={document.title}
          />
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <p className="mb-4">Preview not available for this file type</p>
        <Button onClick={handleDownload} variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Download File
        </Button>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={cn(
        "flex flex-col p-0 gap-0",
        isFullscreen ? "max-w-[100vw] h-[100vh] w-[100vw]" : "max-w-4xl h-[80vh]"
      )}>
        <DialogHeader className="flex flex-row items-center justify-between p-4 border-b shrink-0">
          <DialogTitle className="truncate max-w-md" data-testid="text-preview-title">
            {document.title}
          </DialogTitle>
          <div className="flex items-center gap-2">
            {(isPdf || isImage) && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={zoomOut}
                  disabled={scale <= 0.5}
                  data-testid="button-zoom-out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-sm text-muted-foreground min-w-[4rem] text-center">
                  {Math.round(scale * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={zoomIn}
                  disabled={scale >= 3}
                  data-testid="button-zoom-in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={rotate}
                  data-testid="button-rotate"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleFullscreen}
              data-testid="button-fullscreen"
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              data-testid="button-download-preview"
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              data-testid="button-close-preview"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto bg-muted/30">
          {renderPreview()}
        </div>

        {isPdf && numPages && numPages > 1 && (
          <div className="flex items-center justify-center gap-4 p-4 border-t shrink-0">
            <Button
              variant="outline"
              size="icon"
              onClick={goToPreviousPage}
              disabled={pageNumber <= 1}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm" data-testid="text-page-info">
              Page {pageNumber} of {numPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={goToNextPage}
              disabled={pageNumber >= numPages}
              data-testid="button-next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
