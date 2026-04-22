import { useEffect, useMemo, useState } from "react";

type DocLike = {
  id: string;
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  storageKey?: string | null;
  sourceUrl?: string | null;
  folderId?: string | null;
  kind?: "project_document" | "bid_jacket_artifact";
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 160)}`);
  const t = text.trim().toLowerCase();
  if (t.startsWith("<!doctype") || t.startsWith("<html")) {
    throw new Error(`API returned HTML fallback: ${url}`);
  }
  return JSON.parse(text) as T;
}

function isTextMime(m: string) {
  return (
    m.startsWith("text/") ||
    m.includes("application/json") ||
    m.includes("application/xml") ||
    m.includes("application/csv")
  );
}

export function DocumentViewerPane({
  doc,
  onRenamed,
  onDeleted,
  onMoved,
}: {
  doc: DocLike | null;
  onRenamed?: (next: Partial<DocLike>) => void;
  onDeleted?: () => void;
  onMoved?: (folderId: string | null) => void;
}) {
  const [viewUrl, setViewUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const kind = doc?.kind ?? "project_document";

  const viewUrlEndpoint = useMemo(() => {
    if (!doc) return null;
    return kind === "bid_jacket_artifact"
      ? `/api/bid-jacket-artifacts/${doc.id}/view-url?disposition=inline`
      : `/api/documents/${doc.id}/view-url?disposition=inline`;
  }, [doc, kind]);

  const contentUrl = useMemo(() => {
    if (!doc) return null;
    return kind === "bid_jacket_artifact"
      ? `/api/bid-jacket-artifacts/${doc.id}/content`
      : `/api/documents/${doc.id}/content`;
  }, [doc, kind]);

  useEffect(() => {
    let cancelled = false;

    async function loadViewUrl() {
      if (!viewUrlEndpoint || !doc) return;
      setErr(null);
      setViewUrl(null);
      setTextPreview(null);

      try {
        const r = await fetchJson<{ url: string }>(viewUrlEndpoint);
        if (cancelled) return;

        setViewUrl(r.url);

        const mime = (doc.mimeType || "").toLowerCase();
        if (mime && isTextMime(mime)) {
          const txt = await fetch(r.url).then((x) => x.text());
          if (cancelled) return;
          setTextPreview(txt.slice(0, 12000));
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : "Failed to load preview");
      }
    }

    loadViewUrl();
    return () => {
      cancelled = true;
    };
  }, [viewUrlEndpoint, doc]);

  async function rename() {
    if (!doc || kind !== "project_document") return;
    const next = prompt("Rename document title:", doc.title);
    if (!next || next.trim() === doc.title) return;

    setBusy(true);
    setErr(null);
    try {
      const updated = await fetchJson<{ title: string }>(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: next.trim() }),
      });
      onRenamed?.({ title: updated.title });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function move() {
    if (!doc || kind !== "project_document") return;
    const folderId = prompt("Move to folderId (paste folder id, or blank for root):", doc.folderId || "");
    const normalized = folderId?.trim() ? folderId.trim() : null;

    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/documents/${doc.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderId: normalized }),
      });
      onMoved?.(normalized);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Move failed");
    } finally {
      setBusy(false);
    }
  }

  async function del() {
    if (!doc || kind !== "project_document") return;
    const ok = confirm("Delete this document? (It will be removed)");
    if (!ok) return;

    setBusy(true);
    setErr(null);
    try {
      await fetchJson(`/api/documents/${doc.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deletedBy: null }),
      });
      onDeleted?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function openInNewTab() {
    if (!viewUrl) return;
    window.open(viewUrl, "_blank", "noopener,noreferrer");
  }

  function download() {
    if (!contentUrl) return;
    const url = `${contentUrl}?disposition=attachment`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border bg-card p-6 text-sm text-muted-foreground" data-testid="viewer-empty">
        Select a document to preview.
      </div>
    );
  }

  const mime = (doc.mimeType || "").toLowerCase();

  return (
    <div className="flex h-full flex-col rounded-lg border bg-card" data-testid="viewer-pane">
      <div className="border-b p-4" data-testid="viewer-header">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</p>
        <p className="mt-1 text-base font-semibold truncate" data-testid="viewer-title">{doc.title}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            className="rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
            onClick={openInNewTab}
            disabled={!viewUrl}
            data-testid="button-open-doc"
          >
            Open
          </button>
          <button
            className="rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            onClick={download}
            data-testid="button-download-doc"
          >
            Download
          </button>

          {kind === "project_document" && (
            <>
              <button
                className="rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                onClick={rename}
                disabled={busy}
                data-testid="button-rename-doc"
              >
                Rename
              </button>
              <button
                className="rounded-md border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50"
                onClick={move}
                disabled={busy}
                data-testid="button-move-doc"
              >
                Move
              </button>
              <button
                className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/20 disabled:opacity-50"
                onClick={del}
                disabled={busy}
                data-testid="button-delete-doc"
              >
                Delete
              </button>
            </>
          )}
        </div>

        <div className="mt-3 space-y-0.5 text-xs text-muted-foreground" data-testid="viewer-meta">
          <div>File: {doc.fileName || "—"}</div>
          <div>MIME: {doc.mimeType || "—"}</div>
          <div>Source: {doc.sourceUrl ? "External" : "Storage"}</div>
        </div>

        {err && (
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive" data-testid="viewer-error">
            {err}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden p-4" data-testid="viewer-preview">
        {!viewUrl ? (
          <div className="flex h-full items-center justify-center rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
            Loading preview...
          </div>
        ) : mime.includes("application/pdf") ? (
          <iframe
            title="pdf-preview"
            src={viewUrl}
            className="h-full w-full rounded-md border bg-muted/20"
            data-testid="preview-pdf"
          />
        ) : mime.startsWith("image/") ? (
          <img
            src={viewUrl}
            alt={doc.title}
            className="max-h-full w-full rounded-md border bg-muted/20 object-contain"
            data-testid="preview-image"
          />
        ) : textPreview !== null ? (
          <pre className="h-full overflow-auto rounded-md border bg-muted/20 p-4 text-xs" data-testid="preview-text">
            {textPreview}
          </pre>
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground" data-testid="preview-unsupported">
            <p>Preview not available for this file type.</p>
            <p className="mt-1">
              Use <b>Open</b> or <b>Download</b>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
