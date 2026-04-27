// Public e-sign page for lien waivers.
//
// Reached via /sign/lien-waiver/:token — no auth, no sidebar. The
// vendor receives a magic link, lands here, sees the rendered waiver
// document, types their name + title, draws a signature on a canvas,
// and submits. Submission flips the waiver to status='signed' on the
// server and burns the token.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, FileSignature, Eraser } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SignLookup {
  waiver: {
    id: string;
    waiverNumber: string;
    waiverType: string;
    status: string;
    paymentAmount: string;
    throughDate: string;
    signerName: string | null;
    signerTitle: string | null;
    signerEmail: string | null;
    tokenExpiresAt: string | null;
  };
  projectName: string;
  projectNumber: string;
  vendorName: string;
  filledBody: string;
}

const TYPE_LABELS: Record<string, string> = {
  conditional_partial: "Conditional · Progress",
  unconditional_partial: "Unconditional · Progress",
  conditional_final: "Conditional · Final",
  unconditional_final: "Unconditional · Final",
};

export default function SignLienWaiverPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [data, setData] = useState<SignLookup | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signerName, setSignerName] = useState("");
  const [signerTitle, setSignerTitle] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/sign/lien-waivers/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `lookup failed (${res.status})`);
        }
        const body: SignLookup = await res.json();
        if (cancelled) return;
        setData(body);
        setSignerName(body.waiver.signerName ?? "");
        setSignerTitle(body.waiver.signerTitle ?? "");
        setSignerEmail(body.waiver.signerEmail ?? "");
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "lookup failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (token) load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // ─── Signature pad ────────────────────────────────────────────────
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0f172a";

    function pos(e: PointerEvent): [number, number] {
      const rect = c!.getBoundingClientRect();
      return [
        ((e.clientX - rect.left) * c!.width) / rect.width,
        ((e.clientY - rect.top) * c!.height) / rect.height,
      ];
    }

    const onDown = (e: PointerEvent) => {
      drawing.current = true;
      hasInk.current = true;
      const [x, y] = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      c.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!drawing.current) return;
      const [x, y] = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    const onUp = (e: PointerEvent) => {
      drawing.current = false;
      try { c.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    };

    c.addEventListener("pointerdown", onDown);
    c.addEventListener("pointermove", onMove);
    c.addEventListener("pointerup", onUp);
    c.addEventListener("pointerleave", onUp);
    return () => {
      c.removeEventListener("pointerdown", onDown);
      c.removeEventListener("pointermove", onMove);
      c.removeEventListener("pointerup", onUp);
      c.removeEventListener("pointerleave", onUp);
    };
  }, [data, done]);

  function clearSignature() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    ctx?.clearRect(0, 0, c.width, c.height);
    hasInk.current = false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (!signerName.trim()) {
      setSubmitError("Signer name is required.");
      return;
    }
    const c = canvasRef.current;
    if (!c || !hasInk.current) {
      setSubmitError("Please draw your signature in the box.");
      return;
    }
    setSubmitting(true);
    try {
      const signatureDataUrl = c.toDataURL("image/png");
      await apiRequest("POST", `/api/sign/lien-waivers/${encodeURIComponent(token)}`, {
        signerName: signerName.trim(),
        signerTitle: signerTitle.trim() || null,
        signerEmail: signerEmail.trim() || null,
        signatureDataUrl,
      });
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "sign failed");
    } finally {
      setSubmitting(false);
    }
  }

  const expiry = useMemo(() => {
    if (!data?.waiver.tokenExpiresAt) return null;
    return new Date(data.waiver.tokenExpiresAt).toLocaleDateString();
  }, [data]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 px-4 py-10">
      <div className="max-w-3xl mx-auto" data-testid="page-sign-lien-waiver">
        <header className="mb-6">
          <div className="flex items-center gap-3">
            <FileSignature className="w-7 h-7 text-blue-600" />
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Lien Waiver Signature
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Review the waiver document below, then sign at the bottom of this page.
          </p>
        </header>

        {loading && (
          <Card>
            <CardContent className="py-8 space-y-3">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-40 w-full" />
            </CardContent>
          </Card>
        )}

        {loadError && (
          <Card className="border-red-300">
            <CardContent className="py-8 flex items-start gap-3" data-testid="error-load">
              <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
              <div>
                <div className="font-medium">Sign link is not valid</div>
                <div className="text-sm text-muted-foreground mt-1">{loadError}</div>
                <div className="text-sm mt-3">
                  Please contact the project manager to request a new signing link.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {data && done && (
          <Card className="border-emerald-300" data-testid="card-thanks">
            <CardContent className="py-10 flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 mt-0.5" />
              <div>
                <div className="text-lg font-semibold">Thank you — signed</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Waiver {data.waiver.waiverNumber} has been signed and returned to BlackHawk Construction.
                  You may close this page.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {data && !done && (
          <>
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <CardTitle data-testid="text-waiver-number">{data.waiver.waiverNumber}</CardTitle>
                  <Badge variant="outline" data-testid="badge-waiver-type">
                    {TYPE_LABELS[data.waiver.waiverType] ?? data.waiver.waiverType}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Field label="Project" value={data.projectName} dataTestId="text-project-name" />
                  <Field label="Project #" value={data.projectNumber} dataTestId="text-project-number" />
                  <Field label="Vendor / Claimant" value={data.vendorName} dataTestId="text-vendor-name" />
                  <Field
                    label="Payment Amount"
                    value={`$${Number(data.waiver.paymentAmount).toFixed(2)}`}
                    dataTestId="text-amount"
                  />
                  <Field
                    label="Through Date"
                    value={new Date(data.waiver.throughDate).toLocaleDateString()}
                    dataTestId="text-through-date"
                  />
                  {expiry && (
                    <Field label="Link Expires" value={expiry} dataTestId="text-token-expires" />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-base">Waiver Document</CardTitle>
              </CardHeader>
              <CardContent>
                <pre
                  className="font-mono text-xs leading-relaxed whitespace-pre-wrap bg-slate-100 dark:bg-slate-900 rounded p-4 max-h-96 overflow-auto"
                  data-testid="text-document-body"
                >
                  {data.filledBody || "(document body unavailable)"}
                </pre>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sign and Submit</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-sign">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="signerName">Full Name *</Label>
                      <Input
                        id="signerName"
                        value={signerName}
                        onChange={(e) => setSignerName(e.target.value)}
                        required
                        data-testid="input-signer-name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="signerTitle">Title</Label>
                      <Input
                        id="signerTitle"
                        value={signerTitle}
                        onChange={(e) => setSignerTitle(e.target.value)}
                        data-testid="input-signer-title"
                      />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="signerEmail">Email</Label>
                      <Input
                        id="signerEmail"
                        type="email"
                        value={signerEmail}
                        onChange={(e) => setSignerEmail(e.target.value)}
                        data-testid="input-signer-email"
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="block mb-1.5">Signature *</Label>
                    <div className="border rounded bg-white dark:bg-slate-100">
                      <canvas
                        ref={canvasRef}
                        width={600}
                        height={160}
                        className="w-full h-40 touch-none cursor-crosshair"
                        data-testid="canvas-signature"
                      />
                    </div>
                    <div className="mt-2 flex justify-between items-center">
                      <p className="text-xs text-muted-foreground">
                        Draw your signature with your mouse, finger, or stylus.
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={clearSignature}
                        data-testid="button-clear-signature"
                      >
                        <Eraser className="w-4 h-4 mr-1.5" /> Clear
                      </Button>
                    </div>
                  </div>

                  {submitError && (
                    <div
                      className="text-sm text-red-600 bg-red-50 dark:bg-red-950 dark:text-red-300 rounded p-2"
                      data-testid="error-submit"
                    >
                      {submitError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <Button type="submit" disabled={submitting} data-testid="button-submit-signature">
                      {submitting ? "Submitting..." : "Submit Signature"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </>
        )}

        <footer className="text-xs text-muted-foreground mt-8 text-center">
          BlackHawk Construction · Lien Waiver E-Sign
        </footer>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  dataTestId,
}: {
  label: string;
  value: string;
  dataTestId?: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-medium" data-testid={dataTestId}>
        {value}
      </div>
    </div>
  );
}
