import { useDocumentViewer } from "@/contexts/document-viewer-context";
import { FileText, FileImage, File, ExternalLink, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DocumentLinkProps {
  url: string;
  fileName: string;
  fileType?: string;
  className?: string;
  showIcon?: boolean;
  variant?: "link" | "button" | "card";
  size?: "sm" | "default" | "lg";
}

export function DocumentLink({
  url,
  fileName,
  fileType,
  className,
  showIcon = true,
  variant = "link",
  size = "default",
}: DocumentLinkProps) {
  const { openDocument } = useDocumentViewer();

  const detectedType = fileType || url.split(".").pop()?.toLowerCase() || "file";
  const isPdf = detectedType === "pdf";
  const isImage = ["jpg", "jpeg", "png", "gif", "bmp", "tiff", "webp"].includes(detectedType);

  const getIcon = () => {
    if (isPdf) return <FileText className="h-4 w-4 text-red-500 shrink-0" />;
    if (isImage) return <FileImage className="h-4 w-4 text-blue-500 shrink-0" />;
    return <File className="h-4 w-4 text-muted-foreground shrink-0" />;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    openDocument(url, fileName, detectedType);
  };

  if (variant === "button") {
    return (
      <Button
        variant="outline"
        size={size === "sm" ? "sm" : size === "lg" ? "lg" : "default"}
        onClick={handleClick}
        className={cn("gap-2", className)}
        data-testid={`button-view-document-${fileName.replace(/\s+/g, "-").toLowerCase()}`}
      >
        <Eye className="h-4 w-4" />
        View Document
      </Button>
    );
  }

  if (variant === "card") {
    return (
      <button
        onClick={handleClick}
        className={cn(
          "flex items-center gap-3 p-3 w-full text-left rounded-md border bg-card hover-elevate transition-colors",
          className
        )}
        data-testid={`card-document-${fileName.replace(/\s+/g, "-").toLowerCase()}`}
      >
        {showIcon && getIcon()}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fileName}</p>
          <p className="text-xs text-muted-foreground uppercase">{detectedType}</p>
        </div>
        <Eye className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 text-primary hover:underline cursor-pointer",
        size === "sm" && "text-sm",
        size === "lg" && "text-lg",
        className
      )}
      data-testid={`link-document-${fileName.replace(/\s+/g, "-").toLowerCase()}`}
    >
      {showIcon && getIcon()}
      <span className="truncate">{fileName}</span>
    </button>
  );
}

interface DocumentGridProps {
  documents: Array<{
    id: string;
    name: string;
    url: string;
    fileType?: string;
    size?: number;
    uploadedAt?: string;
  }>;
  className?: string;
}

export function DocumentGrid({ documents, className }: DocumentGridProps) {
  return (
    <div className={cn("grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3", className)}>
      {documents.map((doc) => (
        <DocumentLink
          key={doc.id}
          url={doc.url}
          fileName={doc.name}
          fileType={doc.fileType}
          variant="card"
        />
      ))}
    </div>
  );
}
