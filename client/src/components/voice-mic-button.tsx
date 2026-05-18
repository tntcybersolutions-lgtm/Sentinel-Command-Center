/**
 * Sprint M6 — Reusable Hold-to-Speak voice mic
 *
 * Same MediaRecorder pattern that lives inline in daily-log.tsx, factored
 * out so Punch + RFI forms can drop it next to any text field. POSTs the
 * recorded blob to /api/transcribe and forwards the returned text to the
 * caller via `onTranscript`. If transcription is unavailable, fires
 * `onTranscript("")` with `success=false` so the host can decide whether
 * to surface a fallback like "[voice memo — type to transcribe]".
 *
 * Usage:
 *   <VoiceMicButton onTranscript={(text) => dispatch({ description: (draft.description ?? "") + (draft.description ? " " : "") + text })} />
 *
 * Triggers:
 *   - mousedown / touchstart  → startRecording
 *   - mouseup / touchend / mouseleave → stopRecording
 *   - aria-pressed reflects the recording state for screen readers
 *
 * iOS Safari notes:
 *   - MediaRecorder doesn't accept "audio/webm" reliably; we let the
 *     browser pick the default mimeType and tag the FormData filename
 *     accordingly. The server side (/api/transcribe) is expected to
 *     sniff the upload.
 */

import { useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";

export interface VoiceMicButtonProps {
  /** Fired with the transcript (possibly empty) once the server replies. */
  onTranscript: (text: string, meta: { success: boolean; error?: string }) => void;
  /** Optional override of the transcription endpoint. Defaults to /api/transcribe. */
  endpoint?: string;
  /** Compact (icon-only) variant for tight form rows. */
  compact?: boolean;
  /** Disable the mic (e.g. while a form is submitting). */
  disabled?: boolean;
  /** aria-label for the button. */
  label?: string;
  className?: string;
}

export function VoiceMicButton({
  onTranscript,
  endpoint = "/api/transcribe",
  compact = false,
  disabled = false,
  label = "Hold to speak",
  className = "",
}: VoiceMicButtonProps) {
  const [recording, setRecording] = useState(false);
  const [pending, setPending] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const start = async () => {
    if (recording || pending || disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        // Always tear down the stream — leaking the mic indicator is bad UX.
        try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
        streamRef.current = null;
        const mimeType = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 200) {
          // No meaningful audio captured (tap, not hold)
          setRecording(false);
          setPending(false);
          return;
        }
        setPending(true);
        try {
          const fd = new FormData();
          const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("ogg") ? "ogg" : "webm";
          fd.append("audio", blob, `memo.${ext}`);
          const r = await fetch(endpoint, { method: "POST", body: fd });
          if (!r.ok) {
            onTranscript("", { success: false, error: `HTTP ${r.status}` });
            return;
          }
          const { text } = (await r.json()) as { text?: string };
          onTranscript((text || "").trim(), { success: true });
        } catch (e) {
          onTranscript("", { success: false, error: (e as Error)?.message || "transcribe failed" });
        } finally {
          setPending(false);
          setRecording(false);
        }
      };
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      console.error("[voice-mic-button] getUserMedia failed", e);
      onTranscript("", { success: false, error: (e as Error)?.message || "mic permission denied" });
      setRecording(false);
    }
  };

  const stop = () => {
    if (!recording) return;
    try { recorderRef.current?.stop(); } catch { /* ignore */ }
    recorderRef.current = null;
  };

  const Icon = pending ? Loader2 : recording ? MicOff : Mic;
  const ariaPressed = recording || pending;
  const baseClass = compact
    ? "inline-flex items-center justify-center rounded-md px-2 py-1.5"
    : "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold";

  const stateClass = pending
    ? "bg-slate-800 text-slate-300 cursor-wait"
    : recording
      ? "bg-rose-600 hover:bg-rose-500 text-white"
      : "bg-slate-700 hover:bg-slate-600 text-slate-100";

  return (
    <button
      type="button"
      data-testid="voice-mic-button"
      aria-label={label}
      aria-pressed={ariaPressed}
      disabled={disabled || pending}
      onMouseDown={(e) => { e.preventDefault(); void start(); }}
      onMouseUp={stop}
      onMouseLeave={() => { if (recording) stop(); }}
      onTouchStart={(e) => { e.preventDefault(); void start(); }}
      onTouchEnd={(e) => { e.preventDefault(); stop(); }}
      onTouchCancel={stop}
      className={`${baseClass} ${stateClass} ${className} disabled:opacity-50`}
    >
      <Icon size={compact ? 14 : 12} className={pending ? "animate-spin" : undefined} />
      {!compact && <span>{pending ? "Transcribing…" : recording ? "Recording…" : label}</span>}
    </button>
  );
}

export default VoiceMicButton;
