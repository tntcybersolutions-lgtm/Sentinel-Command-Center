/**
 * Sprint M6 — Mobile RFI capture
 *
 * Field-team page for drafting an RFI in the field with voice dictation
 * support. POSTs to /api/rfi/draft (the existing rfi-draft.routes.ts) so
 * Herbie's draft-then-approve flow takes over the moment the RFI is queued.
 *
 * Route: /m-rfi
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Send, FileText, AlertTriangle, ChevronLeft } from "lucide-react";
import { apiFetch } from "@/lib/offline-queue";
import { useProjectContext } from "@/nav/project-context";
import { SafeArea } from "@/components/ui/safe-area";
import { CardTiered } from "@/components/ui/card-tiered";
import { VoiceMicButton } from "@/components/voice-mic-button";
import MobileTabBar from "@/components/mobile/m-tab-bar";

type Priority = "low" | "normal" | "high" | "urgent";

const PRIORITIES: { id: Priority; label: string }[] = [
  { id: "low", label: "Low" },
  { id: "normal", label: "Normal" },
  { id: "high", label: "High" },
  { id: "urgent", label: "Urgent" },
];

export default function MobileRfiPage() {
  const [, setLocation] = useLocation();
  const { selectedProjectId } = useProjectContext();
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [priority, setPriority] = useState<Priority>("normal");
  const [rfiNumber, setRfiNumber] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitOk, setSubmitOk] = useState(false);

  const canSubmit = !!selectedProjectId && subject.trim().length > 0 && question.trim().length > 0;

  const draftMutation = useMutation({
    mutationFn: async () => {
      setSubmitError(null);
      const r = await apiFetch("/api/rfi/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          rfiNumber: rfiNumber.trim() || undefined,
          subject: subject.trim(),
          question: question.trim(),
          priority,
          draftedBy: localStorage.getItem("sentinel-user-name") || undefined,
        }),
      });
      if (r.status === 202) return { queued: true };
      if (!r.ok) {
        let msg = `HTTP ${r.status}`;
        try { const j = await r.json(); if (j?.error) msg = j.error; } catch { /* */ }
        throw new Error(msg);
      }
      return await r.json();
    },
    onSuccess: () => {
      setSubmitOk(true);
      setSubject(""); setQuestion(""); setRfiNumber(""); setPriority("normal");
      setTimeout(() => setSubmitOk(false), 3500);
    },
    onError: (e) => setSubmitError((e as Error)?.message || "Submit failed"),
  });

  return (
    <SafeArea sides={["top", "bottom"]} className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 flex items-center gap-2">
        <button type="button" onClick={() => setLocation("/m-home")} aria-label="Back" className="rounded p-1 hover:bg-slate-800">
          <ChevronLeft size={20} />
        </button>
        <FileText size={20} className="text-emerald-400" />
        <div>
          <h1 className="text-lg font-bold tracking-tight">New RFI</h1>
          <p className="text-xs text-slate-400">Goes to Herbie for review then routes to the design team</p>
        </div>
      </header>

      <main className="px-4 py-4 space-y-4 max-w-3xl mx-auto pb-24">
        {!selectedProjectId && (
          <div className="rounded-lg bg-amber-950/40 border border-amber-900/60 px-3 py-2 text-xs text-amber-200 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-[2px] shrink-0" />
            <span>Pick a project from the top picker before drafting an RFI. The server needs a projectId.</span>
          </div>
        )}

        {submitOk && (
          <div data-testid="m-rfi-success" className="rounded-lg bg-emerald-950/40 border border-emerald-900/60 px-3 py-2 text-xs text-emerald-200">
            RFI drafted and queued for review. Herbie will route it once approved.
          </div>
        )}

        <CardTiered tier="secondary" className="p-4 space-y-3">
          <label className="block">
            <span className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Subject *</span>
            <input data-testid="m-rfi-subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm focus:outline-none focus:border-emerald-600"
              placeholder="Conflict between mech and electrical at GL-4 / L-2" maxLength={300} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-slate-400 mb-1">RFI # (opt.)</span>
              <input data-testid="m-rfi-number" type="text" value={rfiNumber} onChange={(e) => setRfiNumber(e.target.value)}
                className="w-full rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm" placeholder="RFI-0123" maxLength={40} />
            </label>
            <label className="block">
              <span className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Priority</span>
              <select data-testid="m-rfi-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm">
                {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
          </div>
        </CardTiered>

        <CardTiered tier="secondary" className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="block text-xs uppercase tracking-wide text-slate-400">Question *</span>
            <VoiceMicButton onTranscript={(text, meta) => {
              if (!meta.success || !text) return;
              setQuestion((q) => (q ? q + " " + text : text));
            }} />
          </div>
          <textarea data-testid="m-rfi-question" rows={8} value={question} onChange={(e) => setQuestion(e.target.value)}
            className="w-full min-h-[180px] rounded bg-slate-900 border border-slate-800 px-3 py-2 text-sm text-slate-100"
            placeholder="What needs to be answered? Be specific — drawing reference, location, what you're seeing, what you need confirmed…"
            maxLength={8000} />
        </CardTiered>

        {submitError && (
          <div className="rounded-lg bg-rose-950/40 border border-rose-900/60 px-3 py-2 text-xs text-rose-300 flex items-start gap-2">
            <AlertTriangle size={14} className="mt-[2px] shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 flex gap-2">
          <button data-testid="m-rfi-submit" onClick={() => draftMutation.mutate()} disabled={!canSubmit || draftMutation.isPending}
            className="flex-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 px-3 py-2 text-sm font-semibold flex items-center justify-center gap-1 disabled:opacity-50">
            <Send size={14} /> {draftMutation.isPending ? "Sending…" : "Submit RFI"}
          </button>
        </div>
      </main>
    <MobileTabBar active="home" />
    </SafeArea>
  );
}
