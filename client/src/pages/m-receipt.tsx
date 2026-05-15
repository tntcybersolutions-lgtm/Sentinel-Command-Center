import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { apiFetch, subscribe } from "@/lib/offline-queue";
import * as haptics from "@/lib/haptics";

type Extraction = {
  vendor: string; total: number | null; currency: string;
  purchaseDate: string | null; category: string;
  lineItems: { description: string; amount: number }[];
};
const EMPTY: Extraction = {
  vendor: "", total: null, currency: "USD",
  purchaseDate: null, category: "Materials", lineItems: [],
};
const MAX_DIM = 1600; const JPEG_Q = 0.82;

export default function MobileReceiptPage() {
  const params = useParams<{ id?: string }>();
  const projectId = params.id || "default";
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [extraction, setExtraction] = useState<Extraction>(EMPTY);
  const [phase, setPhase] = useState<"idle"|"extracting"|"review"|"saving"|"saved"|"error">("idle");
  const [err, setErr] = useState<string | null>(null);
  const [queued, setQueued] = useState(0);
  useEffect(() => subscribe(setQueued), []);

  function openCamera() { haptics.tap(); fileRef.current?.click(); }
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setErr(null);
    const resized = await resize(file);
    setImageUrl(resized); setPhase("extracting"); haptics.tap();
    try {
      const res = await fetch("/api/receipts/ocr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: resized }),
      });
      if (!res.ok) throw new Error("OCR " + res.status);
      const data = await res.json();
      setExtraction({
        vendor: data.vendor ?? "", total: typeof data.total === "number" ? data.total : null,
        currency: data.currency ?? "USD", purchaseDate: data.purchaseDate ?? null,
        category: data.category ?? "Materials",
        lineItems: Array.isArray(data.lineItems) ? data.lineItems : [],
      });
      setPhase("review"); haptics.success();
    } catch (e) {
      setErr((e as Error).message); setExtraction(EMPTY); setPhase("review"); haptics.warning();
    }
  }
  async function save() {
    setPhase("saving");
    try {
      const res = await apiFetch("/api/projects/" + projectId + "/receipts", {
        method: "POST", kind: "generic",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extraction, imageUrl, projectId }),
      });
      if (res.ok || res.status === 202) { setPhase("saved"); haptics.success(); }
      else { setPhase("error"); setErr("Server " + res.status); haptics.error(); }
    } catch (e) { setPhase("error"); setErr((e as Error).message); haptics.error(); }
  }
  function reset() { setImageUrl(null); setExtraction(EMPTY); setPhase("idle"); setErr(null); }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-1, #0B0D11)", color: "var(--text-1, #E8EAEE)", paddingBottom: 110 }}>
      <header style={{ padding: "16px 22px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-2, #8B92A1)", letterSpacing: 0.6, textTransform: "uppercase" }}>Receipt</div>
          <div style={{ fontSize: 18, fontWeight: 500, marginTop: 2 }}>Snap + categorize</div>
        </div>
        {queued > 0 && (
          <span style={{ background: "var(--bg-3, #1C2128)", color: "#FAC775", padding: "5px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500 }}>{queued} queued</span>
        )}
      </header>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} style={{ display: "none" }} />
      <section style={{ padding: "0 22px" }}>
        {phase === "idle" && (
          <div style={{ textAlign: "center", padding: "40px 0" }}>
            <button onClick={openCamera} style={primaryBtn}>Snap receipt</button>
            <div style={{ fontSize: 12, color: "var(--text-2, #8B92A1)", marginTop: 12 }}>Herbie extracts vendor, amount, date, and category.</div>
          </div>
        )}
        {imageUrl && phase !== "idle" && (
          <div style={{ borderRadius: 14, overflow: "hidden", background: "#000", marginBottom: 14 }}>
            <img src={imageUrl} alt="receipt" style={{ width: "100%", display: "block", maxHeight: 240, objectFit: "contain" }} />
          </div>
        )}
        {phase === "extracting" && (
          <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-2, #8B92A1)", fontSize: 13 }}>Reading the receipt…</div>
        )}
        {(phase === "review" || phase === "saving" || phase === "error") && (
          <div style={{ background: "var(--bg-2, #14171C)", borderRadius: 14, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <Field label="Vendor" value={extraction.vendor} onChange={(v) => setExtraction({ ...extraction, vendor: v })} />
            <Row>
              <Field label="Total" type="number" value={extraction.total ?? ""} onChange={(v) => setExtraction({ ...extraction, total: v === "" ? null : Number(v) })} />
              <Field label="Currency" value={extraction.currency} onChange={(v) => setExtraction({ ...extraction, currency: v.toUpperCase() })} />
            </Row>
            <Row>
              <Field label="Date" type="date" value={extraction.purchaseDate ?? ""} onChange={(v) => setExtraction({ ...extraction, purchaseDate: v || null })} />
              <Field label="Category" value={extraction.category} onChange={(v) => setExtraction({ ...extraction, category: v })} />
            </Row>
            {extraction.lineItems.length > 0 && (
              <div>
                <div style={{ fontSize: 11, color: "var(--text-2, #8B92A1)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Line items</div>
                {extraction.lineItems.map((li, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "4px 0", borderBottom: "0.5px solid var(--border-1, #2C2C2A)" }}>
                    <span>{li.description}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{li.amount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
            {err && (
              <div style={{ background: "#4A1B0C", color: "#F5C4B3", padding: 10, borderRadius: 10, fontSize: 12 }}>{err}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={save} disabled={phase === "saving" || !extraction.vendor || extraction.total == null}
                style={{ ...primaryBtn, opacity: extraction.vendor && extraction.total != null ? 1 : 0.4 }}>
                {phase === "saving" ? "Saving…" : "Save receipt"}
              </button>
              <button onClick={reset} style={secondaryBtn}>Retake</button>
            </div>
          </div>
        )}
        {phase === "saved" && (
          <div style={{ background: "#085041", borderRadius: 14, padding: 18, textAlign: "center", marginTop: 10 }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>Saved</div>
            <div style={{ fontSize: 12, color: "#9FE1CB", marginTop: 4 }}>{queued > 0 ? "Queued — will sync when online" : "Posted to budget"}</div>
            <button onClick={reset} style={{ ...secondaryBtn, marginTop: 12 }}>Add another</button>
          </div>
        )}
      </section>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{children}</div>;
}
function Field({ label, value, onChange, type = "text" }: { label: string; value: string | number; onChange: (v: string) => void; type?: string; }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--text-2, #8B92A1)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: "var(--bg-3, #1C2128)", border: "0.5px solid var(--border-1, #2C2C2A)", color: "var(--text-1, #E8EAEE)", padding: "10px 12px", borderRadius: 10, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
    </label>
  );
}

async function resize(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
    });
    const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("canvas 2d unavailable");
    ctx.drawImage(img, 0, 0, w, h);
    return c.toDataURL("image/jpeg", JPEG_Q);
  } finally { URL.revokeObjectURL(url); }
}

const primaryBtn: React.CSSProperties = {
  background: "var(--accent-1, #1D9E75)", color: "#E1F5EE", border: "none",
  padding: "14px 20px", borderRadius: 14, fontSize: 15, fontWeight: 500, cursor: "pointer", flex: 1,
};
const secondaryBtn: React.CSSProperties = {
  background: "transparent", color: "var(--text-2, #C7CBD1)",
  border: "0.5px solid var(--border-1, #2C2C2A)",
  padding: "14px 20px", borderRadius: 14, fontSize: 14, cursor: "pointer",
};
