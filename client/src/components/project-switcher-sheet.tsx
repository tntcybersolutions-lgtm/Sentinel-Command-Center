import { useEffect, useState } from "react";
import * as haptics from "@/lib/haptics";

export type ProjectSummary = {
  id: string; name: string;
  status: "active" | "at-risk" | "complete";
  lastActivityAt?: number; role?: string;
};

const ACTIVE_KEY = "sentinel-active-project";

function statusColor(s: ProjectSummary["status"]): string {
  return s === "active" ? "#1D9E75" : s === "at-risk" ? "#FAC775" : "#5F5E5A";
}
function ageLabel(ts?: number): string {
  if (!ts) return "—";
  const d = Date.now() - ts;
  if (d < 60_000) return "just now";
  if (d < 3600_000) return Math.floor(d / 60_000) + "m ago";
  if (d < 86_400_000) return Math.floor(d / 3600_000) + "h ago";
  return Math.floor(d / 86_400_000) + "d ago";
}
export function getActiveProjectId(): string | null {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}
export function setActiveProjectId(id: string): void {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("sentinel-active-project", { detail: id }));
  }
}

export default function ProjectSwitcherSheet({
  open, onClose,
}: { open: boolean; onClose: () => void }) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const activeId = getActiveProjectId();

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/projects")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (Array.isArray(data)) setProjects(data);
        else if (data?.projects) setProjects(data.projects);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  function pick(id: string) {
    haptics.select(); setActiveProjectId(id); onClose();
  }

  return (
    <>
      <div onClick={onClose}
        style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 90 }} />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0,
        background: "var(--bg-2, #14171C)", color: "var(--text-1, #E8EAEE)",
        borderTopLeftRadius: 22, borderTopRightRadius: 22,
        padding: "14px 0 28px", zIndex: 100, maxHeight: "80vh", overflowY: "auto",
      }}>
        <div style={{ width: 38, height: 4, borderRadius: 2, background: "var(--border-1, #2C2C2A)", margin: "0 auto 14px" }} />
        <div style={{ padding: "0 22px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>Switch project</div>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: "var(--text-2, #8B92A1)", fontSize: 12, cursor: "pointer" }}>Close</button>
        </div>
        {loading && <div style={{ padding: "30px 22px", textAlign: "center", color: "var(--text-2, #8B92A1)", fontSize: 13 }}>Loading projects…</div>}
        {!loading && projects.length === 0 && (
          <div style={{ padding: "30px 22px", textAlign: "center", color: "var(--text-2, #8B92A1)", fontSize: 13 }}>
            No projects yet. Create one from desktop.
          </div>
        )}
        <div style={{ padding: "0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {projects.map((p) => {
            const isActive = p.id === activeId;
            return (
              <button key={p.id} onClick={() => pick(p.id)}
                style={{
                  background: isActive ? "var(--bg-3, #1C2128)" : "transparent",
                  border: isActive ? "0.5px solid var(--accent-1, #1D9E75)" : "0.5px solid transparent",
                  borderRadius: 14, padding: "12px 14px",
                  display: "flex", alignItems: "center", gap: 12,
                  textAlign: "left", cursor: "pointer",
                  color: "inherit", font: "inherit",
                }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: statusColor(p.status), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-2, #8B92A1)", marginTop: 2 }}>
                    {p.role ?? "Member"} · {ageLabel(p.lastActivityAt)}
                  </div>
                </div>
                {isActive && <span style={{ fontSize: 11, color: "var(--accent-1, #1D9E75)", fontWeight: 500 }}>Active</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
