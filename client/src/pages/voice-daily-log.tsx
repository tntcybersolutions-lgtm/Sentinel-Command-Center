import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { apiFetch, pending } from "@/lib/offline-queue";

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    SpeechRecognition?: new () => SpeechRecognitionLike;
  }
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> & { length: number } }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "saved" }
  | { kind: "queued"; pending: number }
  | { kind: "error"; message: string };

function fmtSec(n: number): string {
  const m = Math.floor(n / 60), s = n % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function VoiceDailyLog() {
  const [match, params] = useRoute("/projects/:id/voice-daily-log");
  const projectId = (match && params?.id) || "default";
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });

  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => { /* silent */ },
        { timeout: 5000, maximumAge: 60_000 }
      );
    }
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      };
      mr.start();
      mrRef.current = mr;

      const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
      if (SR) {
        try {
          const r = new SR();
          r.continuous = true;
          r.interimResults = true;
          r.lang = "en-US";
          r.onresult = (e) => {
            let txt = "";
            for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
            setTranscript(txt);
          };
          r.onerror = () => { /* ignore */ };
          r.start();
          recogRef.current = r;
        } catch { /* ignore */ }
      }
      setDurationSec(0);
      tickRef.current = setInterval(() => setDurationSec((d) => d + 1), 1000);
      setRecording(true);
    } catch {
      setSubmitState({ kind: "error", message: "Microphone access denied" });
    }
  };

  const stop = () => {
    try { mrRef.current?.stop(); } catch { /* ignore */ }
    try { recogRef.current?.stop(); } catch { /* ignore */ }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    setRecording(false);
  };

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async () => {
    setSubmitState({ kind: "submitting" });
    try {
      const capturedAt = new Date().toISOString();
      const summary = transcript.trim().slice(0, 60);
      const title = summary
        ? `Voice log — ${summary}${transcript.length > 60 ? "…" : ""}`
        : `Voice log — ${new Date().toLocaleString()}`;
      const resp = await apiFetch(`/api/projects/${projectId}/daily-logs`, {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title,
          text: transcript,
          notes: transcript,
          durationSec,
          lat: coords?.lat,
          lng: coords?.lng,
          capturedAt,
          logDate: capturedAt.slice(0, 10),
          source: "voice",
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

  const reset = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setTranscript("");
    setDurationSec(0);
    setSubmitState({ kind: "idle" });
  };

  return (
    <div style={{ background: "#0B0D11", minHeight: "100vh", color: "#E8EAEE", padding: 20 }} data-testid="voice-daily-log-page">
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Voice Daily Log</h1>
      <p style={{ color: "#8B92A1", fontSize: 13, marginBottom: 24 }}>
        Tap to talk. Herbie will transcribe and file it on the project.
      </p>

      {!recording && !audioBlob && submitState.kind === "idle" && (
        <button
          data-testid="voice-start-button"
          onClick={start}
          style={{
            width: "100%", height: 88, background: "#1D9E75", color: "#fff", border: "none",
            borderRadius: 18, fontSize: 18, fontWeight: 600, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          }}
        >
          ● Start Recording
        </button>
      )}

      {recording && (
        <div>
          <button
            data-testid="voice-stop-button"
            onClick={stop}
            style={{
              width: "100%", height: 88, background: "#E24B4A", color: "#fff", border: "none",
              borderRadius: 18, fontSize: 18, fontWeight: 600, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            }}
          >
            <span style={{
              width: 14, height: 14, borderRadius: "50%", background: "#fff",
              animation: "vdl-pulse 1s ease-in-out infinite",
            }} />
            Stop
          </button>
          <div
            data-testid="voice-timer"
            style={{ marginTop: 16, fontSize: 32, textAlign: "center", fontVariantNumeric: "tabular-nums" }}
          >
            {fmtSec(durationSec)}
          </div>
          {transcript && (
            <div style={{ marginTop: 16, padding: 12, background: "#14171C", borderRadius: 12, fontSize: 14, color: "#E8EAEE" }}>
              {transcript}
            </div>
          )}
          <style>{`@keyframes vdl-pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 1 } }`}</style>
        </div>
      )}

      {!recording && audioBlob && submitState.kind !== "saved" && submitState.kind !== "queued" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#14171C", borderRadius: 12, padding: 12 }}>
            <audio controls src={audioUrl ?? undefined} style={{ width: "100%" }} data-testid="voice-audio-playback" />
            <div style={{ fontSize: 12, color: "#8B92A1", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>
              Duration {fmtSec(durationSec)}
            </div>
          </div>
          <textarea
            data-testid="voice-transcript-textarea"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Edit transcript before submit…"
            rows={6}
            style={{
              width: "100%", background: "#14171C", color: "#E8EAEE", border: "1px solid #2C2C2A",
              borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 1.4, resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: 12 }}>
            <button
              data-testid="voice-submit-button"
              onClick={submit}
              disabled={submitState.kind === "submitting"}
              style={{
                flex: 1, height: 56, background: "#1D9E75", color: "#fff", border: "none",
                borderRadius: 14, fontSize: 16, fontWeight: 600, cursor: "pointer",
              }}
            >
              {submitState.kind === "submitting" ? "Submitting…" : "Submit"}
            </button>
            <button
              data-testid="voice-redo-button"
              onClick={reset}
              style={{
                flex: 1, height: 56, background: "transparent", color: "#E8EAEE",
                border: "1px solid #2C2C2A", borderRadius: 14, fontSize: 16, cursor: "pointer",
              }}
            >
              Re-record
            </button>
          </div>
          {submitState.kind === "error" && (
            <div style={{ color: "#E24B4A", fontSize: 13 }}>{submitState.message}</div>
          )}
        </div>
      )}

      {submitState.kind === "saved" && (
        <div style={{ background: "#14171C", borderRadius: 14, padding: 20, borderLeft: "3px solid #1D9E75" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#1D9E75" }}>Saved</div>
          <div style={{ fontSize: 13, color: "#8B92A1", marginTop: 6 }}>Daily log filed to project.</div>
          <button
            onClick={reset}
            style={{ marginTop: 14, padding: "10px 16px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}
          >
            New entry
          </button>
        </div>
      )}

      {submitState.kind === "queued" && (
        <div style={{ background: "#14171C", borderRadius: 14, padding: 20, borderLeft: "3px solid #F0997B" }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#F0997B" }}>Queued — will sync when online</div>
          <div style={{ fontSize: 13, color: "#8B92A1", marginTop: 6 }}>{submitState.pending} pending in outbox.</div>
          <button
            onClick={reset}
            style={{ marginTop: 14, padding: "10px 16px", background: "#1D9E75", color: "#fff", border: "none", borderRadius: 10, cursor: "pointer" }}
          >
            New entry
          </button>
        </div>
      )}
    </div>
  );
}
