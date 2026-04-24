import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, Upload, Play, Square, CheckCircle2, AlertTriangle,
  Clock, CloudSun, HardHat, Users, Wrench, Package,
  FileText, ShieldAlert, RefreshCcw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface LaborEntry { trade?: string; count?: number; hours?: number; }
interface MaterialEntry { item?: string; qty?: string; }
interface DailyLogDraft {
  weather?: string | null;
  workPerformed?: string[];
  labor?: LaborEntry[];
  equipment?: string[];
  materials?: MaterialEntry[];
  issues?: string[];
  safetyNotes?: string[];
  visitors?: string[];
  notes?: string | null;
}
interface VoiceLogResult {
  dailyLogId: string;
  transcript: string;
  draft: DailyLogDraft;
  stubbed: { transcribe: boolean; extract: boolean };
}

function fmtDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function RecordingPulse() {
  return (
    <span className="relative flex h-3 w-3">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
    </span>
  );
}

export default function VoiceDailyLogPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const projectId = "demo-project";
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [result, setResult] = useState<VoiceLogResult | null>(null);

  const uploadMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const form = new FormData();
      form.append("audio", blob, "memo.webm");
      form.append("logDate", new Date().toISOString().slice(0, 10));
      const res = await fetch(`/api/projects/${projectId}/daily-logs/voice`, {
        method: "POST", body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Upload failed");
      }
      return res.json() as Promise<VoiceLogResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setAudioBlob(null);
      setAudioUrl(null);
      qc.invalidateQueries({ queryKey: ["daily-logs", projectId] });
      toast({
        title: data.stubbed.transcribe ? "Log saved (stub mode)" : "Voice log processed",
        description: data.stubbed.transcribe
          ? "No Whisper key configured."
          : data.transcript.slice(0, 80),
      });
    },
    onError: (e: Error) => {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    },
  });

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setRecording(true);
    } catch {
      toast({ title: "Microphone access denied", variant: "destructive" });
    }
  }, [toast]);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Voice Daily Log</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Record a voice memo — Herbie transcribes and structures it automatically.
          </p>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <Clock className="h-3 w-3" />{fmtDate(new Date())}
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Record or Upload Memo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {recording ? (
              <Button variant="destructive" size="sm" onClick={stopRecording} className="gap-2">
                <RecordingPulse />
                <Square className="h-4 w-4" />
                Stop Recording
              </Button>
            ) : (
              <Button
                variant="outline" size="sm" onClick={startRecording}
                disabled={uploadMutation.isPending} className="gap-2"
              >
                <Mic className="h-4 w-4 text-red-500" />
                Start Recording
              </Button>
            )}
            <label className="cursor-pointer">
              <input
                type="file" accept="audio/*" className="hidden"
                onChange={handleFileUpload}
                disabled={recording || uploadMutation.isPending}
              />
              <Button variant="ghost" size="sm" asChild className="gap-2 pointer-events-none">
                <span><Upload className="h-4 w-4" />Upload Audio</span>
              </Button>
            </label>
          </div>

          {audioUrl && (
            <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
              <Play className="h-4 w-4 text-primary shrink-0" />
              <audio controls src={audioUrl} className="flex-1 h-8" />
              <Button
                size="sm"
                onClick={() => audioBlob && uploadMutation.mutate(audioBlob)}
                disabled={uploadMutation.isPending}
                className="gap-2"
              >
                {uploadMutation.isPending
                  ? <RefreshCcw className="h-4 w-4 animate-spin" />
                  : <CheckCircle2 className="h-4 w-4" />}
                {uploadMutation.isPending ? "Processing..." : "Submit to Herbie"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <Card className="border-green-200 bg-green-50/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                Log Processed
              </CardTitle>
              {result.stubbed.transcribe && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Stub mode
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Transcript</p>
              <p className="text-sm italic text-foreground/80 leading-relaxed">
                "{result.transcript}"
              </p>
            </div>
            <Separator />
            <DraftDisplay draft={result.draft} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DraftDisplay({ draft }: { draft: DailyLogDraft }) {
  const sections = [
    {
      icon: <CloudSun className="h-4 w-4 text-sky-500" />, label: "Weather",
      content: draft.weather ? <p className="text-sm">{draft.weather}</p> : null,
    },
    {
      icon: <HardHat className="h-4 w-4 text-amber-500" />, label: "Work Performed",
      content: draft.workPerformed?.length ? (
        <ul className="list-disc list-inside text-sm space-y-0.5">
          {draft.workPerformed.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      ) : null,
    },
    {
      icon: <Users className="h-4 w-4 text-blue-500" />, label: "Labor",
      content: draft.labor?.length ? (
        <div className="flex flex-wrap gap-2">
          {draft.labor.map((l, i) => (
            <Badge key={i} variant="secondary" className="text-xs">
              {l.trade} - {l.count} workers @ {l.hours}h
            </Badge>
          ))}
        </div>
      ) : null,
    },
    {
      icon: <Wrench className="h-4 w-4 text-purple-500" />, label: "Equipment",
      content: draft.equipment?.length ? (
        <div className="flex flex-wrap gap-2">
          {draft.equipment.map((eq, i) => (
            <Badge key={i} variant="outline" className="text-xs">{eq}</Badge>
          ))}
        </div>
      ) : null,
    },
    {
      icon: <Package className="h-4 w-4 text-orange-500" />, label: "Materials",
      content: draft.materials?.length ? (
        <ul className="list-disc list-inside text-sm space-y-0.5">
          {draft.materials.map((m, i) => <li key={i}>{m.item} - {m.qty}</li>)}
        </ul>
      ) : null,
    },
    {
      icon: <AlertTriangle className="h-4 w-4 text-red-500" />, label: "Issues",
      content: draft.issues?.length ? (
        <ul className="list-disc list-inside text-sm space-y-0.5 text-red-700">
          {draft.issues.map((is, i) => <li key={i}>{is}</li>)}
        </ul>
      ) : null,
    },
    {
      icon: <ShieldAlert className="h-4 w-4 text-yellow-500" />, label: "Safety Notes",
      content: draft.safetyNotes?.length ? (
        <ul className="list-disc list-inside text-sm space-y-0.5">
          {draft.safetyNotes.map((s, i) => <li key={i}>{s}</li>)}
        </ul>
      ) : null,
    },
    {
      icon: <FileText className="h-4 w-4 text-gray-500" />, label: "Notes",
      content: draft.notes ? <p className="text-sm">{draft.notes}</p> : null,
    },
  ].filter((s) => s.content !== null);

  if (!sections.length) {
    return (
      <p className="text-sm text-muted-foreground">No structured fields extracted.</p>
    );
  }

  return (
    <div className="space-y-3">
      {sections.map((s) => (
        <div key={s.label}>
          <div className="flex items-center gap-1.5 mb-1">
            {s.icon}
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {s.label}
            </span>
          </div>
          {s.content}
        </div>
      ))}
    </div>
  );
}
