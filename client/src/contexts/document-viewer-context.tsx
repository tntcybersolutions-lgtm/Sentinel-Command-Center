import { createContext, useContext, useState, useCallback } from "react";
import { DocumentViewerModal } from "@/components/document-viewer";

interface DocumentViewerState {
  isOpen: boolean;
  url: string;
  fileName?: string;
  fileType?: string;
}

interface DocumentViewerContextType {
  openDocument: (url: string, fileName?: string, fileType?: string) => void;
  closeDocument: () => void;
  isOpen: boolean;
}

const DocumentViewerContext = createContext<DocumentViewerContextType | null>(null);

export function DocumentViewerProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DocumentViewerState>({
    isOpen: false,
    url: "",
    fileName: undefined,
    fileType: undefined,
  });

  const openDocument = useCallback((url: string, fileName?: string, fileType?: string) => {
    console.log("[DocumentViewer] Opening document:", { url, fileName, fileType });
    const detectedType = fileType || url.split(".").pop()?.toLowerCase();
    setState({
      isOpen: true,
      url,
      fileName,
      fileType: detectedType,
    });
  }, []);

  const closeDocument = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <DocumentViewerContext.Provider value={{ openDocument, closeDocument, isOpen: state.isOpen }}>
      {children}
      <DocumentViewerModal
        isOpen={state.isOpen}
        onClose={closeDocument}
        url={state.url}
        fileName={state.fileName}
        fileType={state.fileType}
      />
    </DocumentViewerContext.Provider>
  );
}

export function useDocumentViewer() {
  const context = useContext(DocumentViewerContext);
  if (!context) {
    throw new Error("useDocumentViewer must be used within a DocumentViewerProvider");
  }
  return context;
}
