import { useRef, useState } from "react";
import { useRoute } from "wouter";
import { apiFetch, pending } from "@/lib/offline-queue";
import MobileTabBar from "@/components/mobile/m-tab-bar";

interface Pin { x: number; y: number; n: number; }

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "saved" }
  | { kind: "queued"; pending: number }
  | { kind: "error"; message: string };

const MAX_DIM = 1600;
const JPEG_Q = 0.82;

async function resizeToDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const ratio = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
    const w = Math.round(img.width * ratio);
    const h = Math.round(img.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", JPEG_Q);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function composeMarkup(baseDataUrl: string, pins: Pin[]): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = baseDataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const radius = Math.max(14, Math.round(Math.min(img.width, img.height) * 0.022));
  for (const pin of pins) {
    const cx = pin.x * img.width;
    const cy = pin.y * img.height;
    ctx.beginPath();
    ctx.fillStyle = "#E24B4A";
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `bold ${Math.round(radius * 1.1)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(pin.n), cx, cy + 1);
  }
  return canvas.toDataURL("image/jpeg", JPEG_Q);
}

export default function MobilePhotosPage() {
  const [match, params] = useRoute("/projects/:id/m-photos");
  const projectId = (match && params?.id) || "default";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imageData, setImageData] = useState<string | null>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [caption, setCaption] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const dataUrl = await resizeToDataUrl(f);
      setImageData(dataUrl);
      setPins([]);
      setSubmitState({ kind: "idle" });
    } catch {
      setSubmitState({ kind: "error", message: "Could not process image" });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setPins((prev) => [...prev, { x, y, n: prev.length + 1 }]);
  };

  const reset = () => {
    setImageData(null);
    setPins([]);
    setCaption("");
    setSubmitState({ kind: "idle" });
  };

  const submit = async () => {
    if (!imageData) return;
    setSubmitState({ kind: "submitting" });
    try {
      const finalUrl = pins.length > 0 ? await composeMarkup(imageData, pins) : imageData;
      const resp = await apiFetch(`/api/projects/${projectId}/photos`, {
        method: "POST",
        body: JSON.stringify({
          storageUrl: finalUrl,
          caption,
          pins,
          capturedAt: new Date().toISOString(),
          mimeType: "image/jpeg",
        }),
      });
      if (resp.status === 202) {
        setSubmitState({ kind: "queued", pending: await pending() });
      } else if (resp.ok) {
        setSubmitState({ kind: "saved" });
      } else {
        setSubmitState({ kind: "error", message: `Server returned ${resp.status}` });
      }
    } catch (e) {
      setSubmitState({ kind: "error", message: (e as Error).message });
    }
  };

  return (
    <div style={{ background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE", padding: 20 }} data-testid="m-photos-page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 16 }}>Photos</h1>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onFileChange}
        style={{ display: "none" }}
        data-testid="m-photos-file-input"
      />

      {!imageData && (
        <button
          data-testid="m-photos-take-button"
          onClick={onPickFile}
          style={{
            width: "100%", height: 88, background: "#1D9E75", color: "#fff", border: "none",
            borderRadius: 18, fontSize: 18, fontWeight: 600, cursor: "pointer",
          }}
        >
          📷 Take Photo
        </button>
      )}

      {imageData && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ position: "relative", display: "inline-block", borderRadius: 12, overflow: "hidden", background: "#14171C" }}>
            <img
              ref={imgRef}
              src={imageData}
              onClick={onImageClick}
              style={{ width: "100%", display: "block", cursor: "crosshair" }}
              data-testid="m-photos-canvas-img"
              alt="captured"
            />
            {pins.map((p, i) => (
              <div
                key={i}
                data-testid={`m-photos-pin-${p.n}`}
                style={{
                  position: "absolute",
                  left: `${p.x * 100}%`,
                  top: `${p.y * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 28, height: 28, borderRadius: "50%",
                  background: "#E24B4A", color: "#fff",
                  fontSize: 13, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.45)",
                  pointerEvents: "none",
                }}
              >{p.n}</div>
            ))}
          </div>

          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Caption (optional)…"
            data-testid="m-photos-caption-input"
            style={{
              width: "100%", padding: 14, background: "#14171C", color: "#E8EAEE",
              border: "1px solid #2C2C2A", borderRadius: 12, fontSize: 15,
            }}
          />

          <div style={{ display: "flex", gap: 12 }}>
            <button
              data-testid="m-photos-submit-button"
              onClick={submit}
              disabled={submitState.kind === "submitting"}
              style={{
                flex: 1, height: 56, background: "#1D9E75", color: "#fff",
                border: "none", borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: "pointer",
              }}
            >
              {submitState.kind === "submitting" ? "Submitting…" : "Submit"}
            </button>
            <button
              data-testid="m-photos-redo-button"
              onClick={reset}
              style={{
                flex: 1, height: 56, background: "transparent", color: "#E8EAEE",
                border: "1px solid #2C2C2A", borderRadius: 14, fontSize: 16, cursor: "pointer",
              }}
            >
              Retake
            </button>
          </div>

          {pins.length > 0 && (
            <div style={{ fontSize: 12, color: "#8B92A1" }}>
              {pins.length} pin{pins.length === 1 ? "" : "s"} placed. Tap image to add more.
            </div>
          )}

          {submitState.kind === "saved" && (
            <div style={{ background: "#14171C", borderRadius: 14, padding: 16, borderLeft: "3px solid #1D9E75", color: "#1D9E75", fontWeight: 600 }}>
              Saved
            </div>
          )}
          {submitState.kind === "queued" && (
            <div style={{ background: "#14171C", borderRadius: 14, padding: 16, borderLeft: "3px solid #F0997B", color: "#F0997B", fontWeight: 600 }}>
              Queued ({submitState.pending})
            </div>
          )}
          {submitState.kind === "error" && (
            <div style={{ color: "#E24B4A", fontSize: 13 }}>{submitState.message}</div>
          )}
        </div>
      )}
      <MobileTabBar active="home" />
    </div>
  );
}
