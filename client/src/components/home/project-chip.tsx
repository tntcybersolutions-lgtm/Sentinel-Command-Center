import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Briefcase, ChevronDown, Plus, Search, X, Globe } from "lucide-react";

const LS_KEY = "sentinel.activeProjectId";
const EVT = "sentinel:active-project-changed";

interface ProjectLite { id: string; name: string; number?: string; status?: string; }

export function getActiveProjectId(): string | null {
  try { return localStorage.getItem(LS_KEY); } catch { return null; }
}

export function setActiveProjectId(id: string | null) {
  try {
    if (id) localStorage.setItem(LS_KEY, id);
    else localStorage.removeItem(LS_KEY);
    window.dispatchEvent(new CustomEvent(EVT, { detail: { id } }));
  } catch {}
}

export function useActiveProjectId(): string | null {
  const [id, setId] = useState<string | null>(() => getActiveProjectId());
  useEffect(() => {
    const onChange = (e: Event) => setId((e as CustomEvent).detail?.id ?? null);
    window.addEventListener(EVT, onChange);
    return () => window.removeEventListener(EVT, onChange);
  }, []);
  return id;
}

export function ProjectChip() {
  const [, setLocation] = useLocation();
  const activeId = useActiveProjectId();
  const [filter, setFilter] = useState("");

  const { data: projects = [] } = useQuery<ProjectLite[]>({
    queryKey: ["/api/projects"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/projects");
        if (!r.ok) return [];
        const j = await r.json();
        if (Array.isArray(j)) return j;
        if (j && Array.isArray(j.data)) return j.data;
        if (j && Array.isArray(j.projects)) return j.projects;
        return [];
      } catch { return []; }
    },
    staleTime: 60_000,
  });

  const active = projects.find((p) => p.id === activeId) || null;
  const visible = filter.trim()
    ? projects.filter((p) =>
        (p.name || "").toLowerCase().includes(filter.toLowerCase()) ||
        (p.number || "").toLowerCase().includes(filter.toLowerCase())
      )
    : projects;

  return (
    <div className="inline-flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="gap-2 h-9 max-w-full"
            data-testid="button-project-chip"
          >
            {active ? <Briefcase className="h-4 w-4 text-muted-foreground shrink-0" /> : <Globe className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className="text-xs text-muted-foreground hidden sm:inline">Working on:</span>
            <span className="font-medium truncate max-w-[14rem]">
              {active ? active.name : "All projects"}
            </span>
            {active?.number && (
              <Badge variant="secondary" className="font-mono text-[10px] hidden md:inline-flex">{active.number}</Badge>
            )}
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </Button>
        </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-h-[28rem] overflow-hidden p-0">
        <div className="p-2 border-b">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-muted/50">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              autoFocus
              type="text"
              placeholder="Find project…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full bg-transparent outline-none text-sm"
              data-testid="input-project-filter"
            />
          </div>
        </div>
        <DropdownMenuItem
          onSelect={() => { setActiveProjectId(null); setLocation("/"); }}
          className={`flex items-center gap-2 cursor-pointer ${!active ? "bg-accent/40" : ""}`}
          data-testid="menu-clear-project"
        >
          <Globe className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1">
            <p className="font-medium text-sm">All projects (portfolio view)</p>
            <p className="text-[10px] text-muted-foreground">Show data across every project</p>
          </div>
          {!active && <Badge variant="secondary" className="text-[10px]">active</Badge>}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground py-1.5">
          Projects ({visible.length})
        </DropdownMenuLabel>
        <div className="max-h-72 overflow-auto">
          {visible.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">No projects match.</div>
          )}
          {visible.slice(0, 50).map((p) => (
            <DropdownMenuItem
              key={p.id}
              onSelect={() => { setActiveProjectId(p.id); setLocation(`/projects/${p.id}`); }}
              className="flex items-center justify-between gap-3 cursor-pointer"
              data-testid={`menu-project-${p.id}`}
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{p.name}</p>
                {p.number && <p className="font-mono text-[10px] text-muted-foreground">{p.number}</p>}
              </div>
              {p.status && <Badge variant="secondary" className="text-[10px]">{p.status}</Badge>}
            </DropdownMenuItem>
          ))}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => setLocation("/projects/new")}
          className="gap-2 text-primary cursor-pointer"
          data-testid="menu-new-project"
        >
          <Plus className="h-4 w-4" />
          New project…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    {active && (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setActiveProjectId(null)}
        className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
        title="Clear active project"
        data-testid="button-clear-project"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    )}
    </div>
  );
}

export default ProjectChip;
