import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  Minimize2,
  Maximize2,
  X,
  Building2,
  ChevronRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Default brand mark — swap by dropping your .webp/.png at client/src/assets/blackhawk-logo.* and editing this import.
import logoImg from "@/assets/blackhawk-logo.svg";
import { navConfig, getNavItemsForMode } from "@/nav/navConfig";
import type { NavGroupConfig, NavItemConfig, NavCounts } from "@/nav/navConfig";
import { useProjectContext } from "@/nav/project-context";
import { projectWorkspaceModules } from "@/nav/projectWorkspaceConfig";

const STORAGE_KEY_GROUP = "sentinel.groupOpen";
const STORAGE_KEY_COLLAPSED = "sentinel.sidebarCollapsed";

function loadGroupState(groupIds: string[]): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GROUP);
    if (raw) {
      const parsed = JSON.parse(raw);
      const defaults: Record<string, boolean> = {};
      for (const k of groupIds) defaults[k] = true;
      return { ...defaults, ...parsed };
    }
  } catch {}
  const defaults: Record<string, boolean> = {};
  for (const k of groupIds) defaults[k] = true;
  return defaults;
}

function saveGroupState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY_GROUP, JSON.stringify(state));
  } catch {}
}

function loadCollapsedState(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COLLAPSED);
    if (raw !== null) return JSON.parse(raw);
  } catch {}
  return false;
}

function saveCollapsedState(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY_COLLAPSED, JSON.stringify(collapsed));
  } catch {}
}

