// Roadmap Feature 11 — Token-gated client/sub portal page.
//
// Unauthenticated, read-only view at /portal/:token. Loads share metadata
// + filtered project documents from the public portal API. Renders a clean
// frame with PoweredByFooter (variant="brand") at the bottom.

import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PoweredByFooter } from "@/components/powered-by-footer";
import { AlertCircle, FileText, Lock, Download, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ShareMeta {
  share: {
    id: string;
    audience: string | null;
    allowedCategories?: string[] | null;
    expiresAt: string | null;
  };
  project: {
    id: string;
    name: string;
    projectNumber?: string | null;
    status?: string | null;
  } | null;
}

interface PortalDoc {
  id: string;
  fileName: string;
  category: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  createdAt: string;
  downloadUrl?: string | null;
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export default function PortalPage() {
  const [, params] = useRoute("/portal/:token");
  const token = params?.token || "";

  const shareQ = useQuery<ShareMeta>({
    queryKey: ["/api/portal", token],
    queryFn: async () => {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}`, {
        credentials: "omit",
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `Share not accessible (${res.status})`);
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const docsQ = useQuery<PortalDoc[]>({
    queryKey: ["/api/portal", token, "documents"],
    queryFn: async () => {
      const res = await fetch(
        `/api/portal/${encodeURIComponent(token)}/documents`,
        { credentials: "omit" },
      );
      if (!res.ok) throw new Error(`Documents not accessible (${res.status})`);
      return res.json();
    },
    enabled: !!token && shareQ.data != null,
    retry: false,
  });

  const error = shareQ.error;
  const meta = shareQ.data;
  const share = meta?.share;
  const project = meta?.project;
  const docs = docsQ.data || [];

  return (
    <div className="min-h-screen flex flex-col bg-muted/20" data-testid="page-portal">
      <header className="border-b bg-background">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <Lock className="h-5 w-5 text-primary" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold tracking-wide text-muted-foreground">
              SECURE PROJECT PORTAL
            </div>
            <div className="text-lg font-bold truncate" data-testid="text-portal-project">
              {project?.name || (shareQ.isLoading ? "Loading..." : "Project Portal")}
            </div>
          </div>
          {share?.audience ? (
            <Badge variant="outline" data-testid="badge-portal-audience">
              {share.audience}
            </Badge>
          ) : null}
          {share?.expiresAt ? (
            <Badge variant="secondary" className="gap-1" data-testid="badge-portal-expiry">
              <Calendar className="h-3 w-3" />
              Expires {formatDate(share.expiresAt)}
            </Badge>
          ) : null}
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8 space-y-6">
        {error ? (
          <Card className="border-destructive/50" data-testid="card-portal-error">
            <CardContent className="py-10 text-center space-y-3">
              <AlertCircle className="h-10 w-10 mx-auto text-destructive" />
              <div className="text-lg font-semibold">This share link is no longer valid.</div>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                The link may have been revoked, expired, or never existed. Please contact your project
                manager for an updated link.
              </p>
            </CardContent>
          </Card>
        ) : shareQ.isLoading ? (
          <div className="space-y-3" data-testid="portal-loading">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Shared Documents</CardTitle>
              </CardHeader>
              <CardContent>
                {docsQ.isLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : docs.length === 0 ? (
                  <div
                    className="text-sm text-muted-foreground py-8 text-center"
                    data-testid="text-portal-empty"
                  >
                    No documents have been shared yet.
                  </div>
                ) : (
                  <div className="divide-y" data-testid="list-portal-documents">
                    {docs.map((d) => (
                      <div
                        key={d.id}
                        className="py-3 flex items-center gap-3"
                        data-testid={`row-portal-doc-${d.id}`}
                      >
                        <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">{d.fileName}</div>
                          <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                            {d.category ? (
                              <Badge variant="outline" className="text-[10px]">
                                {d.category}
                              </Badge>
                            ) : null}
                            <span>{formatBytes(d.fileSize)}</span>
                            <span>•</span>
                            <span>{formatDate(d.createdAt)}</span>
                          </div>
                        </div>
                        {d.downloadUrl ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            data-testid={`button-portal-download-${d.id}`}
                          >
                            <a href={d.downloadUrl} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <PoweredByFooter variant="brand" />
    </div>
  );
}
