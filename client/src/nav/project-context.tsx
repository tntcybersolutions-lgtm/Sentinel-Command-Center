import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface ProjectContextValue {
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  mode: "portfolio" | "project";
  selectProject: (id: string, name: string) => void;
  clearProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  selectedProjectId: null,
  selectedProjectName: null,
  mode: "portfolio",
  selectProject: () => {},
  clearProject: () => {},
});

const STORAGE_KEY = "sentinel.selectedProject";

function loadStoredProject(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveProject(id: string, name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }));
  } catch {}
}

function clearStoredProject() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export function ProjectContextProvider({ children }: { children: ReactNode }) {
  const stored = loadStoredProject();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(stored?.id ?? null);
  const [selectedProjectName, setSelectedProjectName] = useState<string | null>(stored?.name ?? null);

  const selectProject = useCallback((id: string, name: string) => {
    setSelectedProjectId(id);
    setSelectedProjectName(name);
    saveProject(id, name);
  }, []);

  const clearProject = useCallback(() => {
    setSelectedProjectId(null);
    setSelectedProjectName(null);
    clearStoredProject();
  }, []);

  const mode = selectedProjectId ? "project" : "portfolio";

  return (
    <ProjectContext.Provider value={{ selectedProjectId, selectedProjectName, mode, selectProject, clearProject }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return useContext(ProjectContext);
}