function NavGroup({
  group,
  isOpen,
  onToggle,
  location,
  counts,
  isIconOnly,
}: {
  group: NavGroupConfig;
  isOpen: boolean;
  onToggle: () => void;
  location: string;
  counts: NavCounts | null;
  isIconOnly: boolean;
}) {
  const GroupIcon = group.icon;

  if (isIconOnly) {
    return (
      <div className="px-1 py-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center py-1">
              <GroupIcon className="h-3 w-3 text-sidebar-foreground/40" />
            </div>
          </TooltipTrigger>
          <TooltipContent side="right" className="font-semibold">
            {group.label}
          </TooltipContent>
        </Tooltip>
        <SidebarMenu>
          {group.items.map((item) => {
            const ItemIcon = item.icon;
            const badgeCount = item.badgeKey && counts ? counts[item.badgeKey] : 0;
            return (
              <SidebarMenuItem key={item.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.route || location.startsWith(item.route + "/")}
                      data-testid={`nav-${item.id}`}
                    >
                      <Link href={item.route}>
                        <div className="relative">
                          <ItemIcon className="h-4 w-4" />
                          {badgeCount > 0 && (
                            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive text-[7px] text-destructive-foreground flex items-center justify-center font-bold">
                              {badgeCount > 9 ? "9+" : badgeCount}
                            </span>
                          )}
                        </div>
                      </Link>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <span>{item.label}</span>
                    {badgeCount > 0 && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        {badgeCount}
                      </Badge>
                    )}
                  </TooltipContent>
                </Tooltip>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </div>
    );
  }

  const contentRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (contentRef.current) {
      setMeasuredHeight(contentRef.current.scrollHeight);
    }
  }, [group.items.length]);

  return (
    <div className="px-2 py-1">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-sidebar-foreground/60 hover-elevate transition-colors duration-150"
        data-testid={`nav-group-${group.id}`}
      >
        <ChevronDown
          className="h-3 w-3 shrink-0 transition-transform duration-200"
          style={{ transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
        <span className="flex-1 text-left tracking-wider uppercase">{group.label}</span>
        <span className="text-[10px] text-sidebar-foreground/40">{group.items.length}</span>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height,opacity] duration-200 ease-in-out"
        style={{
          maxHeight: isOpen ? (measuredHeight ?? 1000) : 0,
          opacity: isOpen ? 1 : 0,
        }}
        aria-hidden={!isOpen}
      >
        <SidebarMenu>
          {group.items.map((item) => {
            const ItemIcon = item.icon;
            const badgeCount = item.badgeKey && counts ? counts[item.badgeKey] : 0;
            return (
              <SidebarMenuItem key={item.id}>
                <SidebarMenuButton
                  asChild
                  isActive={location === item.route || location.startsWith(item.route + "/")}
                  data-testid={`nav-${item.id}`}
                  tabIndex={isOpen ? 0 : -1}
                >
                  <Link href={item.route}>
                    <ItemIcon className="h-4 w-4" />
                    <span className="flex-1">{item.label}</span>
                    {badgeCount > 0 && (
                      <Badge variant="destructive" className="text-xs" data-testid={`badge-${item.id}`}>
                        {badgeCount}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </div>
    </div>
  );
}

function ProjectSelector({ isIconOnly }: { isIconOnly: boolean }) {
  const { selectedProjectId, selectedProjectName, mode, selectProject, clearProject } = useProjectContext();
  const [, setLocation] = useLocation();

  const { data: projects } = useQuery<{ id: string; name: string; projectNumber: string; status: string }[]>({
    queryKey: ["/api/projects"],
    refetchInterval: 60000,
  });

  const handleSelect = (value: string) => {
    if (value === "__all__") {
      clearProject();
      setLocation("/dashboard");
    } else {
      const proj = projects?.find((p) => p.id === value);
      if (proj) {
        selectProject(proj.id, proj.name);
        setLocation(`/projects/${proj.id}/overview`);
      }
    }
  };

  if (isIconOnly) {
    return (
      <div className="px-2 py-2 border-b border-sidebar-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={mode === "project" ? "default" : "ghost"}
              size="icon"
              onClick={() => {
                if (mode === "project") {
                  clearProject();
                  setLocation("/dashboard");
                }
              }}
              data-testid="button-project-selector-icon"
            >
              <Building2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {mode === "project" ? selectedProjectName : "All Projects"}
          </TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <div className="px-3 py-2 border-b border-sidebar-border">
      <label className="text-[10px] font-semibold text-sidebar-foreground/50 tracking-wider uppercase mb-1 block">
        Project Context
      </label>
      <Select value={selectedProjectId ?? "__all__"} onValueChange={handleSelect}>
        <SelectTrigger
          className="h-8 text-xs bg-sidebar-accent/30 border-sidebar-border"
          data-testid="select-project-context"
        >
          <SelectValue placeholder="All Projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__" data-testid="option-all-projects">
            All Projects (Portfolio)
          </SelectItem>
          {projects?.map((p) => (
            <SelectItem key={p.id} value={p.id} data-testid={`option-project-${p.id}`}>
              {p.projectNumber ? `${p.projectNumber} — ` : ""}{p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AppSidebar() {
  const [location] = useLocation();
  const { state: sidebarState, toggleSidebar } = useSidebar();
  const isIconOnly = sidebarState === "collapsed";
  const { selectedProjectId, mode } = useProjectContext();

  const [searchQuery, setSearchQuery] = useState("");

  const allGroupIds = useMemo(() => navConfig.map((g) => g.id), []);
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>(() => loadGroupState(allGroupIds));

  useEffect(() => {
    const shouldCollapse = loadCollapsedState();
    if (shouldCollapse && sidebarState === "expanded") {
      toggleSidebar();
    }
  }, []);

  const { data: navCounts } = useQuery<NavCounts>({
    queryKey: ["/api/nav-counts", selectedProjectId],
    queryFn: async () => {
      const params = selectedProjectId ? `?projectId=${selectedProjectId}` : "";
      const res = await fetch(`/api/nav-counts${params}`);
      if (!res.ok) throw new Error("Failed to fetch nav counts");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const toggleGroup = useCallback((key: string) => {
    setGroupOpen((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      saveGroupState(next);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const k of allGroupIds) next[k] = false;
    setGroupOpen(next);
    saveGroupState(next);
  }, [allGroupIds]);

  const expandAll = useCallback(() => {
    const next: Record<string, boolean> = {};
    for (const k of allGroupIds) next[k] = true;
    setGroupOpen(next);
    saveGroupState(next);
  }, [allGroupIds]);

  const handleSidebarCollapse = useCallback(() => {
    const willCollapse = sidebarState === "expanded";
    saveCollapsedState(willCollapse);
    toggleSidebar();
  }, [sidebarState, toggleSidebar]);

  const filteredGroups = useMemo(() => {
    let groups = getNavItemsForMode(mode, "gc");
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      groups = groups
        .map((g) => ({
          ...g,
          items: g.items.filter(
            (item) =>
              item.label.toLowerCase().includes(q) ||
              g.label.toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.items.length > 0);
    }
    return groups;
  }, [mode, searchQuery]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        {isIconOnly ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center">
                <img
                  src={logoImg}
                  alt="BlackHawk Construction"
                  className="h-6 w-auto"
                  data-testid="img-sidebar-logo"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">Sentinel Command Center</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <img
                src={logoImg}
                alt="BlackHawk Construction"
                className="h-10 w-auto"
                data-testid="img-sidebar-logo"
              />
            </div>
            <div className="mt-2">
              <span
                className="text-xs font-bold tracking-wider text-sidebar-foreground/80"
                data-testid="text-sentinel-label"
              >
                SENTINEL
              </span>
            </div>
          </>
        )}
      </SidebarHeader>

      <ProjectSelector isIconOnly={isIconOnly} />

      <div className="border-b border-sidebar-border px-3 py-2">
        <div className={`flex items-center ${isIconOnly ? "justify-center" : "gap-1"}`}>
          {!isIconOnly && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={collapseAll}
                    data-testid="nav-collapse-all"
                    aria-label="Collapse all sections"
                  >
                    <Minimize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Collapse All</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={expandAll}
                    data-testid="nav-expand-all"
                    aria-label="Expand all sections"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">Expand All</TooltipContent>
              </Tooltip>

              <div className="flex-1" />
            </>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleSidebarCollapse}
                data-testid="nav-sidebar-collapse"
                aria-label={isIconOnly ? "Expand sidebar" : "Collapse sidebar"}
              >
                {isIconOnly ? (
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side={isIconOnly ? "right" : "bottom"}>
              {isIconOnly ? "Expand Sidebar" : "Collapse Sidebar"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {!isIconOnly && (
        <div className="px-3 py-2 border-b border-sidebar-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-sidebar-foreground/40" />
            <Input
              type="text"
              placeholder="Search menu..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-7 pr-7 text-xs bg-sidebar-accent/30 border-sidebar-border"
              data-testid="input-sidebar-search"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSearchQuery("")}
                className="absolute right-0.5 top-1/2 -translate-y-1/2"
                data-testid="button-sidebar-search-clear"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      )}

      <SidebarContent>
        {mode === "project" && selectedProjectId && (
          <div className="border-b border-sidebar-border pb-1" data-testid="project-workspace-nav">
            {!isIconOnly && (
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] font-semibold text-sidebar-foreground/50 tracking-wider uppercase">
                  Project Workspace
                </span>
              </div>
            )}
            <SidebarMenu>
              {projectWorkspaceModules.map((mod) => {
                const ModIcon = mod.icon;
                const modulePath = `/projects/${selectedProjectId}/${mod.path}`;
                const isActive = location === modulePath || location.startsWith(modulePath + "/");
                if (isIconOnly) {
                  return (
                    <SidebarMenuItem key={mod.id}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuButton
                            asChild
                            isActive={isActive}
                            data-testid={`nav-pw-${mod.id}`}
                          >
                            <Link href={modulePath}>
                              <ModIcon className="h-4 w-4" />
                            </Link>
                          </SidebarMenuButton>
                        </TooltipTrigger>
                        <TooltipContent side="right">{mod.label}</TooltipContent>
                      </Tooltip>
                    </SidebarMenuItem>
                  );
                }
                return (
                  <SidebarMenuItem key={mod.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      data-testid={`nav-pw-${mod.id}`}
                    >
                      <Link href={modulePath}>
                        <ModIcon className="h-4 w-4" />
                        <span className="flex-1">{mod.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </div>
        )}
        {filteredGroups.map((group) => (
          <NavGroup
            key={group.id}
            group={group}
            isOpen={groupOpen[group.id] !== false}
            onToggle={() => toggleGroup(group.id)}
            location={location}
            counts={navCounts ?? null}
            isIconOnly={isIconOnly}
          />
        ))}
        {filteredGroups.length === 0 && searchQuery && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-sidebar-foreground/50" data-testid="text-sidebar-no-results">
              No items match "{searchQuery}"
            </p>
          </div>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        {isIconOnly ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center">
                <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                  <span className="text-xs font-bold text-primary-foreground">BH</span>
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p className="font-medium">Bradley Hueser</p>
              <p className="text-xs text-muted-foreground">President</p>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-bold text-primary-foreground">BH</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">Bradley Hueser</p>
              <p className="text-xs text-sidebar-foreground/60 truncate">President</p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
