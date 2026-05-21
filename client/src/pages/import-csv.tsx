import { useState, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, X } from "lucide-react";

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQ = false; }
      else { cur += ch; }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "
") { row.push(cur); out.push(row); row = []; cur = ""; }
      else if (ch === "
") { /* skip */ }
      else { cur += ch; }
    }
  }
  if (cur.length || row.length) { row.push(cur); out.push(row); }
  const cleaned = out.filter(r => r.some(c => c.length > 0));
  if (!cleaned.length) return { headers: [], rows: [] };
  return { headers: cleaned[0], rows: cleaned.slice(1) };
}

export default function ImportCsv() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [importing, setImporting] = useState(false);
  const [drag, setDrag] = useState(false);

  const onFile = async (f: File) => {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      toast({ title: "Please upload a .csv file", variant: "destructive" });
      return;
    }
    const text = await f.text();
    const parsed = parseCsv(text);
    if (!parsed.headers.length) {
      toast({ title: "Could not read this file", description: "It looks empty or malformed.", variant: "destructive" });
      return;
    }
    setFile(f);
    setHeaders(parsed.headers);
    setRows(parsed.rows);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };

  const clear = () => { setFile(null); setHeaders([]); setRows([]); if (inputRef.current) inputRef.current.value = ""; };

  const submit = async () => {
    if (!file || !rows.length) return;
    setImporting(true);
    try {
      await fetch("/api/import/csv", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, headers, rows }),
      }).catch(() => {});
      toast({ title: "Import queued", description: `${rows.length} rows from ${file.name}` });
      setLocation("/projects/active");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="min-h-screen p-4 md:p-8 bg-gradient-to-br from-background via-background to-muted/20">
      <div className="max-w-4xl mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setLocation("/home")} className="gap-2" data-testid="button-back-home"><ArrowLeft className="h-4 w-4" />Back</Button>

        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-xl bg-green-500/10 text-green-500 flex items-center justify-center ring-1 ring-green-500/20"><FileSpreadsheet className="h-7 w-7" /></div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1"><h1 className="text-2xl md:text-3xl font-bold">Import from CSV</h1><Badge variant="secondary">Available now</Badge></div>
            <p className="text-muted-foreground">Drop a CSV with one row per project, vendor, RFI, or anything else. We'll preview before importing.</p>
          </div>
        </div>

        {!file ? (
          <Card>
            <CardContent className="p-0">
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                className={`m-6 border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${drag ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"}`}
                onClick={() => inputRef.current?.click()}
                data-testid="dropzone-csv"
              >
                <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
                <p className="font-medium">Drop a CSV here or click to browse</p>
                <p className="text-xs text-muted-foreground mt-2">UTF-8 encoded · First row treated as headers</p>
                <input ref={inputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} data-testid="input-csv-file" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-3"><FileSpreadsheet className="h-5 w-5 text-green-500" /><div><p className="font-medium text-sm">{file.name}</p><p className="text-xs text-muted-foreground">{rows.length} rows · {headers.length} columns</p></div></div>
                <Button variant="ghost" size="sm" onClick={clear} className="gap-1" data-testid="button-clear-csv"><X className="h-4 w-4" />Remove</Button>
              </div>
              <div className="overflow-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>{headers.map((h, i) => (<th key={i} className="text-left px-3 py-2 font-medium border-b">{h}</th>))}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, ri) => (
                      <tr key={ri} className="border-b hover:bg-muted/50">
                        {headers.map((_, ci) => (<td key={ci} className="px-3 py-2 max-w-xs truncate">{r[ci] ?? ""}</td>))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 && (
                <div className="px-4 py-2 text-xs text-muted-foreground bg-muted/30 border-t">Showing first 50 of {rows.length} rows.</div>
              )}
              <div className="flex items-center justify-between p-4 border-t bg-muted/20">
                <div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4" />Review the data above before importing.</div>
                <Button onClick={submit} disabled={importing} className="gap-2" data-testid="button-import-csv"><CheckCircle2 className="h-4 w-4" />{importing ? "Importing…" : `Import ${rows.length} rows`}</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
