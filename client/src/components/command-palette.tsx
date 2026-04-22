import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Mic,
  MicOff,
  Search,
  FileText,
  FolderOpen,
  Download,
  Share2,
  Upload,
  History,
  ExternalLink,
  Building2,
  Briefcase,
  Calendar,
  Filter,
  X,
  Loader2,
  Bot,
  Sparkles,
  BookOpen,
  MessageSquare,
  ClipboardList,
  Shield,
  Zap,
  FileCheck,
  Play,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface SearchResult {
  id: string;
  type: "document" | "project" | "company" | "opportunity" | "rfi" | "binder_page" | "evidence" | "compliance";
  title: string;
  description?: string;
  category?: string;
  company?: string;
  project?: string;
  date?: string;
  path?: string;
  binderPage?: number;
  bidProjectId?: string;
  sectionCode?: string;
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabType = "all" | "docs" | "projects" | "companies" | "rfis" | "binder";

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [mode, setMode] = useState<"search" | "action">("search");
  const [filters, setFilters] = useState({
    company: "",
    project: "",
    docType: "",
    dateRange: "",
  });
  const [showFilters, setShowFilters] = useState(false);
  const recognitionRef = useRef<any>(null);

  const { data: searchResults, isLoading: isSearching } = useQuery<SearchResult[]>({
    queryKey: ["/api/command/search", query, activeTab, filters],
    queryFn: async () => {
      if (!query || query.length < 2) return [];
      const params = new URLSearchParams({
        q: query,
        type: activeTab,
        ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      });
      const res = await fetch(`/api/command/search?${params}`);
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: query.length >= 2 && mode === "search",
  });

  const { data: companies } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/companies/list"],
  });

  const { data: projects } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["/api/projects/list"],
  });

  const herbieCommandMutation = useMutation({
    mutationFn: async (command: string) => {
      return apiRequest("POST", "/api/herbie/command", { command, source: "command-palette" });
    },
    onSuccess: (data: any) => {
      if (data.action === "navigate") {
        setLocation(data.path);
        onOpenChange(false);
      } else if (data.action === "search") {
        setQuery(data.searchQuery || "");
      } else if (data.message) {
        toast({ title: "Herbie", description: data.message });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/audit/logs"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to process command", variant: "destructive" });
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ action, item, extra }: { action: string; item: SearchResult; extra?: Record<string, any> }) => {
      return apiRequest("POST", "/api/command/action", {
        action,
        itemId: item.id,
        itemType: item.type,
        bidProjectId: item.bidProjectId,
        pageNumber: item.binderPage,
        ...extra,
      });
    },
    onSuccess: (data: any, variables) => {
      const actionLabels: Record<string, string> = {
        open: "Opened",
        download: "Downloaded",
        share: "Share link created",
        history: "Version history loaded",
        open_binder_page: "Opening binder page",
        create_draft: "Draft created in AI Review Queue",
      };
      toast({ title: actionLabels[variables.action] || "Action completed", description: data.message });

      if ((variables.action === "open" || variables.action === "open_binder_page") && data.path) {
        setLocation(data.path);
        onOpenChange(false);
      }
      if (variables.action === "download" && data.url) {
        window.open(data.url, "_blank");
      }
      if (variables.action === "share" && data.shareUrl) {
        navigator.clipboard.writeText(data.shareUrl);
        toast({ title: "Share link copied to clipboard" });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/audit/logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
    },
  });

  const createDraftMutation = useMutation({
    mutationFn: async ({ actionType, details }: { actionType: string; details: string }) => {
      return apiRequest("POST", "/api/command/action", {
        action: "create_draft",
        itemId: "new",
        itemType: "draft",
        reviewType: actionType,
        actionProposed: details,
      });
    },
    onSuccess: (data: any) => {
      toast({ title: "Draft Created", description: data.message || "Added to AI Review Queue for approval" });
      queryClient.invalidateQueries({ queryKey: ["/api/approvals"] });
      onOpenChange(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create draft", variant: "destructive" });
    },
  });

  const startVoiceRecognition = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      toast({ title: "Voice not supported", description: "Your browser doesn't support voice input", variant: "destructive" });
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => {
      setIsListening(false);
      toast({ title: "Voice error", description: "Could not understand audio", variant: "destructive" });
    };

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join("");
      setQuery(transcript);

      if (event.results[0].isFinal) {
        herbieCommandMutation.mutate(transcript);
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [toast, herbieCommandMutation]);

  const stopVoiceRecognition = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setShowFilters(false);
      setMode("search");
      stopVoiceRecognition();
    }
  }, [open, stopVoiceRecognition]);

  const handleAction = (action: string, item: SearchResult) => {
    actionMutation.mutate({ action, item });
  };

  const handleSubmit = () => {
    if (query.trim()) {
      if (mode === "action") {
        const actionMap: Record<string, { type: string; match: RegExp }> = {
          rfi_draft: { type: "rfi_draft", match: /create\s+rfi/i },
          binder_request: { type: "binder_request", match: /generate\s+binder/i },
          coi_request: { type: "coi_request", match: /request\s+coi/i },
        };
        let matched = false;
        for (const [, info] of Object.entries(actionMap)) {
          if (info.match.test(query)) {
            createDraftMutation.mutate({ actionType: info.type, details: query });
            matched = true;
            break;
          }
        }
        if (!matched) {
          createDraftMutation.mutate({ actionType: "general", details: query });
        }
      } else {
        herbieCommandMutation.mutate(query);
      }
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "document": return <FileText className="h-4 w-4" />;
      case "project": return <Briefcase className="h-4 w-4" />;
      case "company": return <Building2 className="h-4 w-4" />;
      case "opportunity": return <FolderOpen className="h-4 w-4" />;
      case "rfi": return <MessageSquare className="h-4 w-4" />;
      case "binder_page": return <BookOpen className="h-4 w-4" />;
      case "evidence": return <FileCheck className="h-4 w-4" />;
      case "compliance": return <Shield className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };

  const getTypeBadgeColor = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (type) {
      case "binder_page": return "default";
      case "rfi": return "outline";
      case "evidence": return "secondary";
      default: return "secondary";
    }
  };

  const docTypes = ["Tax", "Legal", "Projects", "Personnel", "Insurance", "Finance", "Company", "Bonding", "Certifications", "Compliance", "Templates", "Bids", "General", "Branding", "Presentations"];

  const quickActions = [
    { id: "upload", label: "Upload Document", icon: Upload, path: "/knowledge-vault" },
    { id: "opportunities", label: "View Opportunities", icon: FolderOpen, path: "/opportunities" },
    { id: "herbie", label: "Chat with Herbie", icon: Bot, path: "/herbie" },
    { id: "calendar", label: "Open Calendar", icon: Calendar, path: "/calendar" },
    { id: "approvals", label: "AI Review Queue", icon: ClipboardList, path: "/approvals" },
    { id: "bids", label: "View Bids", icon: Briefcase, path: "/bids" },
  ];

  const actionSuggestions = [
    { label: "Create RFI Draft", command: "create RFI draft", icon: MessageSquare },
    { label: "Generate Binder vNext", command: "generate binder vNext", icon: BookOpen },
    { label: "Request COI from Vendor", command: "request COI from vendor", icon: Shield },
  ];

  const groupedResults = searchResults ? {
    binder: searchResults.filter(r => r.type === "binder_page"),
    documents: searchResults.filter(r => r.type === "document"),
    projects: searchResults.filter(r => r.type === "project"),
    opportunities: searchResults.filter(r => r.type === "opportunity"),
    companies: searchResults.filter(r => r.type === "company"),
    rfis: searchResults.filter(r => r.type === "rfi"),
    evidence: searchResults.filter(r => r.type === "evidence"),
    other: searchResults.filter(r => !["binder_page", "document", "project", "opportunity", "company", "rfi", "evidence"].includes(r.type)),
  } : null;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col">
        <div className="flex items-center border-b px-3 py-2 gap-2">
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <Input
            data-testid="input-command-search"
            placeholder={mode === "action"
              ? "Type an action... (e.g., 'create RFI draft', 'generate binder vNext')"
              : "Search everything... (e.g., 'bids due in 10 days', 'type:doc insurance')"
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="flex-1 border-0 bg-transparent focus-visible:ring-0 h-10"
          />
          <Button
            data-testid="button-mode-toggle"
            size="sm"
            variant={mode === "action" ? "default" : "outline"}
            onClick={() => setMode(m => m === "search" ? "action" : "search")}
          >
            {mode === "action" ? <Zap className="h-3 w-3 mr-1" /> : <Play className="h-3 w-3 mr-1" />}
            {mode === "action" ? "Action" : "Search"}
          </Button>
          <Button
            data-testid="button-voice-toggle"
            size="icon"
            variant={isListening ? "default" : "ghost"}
            onClick={isListening ? stopVoiceRecognition : startVoiceRecognition}
            className={isListening ? "bg-red-500" : ""}
          >
            {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            data-testid="button-toggle-filters"
            size="icon"
            variant={showFilters ? "default" : "ghost"}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
          </Button>
          {(herbieCommandMutation.isPending || createDraftMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-2 p-3 border-b bg-muted/50">
            <Select value={filters.company || "all"} onValueChange={(v) => setFilters({ ...filters, company: v === "all" ? "" : v })}>
              <SelectTrigger data-testid="select-filter-company" className="w-[140px] h-8">
                <SelectValue placeholder="Company" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Companies</SelectItem>
                {companies?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.project || "all"} onValueChange={(v) => setFilters({ ...filters, project: v === "all" ? "" : v })}>
              <SelectTrigger data-testid="select-filter-project" className="w-[140px] h-8">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.docType || "all"} onValueChange={(v) => setFilters({ ...filters, docType: v === "all" ? "" : v })}>
              <SelectTrigger data-testid="select-filter-doctype" className="w-[140px] h-8">
                <SelectValue placeholder="Doc Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {docTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.dateRange || "all"} onValueChange={(v) => setFilters({ ...filters, dateRange: v === "all" ? "" : v })}>
              <SelectTrigger data-testid="select-filter-date" className="w-[140px] h-8">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Time</SelectItem>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>

            {(filters.company || filters.project || filters.docType || filters.dateRange) && (
              <Button
                data-testid="button-clear-filters"
                size="sm"
                variant="ghost"
                onClick={() => setFilters({ company: "", project: "", docType: "", dateRange: "" })}
                className="h-8"
              >
                <X className="h-3 w-3 mr-1" /> Clear
              </Button>
            )}
          </div>
        )}

        {mode === "search" && (
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="px-3 pt-2">
            <TabsList className="h-8">
              <TabsTrigger data-testid="tab-all" value="all" className="text-xs">All</TabsTrigger>
              <TabsTrigger data-testid="tab-docs" value="docs" className="text-xs">Docs</TabsTrigger>
              <TabsTrigger data-testid="tab-projects" value="projects" className="text-xs">Projects</TabsTrigger>
              <TabsTrigger data-testid="tab-companies" value="companies" className="text-xs">Companies</TabsTrigger>
              <TabsTrigger data-testid="tab-rfis" value="rfis" className="text-xs">RFIs</TabsTrigger>
              <TabsTrigger data-testid="tab-binder" value="binder" className="text-xs">Binder</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <CommandList className="max-h-[400px]">
          {isSearching && (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {mode === "action" && query.length < 2 && (
            <CommandGroup heading="Action Suggestions">
              {actionSuggestions.map((a) => (
                <CommandItem
                  key={a.label}
                  data-testid={`item-action-${a.label.toLowerCase().replace(/\s+/g, "-")}`}
                  onSelect={() => {
                    setQuery(a.command);
                  }}
                >
                  <a.icon className="mr-2 h-4 w-4" />
                  <span>{a.label}</span>
                  <Badge variant="outline" className="ml-auto text-xs">Draft</Badge>
                </CommandItem>
              ))}
              <CommandSeparator />
              <div className="px-2 py-2 text-xs text-muted-foreground">
                Actions create draft items in the AI Review Queue for approval before execution.
              </div>
            </CommandGroup>
          )}

          {mode === "search" && !isSearching && query.length < 2 && (
            <>
              <CommandGroup heading="Quick Actions">
                {quickActions.map((qa) => (
                  <CommandItem
                    key={qa.id}
                    data-testid={`item-quick-${qa.id}`}
                    onSelect={() => {
                      setLocation(qa.path);
                      onOpenChange(false);
                    }}
                  >
                    <qa.icon className="mr-2 h-4 w-4" />
                    <span>{qa.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup heading="Search Tips">
                <div className="px-2 py-1 text-xs text-muted-foreground space-y-1">
                  <p>Natural language: "show bids due in 10 days"</p>
                  <p>Filters: type:bid, type:doc, company:USDA, section:Specs</p>
                  <p>Binder: search finds pages in generated binders</p>
                </div>
              </CommandGroup>
            </>
          )}

          {mode === "search" && !isSearching && query.length >= 2 && (
            <>
              {groupedResults && searchResults && searchResults.length > 0 ? (
                <>
                  {groupedResults.binder.length > 0 && (
                    <CommandGroup heading={`Binder Pages (${groupedResults.binder.length})`}>
                      {groupedResults.binder.map((result) => (
                        <div
                          key={result.id}
                          data-testid={`result-binder-${result.id}`}
                          className="flex items-center justify-between px-2 py-2 hover-elevate rounded-md cursor-pointer group"
                        >
                          <div
                            className="flex items-center gap-2 flex-1 min-w-0"
                            onClick={() => handleAction("open_binder_page", result)}
                          >
                            <BookOpen className="h-4 w-4 text-primary" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">{result.title}</span>
                                <Badge variant="default" className="text-xs">Page {result.binderPage}</Badge>
                                {result.sectionCode && <Badge variant="secondary" className="text-xs">Sec {result.sectionCode}</Badge>}
                              </div>
                              {result.description && (
                                <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                              )}
                            </div>
                          </div>
                          <Button
                            data-testid={`button-jump-page-${result.id}`}
                            size="sm"
                            variant="outline"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => handleAction("open_binder_page", result)}
                          >
                            <BookOpen className="h-3 w-3 mr-1" />
                            Open at Page {result.binderPage}
                          </Button>
                        </div>
                      ))}
                    </CommandGroup>
                  )}

                  {groupedResults.evidence.length > 0 && (
                    <CommandGroup heading={`Extracted Evidence (${groupedResults.evidence.length})`}>
                      {groupedResults.evidence.map((result) => (
                        <div
                          key={result.id}
                          data-testid={`result-evidence-${result.id}`}
                          className="flex items-center justify-between px-2 py-2 hover-elevate rounded-md cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 flex-1 min-w-0" onClick={() => handleAction("open", result)}>
                            <FileCheck className="h-4 w-4" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium truncate">{result.title}</span>
                                {result.category && <Badge variant="secondary" className="text-xs">{result.category}</Badge>}
                              </div>
                              {result.description && <p className="text-xs text-muted-foreground truncate">{result.description}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </CommandGroup>
                  )}

                  {[
                    { key: "documents" as const, heading: "Documents" },
                    { key: "projects" as const, heading: "Projects" },
                    { key: "opportunities" as const, heading: "Opportunities" },
                    { key: "companies" as const, heading: "Companies" },
                    { key: "rfis" as const, heading: "RFIs" },
                    { key: "other" as const, heading: "Other" },
                  ].map(({ key, heading }) => {
                    const items = groupedResults[key];
                    if (!items || items.length === 0) return null;
                    return (
                      <CommandGroup key={key} heading={`${heading} (${items.length})`}>
                        {items.map((result) => (
                          <div
                            key={result.id}
                            data-testid={`result-${result.type}-${result.id}`}
                            className="flex items-center justify-between px-2 py-2 hover-elevate rounded-md cursor-pointer group"
                          >
                            <div
                              className="flex items-center gap-2 flex-1 min-w-0"
                              onClick={() => handleAction("open", result)}
                            >
                              {getIcon(result.type)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium truncate">{result.title}</span>
                                  {result.category && (
                                    <Badge variant={getTypeBadgeColor(result.type)} className="text-xs">{result.category}</Badge>
                                  )}
                                </div>
                                {result.description && (
                                  <p className="text-xs text-muted-foreground truncate">{result.description}</p>
                                )}
                                {(result.company || result.project || result.date) && (
                                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                    {result.company && <span>{result.company}</span>}
                                    {result.project && <span>{result.project}</span>}
                                    {result.date && <span>{result.date}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 invisible group-hover:visible">
                              <Button
                                data-testid={`button-open-${result.id}`}
                                size="icon"
                                variant="ghost"
                                onClick={() => handleAction("open", result)}
                                title="Open"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                              {result.type === "document" && (
                                <>
                                  <Button
                                    data-testid={`button-download-${result.id}`}
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleAction("download", result)}
                                    title="Download"
                                  >
                                    <Download className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    data-testid={`button-share-${result.id}`}
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleAction("share", result)}
                                    title="Share"
                                  >
                                    <Share2 className="h-3 w-3" />
                                  </Button>
                                  <Button
                                    data-testid={`button-history-${result.id}`}
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => handleAction("history", result)}
                                    title="Version History"
                                  >
                                    <History className="h-3 w-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </CommandGroup>
                    );
                  })}
                </>
              ) : (
                <CommandEmpty>
                  <div className="flex flex-col items-center gap-2">
                    <Search className="h-8 w-8 opacity-50" />
                    <p>No results found for "{query}"</p>
                    <Button
                      data-testid="button-ask-herbie"
                      size="sm"
                      variant="outline"
                      onClick={handleSubmit}
                      className="mt-2"
                    >
                      <Sparkles className="h-4 w-4 mr-2" />
                      Ask Herbie
                    </Button>
                  </div>
                </CommandEmpty>
              )}
            </>
          )}
        </CommandList>

        <CommandSeparator />
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground border-t">
          <div className="flex items-center gap-4 flex-wrap">
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">↵</kbd> {mode === "action" ? "execute" : "search"}</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">esc</kbd> close</span>
            <span><kbd className="px-1.5 py-0.5 bg-muted rounded text-xs">Tab</kbd> switch mode</span>
          </div>
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            <span>Powered by Herbie AI</span>
          </div>
        </div>
      </div>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen };
}
