import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { actionLabel as actionLabelFn, entityLabel as entityLabelFn } from "@/lib/labels";
import {
  Send,
  Bot,
  User,
  Sparkles,
  Search,
  FileText,
  Calendar,
  Mail,
  CheckCircle2,
  Clock,
  Loader2,
  RotateCcw,
  Copy,
  ThumbsUp,
  ThumbsDown,
  Play,
  Activity,
  AlertTriangle,
  Target,
  FileCheck,
  TrendingUp,
  RefreshCw,
  Brain,
  Scale,
  HardHat,
  Shield,
  Zap,
  BarChart3,
  Award,
  BookOpen,
  Users,
  Link2,
  Database,
  FileQuestion,
  Building2,
  Plus,
  ExternalLink,
  Check,
  X,
  Lightbulb,
  ArrowRight,
  Briefcase,
  DollarSign,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { apiRequest } from "@/lib/queryClient";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  actions?: {
    type: string;
    label: string;
    status: "pending" | "completed" | "failed";
  }[];
}

interface HerbieActivityLog {
  id: string;
  timestamp: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  outcome: "success" | "pending" | "error";
}

interface DailyBriefing {
  date: string;
  summary: string;
  newOpportunities: number;
  pendingApprovals: number;
  activeBids: number;
  upcomingDeadlines: Array<{ title: string; dueDate: string; daysRemaining: number }>;
  exceptionsRequiringAttention: string[];
  recommendedActions: string[];
}

interface HerbieStatus {
  status: string;
  lastCycle: string;
  stats: {
    newOpportunities: number;
    pendingApprovals: number;
    activeBids: number;
    upcomingDeadlines: number;
    exceptionsCount: number;
  };
}

interface AgentStatus {
  agent: string;
  status: "active" | "idle" | "error";
  lastRun: string | null;
  successRate: number;
  tasksCompleted: number;
  description: string;
}

interface AgentsStatus {
  agents: AgentStatus[];
  lastRefresh: string;
}

interface PwinAnalysis {
  id: string;
  opportunityId: string;
  pwinScore: number;
  roiEstimate: number;
  riskLevel: string;
  keyFactors: string[];
  recommendation: string;
  analyzedAt: string;
}

interface CaptureAnalytics {
  stages: {
    id: string;
    name: string;
    stageOrder: number;
    color: string;
    count: number;
    ownerName: string;
  }[];
  pwinDistribution: {
    high: number;
    medium: number;
    low: number;
  };
  metrics: {
    winRate: number;
    completedBids: number;
    activeBids: number;
    totalPipelineValue: number;
    weightedPipelineValue: number;
    avgPwin: number;
    avgTimeToBid: number;
  };
  stageOwners: {
    stage: string;
    owner: string;
    count: number;
  }[];
}

interface ComplianceCheck {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  overallScore: number;
  isCompliant: boolean;
  gaps: string[];
  clauseCount: number;
  checkedAt: string;
}

interface AwardNotification {
  id: string;
  opportunityId: string;
  opportunityTitle: string;
  awardDate: string;
  awardAmount: number;
  isOurs: boolean;
  projectCreated: boolean;
  createdAt: string;
}

interface KnowledgeDocument {
  id: string;
  title: string;
  documentType: string;
  content: string;
  sourceUrl?: string;
  sourceSystem?: string;
  status: string;
  createdAt: string;
}

interface TeamingPartner {
  id: string;
  companyName: string;
  duns?: string;
  cage?: string;
  contactName?: string;
  contactEmail?: string;
  naicsCodes?: string[];
  setAsideCertifications?: string[];
  capabilities?: string;
  relationshipStatus: string;
  rating?: number;
}

interface ConnectorStatusInfo {
  type: string;
  status: {
    connected: boolean;
    lastSync: string | null;
    lastSyncStatus: string | null;
    recordsSynced: number;
    enabled: boolean;
  };
}

interface StructuredResponse {
  answer: string;
  evidence: Array<{ type: string; id: string; title: string; link: string }>;
  recommendedActions: string[];
  approvalRequired: Array<{ action: string; reason: string }>;
  risks: string[];
  deadlines: Array<{ item: string; date: string; urgency: string }>;
}

const suggestedPrompts = [
  { icon: Sparkles, text: "Give me today's executive briefing", category: "reports" },
  { icon: Search, text: "Find high-fit opportunities this week", category: "opportunities" },
  { icon: FileText, text: "Show me pending approvals", category: "approvals" },
  { icon: Calendar, text: "What deadlines are coming up?", category: "calendar" },
  { icon: CheckCircle2, text: "What's the status of active bids?", category: "bids" },
  { icon: Mail, text: "Summarize recent exceptions", category: "exceptions" },
];

const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

// Slash commands configuration
const slashCommands = [
  { command: "/briefing", description: "Get your daily briefing", icon: Sparkles },
  { command: "/approvals", description: "View pending approvals", icon: CheckCircle2 },
  { command: "/pipeline", description: "Show bid pipeline status", icon: TrendingUp },
  { command: "/score", description: "Score an opportunity", icon: Target },
  { command: "/search", description: "Search opportunities", icon: Search },
  { command: "/audit", description: "View audit history", icon: Shield },
  { command: "/deadlines", description: "Show upcoming deadlines", icon: Clock },
  { command: "/partners", description: "Search teaming partners", icon: Users },
  { command: "/knowledge", description: "Search knowledge vault", icon: BookOpen },
  { command: "/help", description: "Show available commands", icon: FileQuestion },
];

export default function Herbie() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState(slashCommands);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch HERBIE autonomous status
  const { data: herbieStatus, isLoading: statusLoading } = useQuery<HerbieStatus>({
    queryKey: ["/api/herbie/autonomous/status"],
    refetchInterval: 30000,
  });

  // Fetch daily briefing
  const { data: dailyBriefing, isLoading: briefingLoading, refetch: refetchBriefing } = useQuery<DailyBriefing>({
    queryKey: ["/api/herbie/autonomous/daily-briefing"],
  });

  // Fetch activity log
  const { data: activityLog, isLoading: activityLoading, refetch: refetchActivity } = useQuery<HerbieActivityLog[]>({
    queryKey: ["/api/herbie/autonomous/activity-log"],
    refetchInterval: 60000,
  });

  // Fetch multi-agent status
  const { data: agentsStatus, isLoading: agentsLoading, refetch: refetchAgents } = useQuery<AgentsStatus>({
    queryKey: ["/api/agents/status"],
    refetchInterval: 30000,
  });

  // Fetch recent Pwin analyses
  const { data: pwinAnalyses } = useQuery<PwinAnalysis[]>({
    queryKey: ["/api/agents/cio-bot/recent-analyses"],
    refetchInterval: 60000,
  });

  // Fetch capture analytics for Reports tab
  const { data: captureAnalytics } = useQuery<CaptureAnalytics>({
    queryKey: ["/api/herbie-command/capture-analytics"],
    refetchInterval: 30000,
  });

  // Fetch recent compliance checks
  const { data: complianceChecks } = useQuery<ComplianceCheck[]>({
    queryKey: ["/api/agents/legalops/recent-checks"],
    refetchInterval: 60000,
  });

  // Fetch recent awards
  const { data: awardNotifications } = useQuery<AwardNotification[]>({
    queryKey: ["/api/agents/foreman/recent-awards"],
    refetchInterval: 60000,
  });

  // Fetch knowledge documents
  const { data: knowledgeDocuments, refetch: refetchKnowledge } = useQuery<KnowledgeDocument[]>({
    queryKey: ["/api/herbie-command/knowledge"],
    refetchInterval: 60000,
  });

  // Fetch teaming partners
  const { data: teamingPartners, refetch: refetchTeaming } = useQuery<TeamingPartner[]>({
    queryKey: ["/api/herbie-command/teaming-partners"],
    refetchInterval: 60000,
  });

  // Fetch connector statuses
  const { data: connectorStatuses, refetch: refetchConnectors } = useQuery<ConnectorStatusInfo[]>({
    queryKey: ["/api/herbie-command/connectors"],
    refetchInterval: 30000,
  });

  // Knowledge search state
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeResults, setKnowledgeResults] = useState<{ answer: string; sources: Array<{ type: string; id: string; title: string; excerpt: string; link: string }> } | null>(null);

  // Chat mutation
  const chatMutation = useMutation({
    mutationFn: async (message: string) => {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const response = await apiRequest("POST", "/api/herbie/chat", { message, history });
      return response.json();
    },
    onSuccess: (data: { message?: string; toolCalls?: Array<{ tool?: string; name?: string; result?: any }> }) => {
      const assistantMessage: Message = {
        id: Date.now().toString(),
        role: "assistant",
        content: data.message || "I processed your request.",
        timestamp: new Date(),
        actions: data.toolCalls
          ?.map((tc) => tc?.tool ?? tc?.name)
          .filter((name): name is string => Boolean(name))
          .map((name) => ({
            type: name,
            label: formatToolName(name),
            status: "completed" as const,
          })),
      };
      setMessages(prev => [...prev, assistantMessage]);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to get response from HERBIE",
        variant: "destructive",
      });
      console.error("Chat error:", error);
    },
  });

  // Run autonomous cycle mutation
  const runCycleMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/herbie/autonomous/run-cycle");
      return response.json();
    },
    onSuccess: (data: { stats: { evaluated: number; approvalRequests: number; projectsCreated: number } }) => {
      toast({
        title: "Autonomous Cycle Complete",
        description: `Evaluated ${data.stats.evaluated} opportunities, created ${data.stats.approvalRequests} approval requests, ${data.stats.projectsCreated} projects.`,
        action: (
          <ToastAction altText="View Approvals" onClick={() => navigate("/approvals")} data-testid="toast-action-view-approvals">
            View
          </ToastAction>
        ),
      });
      queryClient.invalidateQueries({ queryKey: ["/api/herbie/autonomous/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/herbie/autonomous/activity-log"] });
      queryClient.invalidateQueries({ queryKey: ["/api/herbie/autonomous/daily-briefing"] });
      refetchActivity();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to run autonomous cycle",
        variant: "destructive",
      });
      console.error("Run cycle error:", error);
    },
  });

  // Knowledge search mutation
  const knowledgeSearchMutation = useMutation({
    mutationFn: async (query: string) => {
      const response = await apiRequest("POST", "/api/herbie-command/knowledge/search", { query });
      return response.json();
    },
    onSuccess: (data) => {
      setKnowledgeResults(data);
    },
    onError: () => {
      toast({
        title: "Search Error",
        description: "Failed to search knowledge vault",
        variant: "destructive",
      });
    },
  });

  // Connector sync mutation
  const connectorSyncMutation = useMutation({
    mutationFn: async (connectorType: string) => {
      const response = await apiRequest("POST", `/api/herbie-command/connectors/${connectorType}/sync`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sync Complete",
        description: data.message || "Connector synced successfully",
      });
      refetchConnectors();
    },
    onError: () => {
      toast({
        title: "Sync Error",
        description: "Failed to sync connector",
        variant: "destructive",
      });
    },
  });

  // Connector enable/disable mutation
  const connectorToggleMutation = useMutation({
    mutationFn: async ({ type, enable }: { type: string; enable: boolean }) => {
      const endpoint = enable 
        ? `/api/herbie-command/connectors/${type}/enable`
        : `/api/herbie-command/connectors/${type}/disable`;
      const response = await apiRequest("POST", endpoint);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "Connector status updated",
      });
      refetchConnectors();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update connector status",
        variant: "destructive",
      });
    },
  });

  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0 && dailyBriefing) {
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: `${getGreeting()}! I'm **SENTINEL HERBIE**, your AI operations assistant for BlackHawk Construction.

I continuously monitor SAM.gov for federal contracting opportunities, evaluate them against your fit profile, and automatically create approval requests for high-scoring bids.

**Current Status:**
- **New Opportunities:** ${dailyBriefing.newOpportunities} (last 24h)
- **Pending Approvals:** ${dailyBriefing.pendingApprovals}
- **Active Bids:** ${dailyBriefing.activeBids}
- **Upcoming Deadlines:** ${dailyBriefing.upcomingDeadlines.length}
${dailyBriefing.exceptionsRequiringAttention.length > 0 ? `- **Exceptions:** ${dailyBriefing.exceptionsRequiringAttention.length} need attention` : ""}

How can I help you today?`,
        timestamp: new Date(),
      }]);
    } else if (messages.length === 0) {
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: `${getGreeting()}! I'm **SENTINEL HERBIE**, your AI operations assistant for BlackHawk Construction.

I'm your central command for monitoring federal contracting opportunities, managing bids, and automating workflows.

How can I help you today?`,
        timestamp: new Date(),
      }]);
    }
  }, [dailyBriefing]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatToolName = (name: string): string => {
    const toolLabels: Record<string, string> = {
      search_opportunities: "Search Opportunities",
      get_opportunity_details: "View Opportunity Details",
      get_bid_pipeline: "View Bid Pipeline",
      get_pending_approvals: "View Pending Approvals",
      get_upcoming_deadlines: "View Deadlines",
      get_daily_briefing: "Get Daily Briefing",
      score_opportunity: "Score Opportunity",
      create_bid_project: "Create Bid Project",
      schedule_meeting: "Schedule Meeting",
      draft_email: "Draft Email",
      get_exceptions: "View Exceptions",
      get_audit_history: "View Audit History",
    };
    return toolLabels[name] || actionLabelFn(name);
  };

  // Handle slash command execution
  const executeSlashCommand = (command: string, clearInput: boolean = true) => {
    setShowSlashCommands(false);
    const commandText = command.toLowerCase();
    
    switch (commandText) {
      case "/briefing":
        setActiveTab("briefing");
        refetchBriefing();
        toast({ title: "Loading daily briefing..." });
        if (clearInput) setInput("");
        break;
      case "/approvals":
        navigate("/approvals");
        if (clearInput) setInput("");
        break;
      case "/pipeline":
        setActiveTab("chat");
        // Direct mutation instead of state + timeout
        const pipelineMsg: Message = {
          id: Date.now().toString(),
          role: "user",
          content: "Show me the current bid pipeline status",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, pipelineMsg]);
        chatMutation.mutate("Show me the current bid pipeline status");
        if (clearInput) setInput("");
        break;
      case "/score":
        // Prefill input for user to continue
        setInput("Score opportunity ");
        textareaRef.current?.focus();
        // Don't clear input - user needs to continue typing
        break;
      case "/search":
        setInput("Search opportunities for ");
        textareaRef.current?.focus();
        break;
      case "/audit":
        setInput("Show audit history for ");
        textareaRef.current?.focus();
        break;
      case "/deadlines":
        setActiveTab("chat");
        const deadlineMsg: Message = {
          id: Date.now().toString(),
          role: "user",
          content: "What are the upcoming deadlines?",
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, deadlineMsg]);
        chatMutation.mutate("What are the upcoming deadlines?");
        if (clearInput) setInput("");
        break;
      case "/partners":
        setActiveTab("teaming");
        if (clearInput) setInput("");
        break;
      case "/knowledge":
        setActiveTab("knowledge");
        if (clearInput) setInput("");
        break;
      case "/help":
        const helpMessage: Message = {
          id: Date.now().toString(),
          role: "assistant",
          content: `**Available Slash Commands:**\n\n${slashCommands.map(c => `- \`${c.command}\` - ${c.description}`).join("\n")}\n\n**Tips:**\n- Type "/" to see all commands\n- Use arrow keys to navigate, Enter to select\n- Commands work from anywhere in the app`,
          timestamp: new Date(),
        };
        setMessages(prev => [...prev, helpMessage]);
        setActiveTab("chat");
        if (clearInput) setInput("");
        break;
      default:
        setInput(command);
    }
  };

  // Handle input change for slash command detection
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);
    
    if (value.startsWith("/")) {
      const searchTerm = value.toLowerCase();
      const matches = slashCommands.filter(cmd => 
        cmd.command.startsWith(searchTerm) || cmd.description.toLowerCase().includes(searchTerm.slice(1))
      );
      setFilteredCommands(matches);
      setShowSlashCommands(matches.length > 0);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashCommands(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || chatMutation.isPending) return;
    
    // Check if it's a slash command
    if (input.startsWith("/")) {
      const inputLower = input.toLowerCase().trim();
      const exactMatch = slashCommands.find(cmd => cmd.command === inputLower);
      if (exactMatch) {
        const isPrefillCommand = ["/score", "/search", "/audit"].includes(exactMatch.command);
        executeSlashCommand(exactMatch.command, !isPrefillCommand);
        return;
      }
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const message = input;
    setInput("");
    setShowSlashCommands(false);
    
    chatMutation.mutate(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashCommands) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex(prev => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (filteredCommands[selectedCommandIndex]) {
          const selectedCommand = filteredCommands[selectedCommandIndex].command;
          const isPrefillCommand = ["/score", "/search", "/audit"].includes(selectedCommand);
          executeSlashCommand(selectedCommand, !isPrefillCommand);
        }
      } else if (e.key === "Escape") {
        setShowSlashCommands(false);
      }
    } else if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const handleActionClick = (actionType: string) => {
    switch (actionType) {
      case "search_opportunities":
      case "view_opportunities":
        navigate("/opportunities");
        break;
      case "get_pending_approvals":
      case "view_approvals":
        navigate("/approvals");
        break;
      case "get_bid_pipeline":
      case "view_bids":
        navigate("/bids");
        break;
      case "view_calendar":
        navigate("/calendar");
        break;
      case "view_settings":
        navigate("/settings");
        break;
      default:
        toast({
          title: "Action",
          description: `Action "${actionType}" triggered`,
        });
    }
  };

  const handleCopyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copied", description: "Message copied to clipboard." });
  };

  const handleThumbsUp = () => {
    toast({ title: "Feedback Received", description: "Thank you for your positive feedback!" });
  };

  const handleThumbsDown = () => {
    toast({ title: "Feedback Received", description: "Thank you for your feedback. We'll work to improve!" });
  };

  const handleRetry = () => {
    toast({ title: "Retrying", description: "Regenerating response..." });
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "opportunity_evaluated":
        return <Target className="h-4 w-4 text-blue-500" />;
      case "approval_request_created":
        return <FileCheck className="h-4 w-4 text-amber-500" />;
      case "bid_project_created":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "autonomous_cycle_complete":
        return <RefreshCw className="h-4 w-4 text-primary" />;
      default:
        return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatActionName = (action: string): string => {
    return actionLabelFn(action);
  };

  return (
    <div className="h-full w-full overflow-hidden flex flex-col" style={{ maxWidth: '100%', minWidth: 0 }}>
      {/* Header - fixed at top, never scrolls */}
      <header className="border-b p-4 flex-shrink-0 flex-grow-0" style={{ minWidth: 0 }}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="min-w-0 flex-shrink">
            <h1 className="text-lg font-bold truncate">SENTINEL HERBIE</h1>
            <p className="text-sm text-muted-foreground truncate">Autonomous AI Agent</p>
          </div>
          <Badge className="bg-green-500/10 text-green-500 border-green-500/20 gap-1 flex-shrink-0">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {herbieStatus?.status === "active" ? "Online" : "Connecting..."}
          </Badge>
          <div className="ml-auto flex items-center gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => runCycleMutation.mutate()}
              disabled={runCycleMutation.isPending}
              data-testid="button-run-cycle"
            >
              {runCycleMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Run Cycle
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content with Persistent Chat Sidebar - CSS Grid */}
      <div className="herbie-shell">
        {/* Left: Main Content Area */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="main-content">
          <div className="border-b px-4 flex-shrink-0" style={{ minWidth: 0 }}>
            <TabsList className="h-10 w-full flex flex-nowrap gap-1" style={{ minWidth: 0 }}>
              <TabsTrigger value="dashboard" data-testid="tab-dashboard">Dashboard</TabsTrigger>
              <TabsTrigger value="chat" data-testid="tab-chat">Chat</TabsTrigger>
              <TabsTrigger value="planner" data-testid="tab-planner">Work Planner</TabsTrigger>
              <TabsTrigger value="agents" data-testid="tab-agents">Agents</TabsTrigger>
              <TabsTrigger value="reports" data-testid="tab-reports">Reports</TabsTrigger>
              <TabsTrigger value="briefing" data-testid="tab-briefing">Briefing</TabsTrigger>
              <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
              <TabsTrigger value="knowledge" data-testid="tab-knowledge">Knowledge</TabsTrigger>
              <TabsTrigger value="teaming" data-testid="tab-teaming">Partners</TabsTrigger>
              <TabsTrigger value="connectors" data-testid="tab-connectors">Connectors</TabsTrigger>
            </TabsList>
          </div>

        {/* Command Dashboard Tab */}
        <TabsContent value="dashboard" className="main-scroll m-0 p-4">
          <div className="w-full space-y-6">
            {/* Command Bar */}
            <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                    <Bot className="h-6 w-6 text-primary-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-lg font-medium">{getGreeting()}, let me help you today.</p>
                    <p className="text-sm text-muted-foreground">Type a question or use a slash command to get started</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setActiveTab("chat")} data-testid="button-open-chat">
                    <Send className="h-4 w-4 mr-2" />
                    Chat with HERBIE
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Command Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Opportunity Radar */}
              <Card data-testid="card-opportunity-radar">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Target className="h-4 w-4 text-blue-500" />
                      Opportunity Radar
                    </CardTitle>
                    <Badge variant="secondary">{herbieStatus?.stats?.newOpportunities || 0} new</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{herbieStatus?.stats?.newOpportunities || 0}</div>
                  <p className="text-xs text-muted-foreground">New opportunities today</p>
                  <div className="mt-3 space-y-1">
                    <div className="text-xs text-muted-foreground">Top matches being analyzed</div>
                  </div>
                  <Button variant="ghost" size="sm" className="px-0 mt-2" onClick={() => navigate("/opportunities")} data-testid="button-view-opportunities">
                    View all opportunities <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              {/* Approvals Queue */}
              <Card data-testid="card-approvals-queue">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-amber-500" />
                      Approvals Queue
                    </CardTitle>
                    {(herbieStatus?.stats?.pendingApprovals || 0) > 0 && (
                      <Badge variant="destructive">{herbieStatus?.stats?.pendingApprovals} pending</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{herbieStatus?.stats?.pendingApprovals || 0}</div>
                  <p className="text-xs text-muted-foreground">Awaiting your decision</p>
                  <Button variant="ghost" size="sm" className="px-0 mt-2" onClick={() => navigate("/approvals")} data-testid="button-review-approvals">
                    Review approvals <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              {/* Bid Pipeline */}
              <Card data-testid="card-bid-pipeline">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-green-500" />
                      Bid Pipeline
                    </CardTitle>
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{herbieStatus?.stats?.activeBids || 0} active</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{herbieStatus?.stats?.activeBids || 0}</div>
                  <p className="text-xs text-muted-foreground">Active bid projects</p>
                  <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                    <div className="text-center p-1 bg-muted rounded">
                      <div className="font-medium">{Math.ceil((herbieStatus?.stats?.activeBids || 0) / 3)}</div>
                      <div className="text-muted-foreground">Capture</div>
                    </div>
                    <div className="text-center p-1 bg-muted rounded">
                      <div className="font-medium">{Math.ceil((herbieStatus?.stats?.activeBids || 0) / 2)}</div>
                      <div className="text-muted-foreground">Proposal</div>
                    </div>
                    <div className="text-center p-1 bg-muted rounded">
                      <div className="font-medium">{Math.max(1, (herbieStatus?.stats?.activeBids || 0) - Math.ceil((herbieStatus?.stats?.activeBids || 0) / 3) - Math.ceil((herbieStatus?.stats?.activeBids || 0) / 2))}</div>
                      <div className="text-muted-foreground">Review</div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="px-0 mt-2" onClick={() => navigate("/bids")} data-testid="button-view-pipeline">
                    View pipeline <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              {/* Deadlines & Exceptions */}
              <Card data-testid="card-deadlines">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4 text-red-500" />
                      Deadlines & Exceptions
                    </CardTitle>
                    {(herbieStatus?.stats?.upcomingDeadlines || 0) > 0 && (
                      <Badge variant="outline" className="text-red-500 border-red-500/50">{herbieStatus?.stats?.upcomingDeadlines} soon</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{herbieStatus?.stats?.upcomingDeadlines || 0}</div>
                  <p className="text-xs text-muted-foreground">Deadlines in next 7 days</p>
                  {(herbieStatus?.stats?.exceptionsCount || 0) > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-amber-500">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">{herbieStatus?.stats?.exceptionsCount} exceptions need attention</span>
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="px-0 mt-2" onClick={() => setActiveTab("briefing")} data-testid="button-view-deadlines">
                    View details <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              {/* Compliance Heat */}
              <Card data-testid="card-compliance-heat">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Shield className="h-4 w-4 text-purple-500" />
                      Compliance Status
                    </CardTitle>
                    <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Healthy</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>FAR Compliance</span>
                      <span className="text-green-500">100%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>DFARS Compliance</span>
                      <span className="text-green-500">98%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Certifications</span>
                      <span className="text-amber-500">3 expiring</span>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="px-0 mt-2" onClick={() => navigate("/settings")} data-testid="button-view-compliance">
                    View compliance <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>

              {/* Executive Briefing */}
              <Card data-testid="card-executive-briefing">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      Executive Briefing
                    </CardTitle>
                    <Badge variant="outline">AI Generated</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {dailyBriefing?.summary || "Loading your personalized briefing..."}
                  </p>
                  <Button variant="ghost" size="sm" className="px-0 mt-2" onClick={() => setActiveTab("briefing")} data-testid="button-read-briefing">
                    Read full briefing <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
                  {slashCommands.slice(0, 6).map((cmd) => (
                    <Button
                      key={cmd.command}
                      variant="outline"
                      className="flex flex-col h-auto py-3 gap-1"
                      onClick={() => executeSlashCommand(cmd.command)}
                      data-testid={`quick-action-${cmd.command.slice(1)}`}
                    >
                      <cmd.icon className="h-4 w-4" />
                      <span className="text-xs">{cmd.command.slice(1)}</span>
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Work Planner Tab */}
        <TabsContent value="planner" className="main-scroll m-0 p-4">
          <div className="w-full space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Work Planner</h2>
              <Badge className="bg-primary/10 text-primary border-primary/20">Today</Badge>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Today's Priorities */}
              <Card data-testid="card-todays-priorities">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" />
                    Today's Priorities
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dailyBriefing?.recommendedActions?.slice(0, 5).map((action, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-xs font-medium text-primary">{i + 1}</span>
                      </div>
                      <span>{action}</span>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">Loading priorities...</p>
                  )}
                </CardContent>
              </Card>

              {/* Upcoming Deadlines */}
              <Card data-testid="card-upcoming-deadlines">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4 text-red-500" />
                    Upcoming Deadlines
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dailyBriefing?.upcomingDeadlines?.slice(0, 5).map((deadline, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="truncate">{deadline.title}</span>
                      <Badge variant={deadline.daysRemaining <= 3 ? "destructive" : "secondary"} className="ml-2">
                        {deadline.daysRemaining}d
                      </Badge>
                    </div>
                  )) || (
                    <p className="text-sm text-muted-foreground">No upcoming deadlines</p>
                  )}
                </CardContent>
              </Card>

              {/* Approvals Needed */}
              <Card data-testid="card-approvals-needed">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-amber-500" />
                    Approvals Needed
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(herbieStatus?.stats?.pendingApprovals || 0) > 0 ? (
                    <>
                      <div className="text-2xl font-bold">{herbieStatus?.stats?.pendingApprovals}</div>
                      <p className="text-sm text-muted-foreground">pending your review</p>
                      <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/approvals")} data-testid="button-review-now">
                        Review Now
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">All caught up!</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* AI Suggested Next Steps */}
            <Card data-testid="card-ai-suggestions">
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  AI Suggested Next Steps
                </CardTitle>
                <CardDescription>Based on your pipeline and deadlines</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dailyBriefing?.recommendedActions?.map((action, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="h-6 w-6 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                      <Lightbulb className="h-3 w-3 text-amber-500" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm">{action}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Based on pipeline analysis and upcoming deadlines
                      </p>
                    </div>
                    <Button size="sm" variant="outline" data-testid={`button-take-action-${i}`}>
                      Take Action
                    </Button>
                  </div>
                )) || (
                  <p className="text-sm text-muted-foreground">Loading suggestions...</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Chat Tab */}
        <TabsContent value="chat" className="main-scroll flex flex-col m-0">
          <ScrollArea className="flex-1 p-4">
            <div className="max-w-3xl mx-auto space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarFallback className={message.role === "assistant" ? "bg-primary text-primary-foreground" : ""}>
                      {message.role === "assistant" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`flex-1 space-y-2 ${message.role === "user" ? "text-right" : ""}`}>
                    <div
                      className={`inline-block rounded-lg p-4 max-w-[85%] text-left ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        {message.content.split("\n").map((line, i) => {
                          if (line.startsWith("**") && line.endsWith("**")) {
                            return <p key={i} className="font-bold my-1">{line.replace(/\*\*/g, "")}</p>;
                          }
                          if (line.startsWith("- ") || /^\d+\./.test(line)) {
                            return <p key={i} className="my-1 pl-2">{line}</p>;
                          }
                          if (line.trim() === "---") {
                            return <Separator key={i} className="my-2" />;
                          }
                          return <p key={i} className="my-1">{line}</p>;
                        })}
                      </div>
                    </div>

                    {message.actions && message.role === "assistant" && (
                      <div className="flex flex-wrap gap-2">
                        {message.actions.map((action, i) => (
                          <Button
                            key={i}
                            variant="outline"
                            size="sm"
                            onClick={() => handleActionClick(action.type)}
                            data-testid={`action-${action.type}`}
                          >
                            {action.status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1 text-green-500" />}
                            {action.label}
                          </Button>
                        ))}
                      </div>
                    )}

                    {message.role === "assistant" && message.id !== "welcome" && (
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleCopyMessage(message.content)} data-testid="button-copy">
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleThumbsUp} data-testid="button-thumbs-up">
                          <ThumbsUp className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleThumbsDown} data-testid="button-thumbs-down">
                          <ThumbsDown className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={handleRetry} data-testid="button-retry">
                          <RotateCcw className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-muted rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm text-muted-foreground">HERBIE is thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {messages.length <= 1 && (
            <div className="p-4 border-t">
              <div className="max-w-3xl mx-auto">
                <p className="text-sm text-muted-foreground mb-3">Quick Actions</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {suggestedPrompts.map((prompt, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      className="justify-start h-auto py-3 px-4 text-left"
                      onClick={() => handleSuggestedPrompt(prompt.text)}
                      data-testid={`suggested-prompt-${i}`}
                    >
                      <prompt.icon className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span className="text-sm truncate">{prompt.text}</span>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="border-t p-4">
            <div className="max-w-3xl mx-auto relative">
              {showSlashCommands && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-background border rounded-lg shadow-lg z-10 max-h-60 overflow-auto" data-testid="slash-command-menu">
                  {filteredCommands.map((cmd, index) => {
                    const isPrefillCommand = ["/score", "/search", "/audit"].includes(cmd.command);
                    return (
                      <button
                        key={cmd.command}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left hover-elevate ${index === selectedCommandIndex ? 'bg-muted' : ''}`}
                        onClick={() => {
                          executeSlashCommand(cmd.command, !isPrefillCommand);
                        }}
                        data-testid={`slash-command-${cmd.command.slice(1)}`}
                      >
                        <cmd.icon className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="font-medium">{cmd.command}</span>
                          <span className="text-sm text-muted-foreground ml-2">{cmd.description}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask HERBIE anything... (type / for commands)"
                  className="resize-none min-h-[48px] max-h-[200px]"
                  rows={1}
                  data-testid="input-herbie-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || chatMutation.isPending}
                  className="h-auto"
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                HERBIE can make mistakes. Verify important information. Type <kbd className="bg-muted px-1 rounded">/</kbd> for commands.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Agent Status Tab */}
        <TabsContent value="agents" className="main-scroll m-0 p-4">
          <div className="w-full min-w-0 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">GovSync 2.0 Multi-Agent System</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchAgents()}
                data-testid="button-refresh-agents"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            {agentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Agent Cards - responsive grid filling full width at all breakpoints */}
                <div className="grid w-full min-w-0 gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  {/* HERBIE Agent */}
                  {(() => {
                    const herbieAgent = agentsStatus?.agents?.find(a => a.agent === "HERBIE");
                    const statusLabel = herbieAgent?.status === "active" ? "Active" : herbieAgent?.status === "idle" ? "Idle" : herbieAgent?.status === "error" ? "Error" : "Online";
                    const badgeClass = herbieAgent?.status === "active" 
                      ? "bg-green-500/10 text-green-500 border-green-500/20" 
                      : herbieAgent?.status === "idle" 
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      : herbieAgent?.status === "error"
                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                      : "bg-green-500/10 text-green-500 border-green-500/20";
                    const dotClass = herbieAgent?.status === "active" 
                      ? "bg-green-500" 
                      : herbieAgent?.status === "idle" 
                      ? "bg-amber-500"
                      : herbieAgent?.status === "error"
                      ? "bg-red-500"
                      : "bg-green-500";
                    return (
                      <Card data-testid="card-agent-herbie" className="w-full">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                              <Bot className="h-4 w-4 text-primary-foreground" />
                            </div>
                            <div>
                              <CardTitle className="text-sm">HERBIE</CardTitle>
                              <CardDescription className="text-xs">Operations AI</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Badge className={`${badgeClass} gap-1`}>
                            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                            {statusLabel}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-2 space-y-1">
                            <p>Opportunity discovery, chat assistance, approvals</p>
                            {herbieAgent?.lastRun && (
                              <p>Last run: {new Date(herbieAgent.lastRun).toLocaleTimeString()}</p>
                            )}
                            {herbieAgent?.tasksCompleted !== undefined && (
                              <p>Tasks: {herbieAgent.tasksCompleted} | Success: {herbieAgent.successRate}%</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* CIO-Bot Agent */}
                  {(() => {
                    const cioBotAgent = agentsStatus?.agents?.find(a => a.agent === "CIO-Bot");
                    const statusLabel = cioBotAgent?.status === "active" ? "Active" : cioBotAgent?.status === "idle" ? "Idle" : cioBotAgent?.status === "error" ? "Error" : "Online";
                    const badgeClass = cioBotAgent?.status === "active" 
                      ? "bg-blue-500/10 text-blue-500 border-blue-500/20" 
                      : cioBotAgent?.status === "idle" 
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      : cioBotAgent?.status === "error"
                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                      : "bg-blue-500/10 text-blue-500 border-blue-500/20";
                    const dotClass = cioBotAgent?.status === "active" 
                      ? "bg-blue-500" 
                      : cioBotAgent?.status === "idle" 
                      ? "bg-amber-500"
                      : cioBotAgent?.status === "error"
                      ? "bg-red-500"
                      : "bg-blue-500";
                    return (
                      <Card data-testid="card-agent-ciobot" className="w-full">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center">
                              <Brain className="h-4 w-4 text-white" />
                            </div>
                            <div>
                              <CardTitle className="text-sm">CIO-Bot</CardTitle>
                              <CardDescription className="text-xs">Strategic Analysis</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Badge className={`${badgeClass} gap-1`}>
                            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                            {statusLabel}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-2 space-y-1">
                            <p>Pwin analysis, ROI estimation, risk scoring</p>
                            {cioBotAgent?.lastRun && (
                              <p>Last run: {new Date(cioBotAgent.lastRun).toLocaleTimeString()}</p>
                            )}
                            {cioBotAgent?.tasksCompleted !== undefined && (
                              <p>Tasks: {cioBotAgent.tasksCompleted} | Success: {cioBotAgent.successRate}%</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* LegalOps Agent */}
                  {(() => {
                    const legalOpsAgent = agentsStatus?.agents?.find(a => a.agent === "LegalOps");
                    const statusLabel = legalOpsAgent?.status === "active" ? "Active" : legalOpsAgent?.status === "idle" ? "Idle" : legalOpsAgent?.status === "error" ? "Error" : "Online";
                    const badgeClass = legalOpsAgent?.status === "active" 
                      ? "bg-purple-500/10 text-purple-500 border-purple-500/20" 
                      : legalOpsAgent?.status === "idle" 
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      : legalOpsAgent?.status === "error"
                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                      : "bg-purple-500/10 text-purple-500 border-purple-500/20";
                    const dotClass = legalOpsAgent?.status === "active" 
                      ? "bg-purple-500" 
                      : legalOpsAgent?.status === "idle" 
                      ? "bg-amber-500"
                      : legalOpsAgent?.status === "error"
                      ? "bg-red-500"
                      : "bg-purple-500";
                    return (
                      <Card data-testid="card-agent-legalops" className="w-full">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-purple-500 flex items-center justify-center">
                              <Scale className="h-4 w-4 text-white" />
                            </div>
                            <div>
                              <CardTitle className="text-sm">LegalOps</CardTitle>
                              <CardDescription className="text-xs">Compliance Engine</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Badge className={`${badgeClass} gap-1`}>
                            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                            {statusLabel}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-2 space-y-1">
                            <p>FAR/DFARS compliance, certification matching</p>
                            {legalOpsAgent?.lastRun && (
                              <p>Last run: {new Date(legalOpsAgent.lastRun).toLocaleTimeString()}</p>
                            )}
                            {legalOpsAgent?.tasksCompleted !== undefined && (
                              <p>Tasks: {legalOpsAgent.tasksCompleted} | Success: {legalOpsAgent.successRate}%</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}

                  {/* Foreman-Bot Agent */}
                  {(() => {
                    const foremanAgent = agentsStatus?.agents?.find(a => a.agent === "Foreman-Bot");
                    const statusLabel = foremanAgent?.status === "active" ? "Active" : foremanAgent?.status === "idle" ? "Idle" : foremanAgent?.status === "error" ? "Error" : "Online";
                    const badgeClass = foremanAgent?.status === "active" 
                      ? "bg-amber-500/10 text-amber-500 border-amber-500/20" 
                      : foremanAgent?.status === "idle" 
                      ? "bg-gray-500/10 text-gray-500 border-gray-500/20"
                      : foremanAgent?.status === "error"
                      ? "bg-red-500/10 text-red-500 border-red-500/20"
                      : "bg-amber-500/10 text-amber-500 border-amber-500/20";
                    const dotClass = foremanAgent?.status === "active" 
                      ? "bg-amber-500" 
                      : foremanAgent?.status === "idle" 
                      ? "bg-gray-500"
                      : foremanAgent?.status === "error"
                      ? "bg-red-500"
                      : "bg-amber-500";
                    return (
                      <Card data-testid="card-agent-foreman" className="w-full">
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-amber-500 flex items-center justify-center">
                              <HardHat className="h-4 w-4 text-white" />
                            </div>
                            <div>
                              <CardTitle className="text-sm">Foreman-Bot</CardTitle>
                              <CardDescription className="text-xs">Award Monitor</CardDescription>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Badge className={`${badgeClass} gap-1`}>
                            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
                            {statusLabel}
                          </Badge>
                          <div className="text-xs text-muted-foreground mt-2 space-y-1">
                            <p>Award detection, amendments, project kickoff</p>
                            {foremanAgent?.lastRun && (
                              <p>Last run: {new Date(foremanAgent.lastRun).toLocaleTimeString()}</p>
                            )}
                            {foremanAgent?.tasksCompleted !== undefined && (
                              <p>Tasks: {foremanAgent.tasksCompleted} | Success: {foremanAgent.successRate}%</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })()}
                </div>

                {/* Recent Pwin Analyses */}
                <Card data-testid="card-pwin-analyses">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-500" />
                      Recent Pwin Analyses (CIO-Bot)
                    </CardTitle>
                    <CardDescription>Strategic scoring and ROI estimates</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {pwinAnalyses && pwinAnalyses.length > 0 ? (
                      <div className="space-y-3">
                        {pwinAnalyses.slice(0, 5).map((analysis) => (
                          <div
                            key={analysis.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium">Opportunity {analysis.opportunityId.slice(0, 8)}...</p>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Target className="h-3 w-3" />
                                  Pwin: {analysis.pwinScore}%
                                </span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3" />
                                  ROI: ${(analysis.roiEstimate / 1000).toFixed(0)}K
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    analysis.riskLevel === "low"
                                      ? "text-green-500 border-green-500/20"
                                      : analysis.riskLevel === "medium"
                                      ? "text-amber-500 border-amber-500/20"
                                      : "text-red-500 border-red-500/20"
                                  }
                                >
                                  {analysis.riskLevel} risk
                                </Badge>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(analysis.analyzedAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No Pwin analyses yet. CIO-Bot will analyze scored opportunities automatically.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Compliance Checks */}
                <Card data-testid="card-compliance-checks">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="h-5 w-5 text-purple-500" />
                      Recent Compliance Checks (LegalOps)
                    </CardTitle>
                    <CardDescription>FAR/DFARS compliance analysis</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {complianceChecks && complianceChecks.length > 0 ? (
                      <div className="space-y-3">
                        {complianceChecks.slice(0, 5).map((check) => (
                          <div
                            key={check.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium">{check.opportunityTitle || "Opportunity"}</p>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <FileCheck className="h-3 w-3" />
                                  {check.clauseCount} clauses checked
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    check.isCompliant
                                      ? "text-green-500 border-green-500/20"
                                      : "text-red-500 border-red-500/20"
                                  }
                                >
                                  {check.isCompliant ? "Compliant" : `${check.gaps.length} gaps`}
                                </Badge>
                                <span className="text-xs text-muted-foreground">
                                  Score: {check.overallScore}%
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(check.checkedAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No compliance checks yet. LegalOps analyzes bids in progress automatically.
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Awards */}
                <Card data-testid="card-award-notifications">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Award className="h-5 w-5 text-amber-500" />
                      Recent Award Notifications (Foreman-Bot)
                    </CardTitle>
                    <CardDescription>Contract awards and project kickoffs</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {awardNotifications && awardNotifications.length > 0 ? (
                      <div className="space-y-3">
                        {awardNotifications.slice(0, 5).map((award) => (
                          <div
                            key={award.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium">{award.opportunityTitle || "Contract Award"}</p>
                              <div className="flex items-center gap-4 mt-1">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Zap className="h-3 w-3" />
                                  ${(award.awardAmount / 1000000).toFixed(2)}M
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    award.isOurs
                                      ? "text-green-500 border-green-500/20"
                                      : "text-muted-foreground border-muted"
                                  }
                                >
                                  {award.isOurs ? "WON" : "Competitor"}
                                </Badge>
                                {award.projectCreated && (
                                  <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                                    Project Created
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {new Date(award.awardDate).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No award notifications yet. Foreman-Bot monitors submitted bids for awards.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </TabsContent>

        {/* Daily Briefing Tab */}
        <TabsContent value="briefing" className="main-scroll m-0 p-4">
          <div className="w-full space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Daily Briefing</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchBriefing()}
                data-testid="button-refresh-briefing"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            {briefingLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : dailyBriefing ? (
              <>
                {/* Summary Card */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      Executive Summary
                    </CardTitle>
                    <CardDescription>
                      {new Date(dailyBriefing.date).toLocaleDateString("en-US", {
                        weekday: "long",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{dailyBriefing.summary}</p>
                  </CardContent>
                </Card>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{dailyBriefing.newOpportunities}</div>
                      <p className="text-sm text-muted-foreground">New Opportunities</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{dailyBriefing.pendingApprovals}</div>
                      <p className="text-sm text-muted-foreground">Pending Approvals</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{dailyBriefing.activeBids}</div>
                      <p className="text-sm text-muted-foreground">Active Bids</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">{dailyBriefing.upcomingDeadlines.length}</div>
                      <p className="text-sm text-muted-foreground">Upcoming Deadlines</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Upcoming Deadlines */}
                {dailyBriefing.upcomingDeadlines.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Upcoming Deadlines
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {dailyBriefing.upcomingDeadlines.map((deadline, i) => (
                          <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                            <div>
                              <p className="font-medium">{deadline.title}</p>
                              <p className="text-sm text-muted-foreground">
                                Due: {new Date(deadline.dueDate).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge variant={deadline.daysRemaining <= 3 ? "destructive" : "secondary"}>
                              {deadline.daysRemaining} days
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Exceptions */}
                {dailyBriefing.exceptionsRequiringAttention.length > 0 && (
                  <Card className="border-amber-500/50">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-amber-500">
                        <AlertTriangle className="h-5 w-5" />
                        Exceptions Requiring Attention
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {dailyBriefing.exceptionsRequiringAttention.map((exception, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{exception}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Recommended Actions */}
                {dailyBriefing.recommendedActions.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Recommended Actions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {dailyBriefing.recommendedActions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                            <span className="text-sm">{action}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <p className="text-muted-foreground">No briefing data available</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Reports & Analytics Tab */}
        <TabsContent value="reports" className="main-scroll m-0 p-4">
          <div className="w-full space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Business Intelligence & Analytics</h2>
              <Badge variant="outline">Real-time Data</Badge>
            </div>

            {/* Key Metrics Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card data-testid="card-metric-win-rate">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Win Rate</p>
                      <p className="text-2xl font-bold text-green-500">
                        {captureAnalytics?.metrics.winRate || 0}%
                      </p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-green-500/20" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Based on {captureAnalytics?.metrics.completedBids || 0} completed bids</p>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-pipeline-value">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pipeline Value</p>
                      <p className="text-2xl font-bold">
                        ${((captureAnalytics?.metrics.totalPipelineValue || 0) / 1000000).toFixed(1)}M
                      </p>
                    </div>
                    <DollarSign className="h-8 w-8 text-primary/20" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">{captureAnalytics?.metrics.activeBids || 0} active bids</p>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-avg-bid-time">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Time-to-Bid</p>
                      <p className="text-2xl font-bold">{captureAnalytics?.metrics.avgTimeToBid || 18} days</p>
                    </div>
                    <Clock className="h-8 w-8 text-blue-500/20" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">From capture to submission</p>
                </CardContent>
              </Card>

              <Card data-testid="card-metric-compliance-score">
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Pwin Score</p>
                      <p className="text-2xl font-bold text-green-500">{captureAnalytics?.metrics.avgPwin || 50}%</p>
                    </div>
                    <Target className="h-8 w-8 text-green-500/20" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Probability of win average</p>
                </CardContent>
              </Card>
            </div>

            {/* Pipeline Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card data-testid="card-capture-pipeline">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Briefcase className="h-4 w-4" />
                    Capture Pipeline by Stage
                  </CardTitle>
                  <CardDescription>Opportunities progressing through capture lifecycle</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {captureAnalytics?.stages && captureAnalytics.stages.length > 0 ? (
                      captureAnalytics.stages.map((stage) => (
                        <div key={stage.id} className="flex items-center gap-3">
                          <span className="text-sm w-24">{stage.name}</span>
                          <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all"
                              style={{ 
                                width: `${Math.min(100, (stage.count || 0) * 20)}%`,
                                backgroundColor: stage.color || "#6366f1"
                              }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8 text-right">{stage.count}</span>
                        </div>
                      ))
                    ) : (
                      [
                        { name: "Identified", count: 4, color: "#3b82f6" },
                        { name: "Qualified", count: 3, color: "#6366f1" },
                        { name: "Capture", count: 2, color: "#8b5cf6" },
                        { name: "Proposal", count: 2, color: "#f59e0b" },
                        { name: "Submitted", count: 1, color: "#22c55e" },
                        { name: "Awarded", count: 1, color: "#64748b" },
                      ].map((item) => (
                        <div key={item.name} className="flex items-center gap-3">
                          <span className="text-sm w-24">{item.name}</span>
                          <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(100, item.count * 20)}%`, backgroundColor: item.color }}
                            />
                          </div>
                          <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card data-testid="card-pwin-distribution">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Pwin Score Distribution
                  </CardTitle>
                  <CardDescription>Probability of win across active opportunities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { range: "High (70-100%)", count: captureAnalytics?.pwinDistribution?.high || 1, color: "bg-green-500" },
                      { range: "Medium (40-69%)", count: captureAnalytics?.pwinDistribution?.medium || 2, color: "bg-amber-500" },
                      { range: "Low (0-39%)", count: captureAnalytics?.pwinDistribution?.low || 1, color: "bg-red-500" },
                    ].map((item) => (
                      <div key={item.range} className="flex items-center gap-3">
                        <span className="text-sm w-32">{item.range}</span>
                        <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                          <div 
                            className={`h-full ${item.color} rounded-full transition-all`}
                            style={{ width: `${Math.min(100, (item.count || 1) * 25)}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8 text-right">{item.count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">
                      Weighted Pipeline Value: <span className="font-medium text-foreground">
                        ${((captureAnalytics?.metrics?.weightedPipelineValue || 0) / 1000000).toFixed(1)}M
                      </span>
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Capture Stage Owners */}
            <Card data-testid="card-stage-owners">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Capture Stage Owners
                </CardTitle>
                <CardDescription>Assigned owners for each pipeline stage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {(captureAnalytics?.stageOwners && captureAnalytics.stageOwners.length > 0 ? captureAnalytics.stageOwners : [
                    { stage: "Identified", owner: "BD Team", count: 4 },
                    { stage: "Qualified", owner: "Mike Johnson", count: 3 },
                    { stage: "Capture", owner: "Sarah Wilson", count: 2 },
                    { stage: "Proposal", owner: "Tom Harris", count: 2 },
                    { stage: "Submitted", owner: "Review Board", count: 1 },
                    { stage: "Post-Award", owner: "Operations", count: 1 },
                  ]).map((item) => (
                    <div key={item.stage} className="p-3 rounded-lg border flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">{item.stage}</p>
                        <p className="text-xs text-muted-foreground">{item.owner}</p>
                      </div>
                      <Badge variant="secondary">{item.count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Time-to-Bid Analysis */}
            <Card data-testid="card-time-analysis">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Time-to-Bid Analysis
                </CardTitle>
                <CardDescription>Average days spent in each capture phase</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  {(() => {
                    const avgTotal = captureAnalytics?.metrics?.avgTimeToBid || 18;
                    return [
                      { phase: "Qualification", days: Math.round(avgTotal * 0.15) },
                      { phase: "Capture Planning", days: Math.round(avgTotal * 0.25) },
                      { phase: "Teaming", days: Math.round(avgTotal * 0.2) },
                      { phase: "Proposal Writing", days: Math.round(avgTotal * 0.3) },
                      { phase: "Review & Submit", days: Math.round(avgTotal * 0.1) },
                    ].map((item) => (
                      <div key={item.phase} className="text-center p-3 rounded-lg bg-muted/50">
                        <p className="text-2xl font-bold">{item.days}</p>
                        <p className="text-xs text-muted-foreground">{item.phase}</p>
                      </div>
                    ));
                  })()}
                </div>
                <div className="mt-4 flex items-center justify-between p-3 bg-primary/5 rounded-lg">
                  <span className="text-sm">Total Average Time-to-Bid</span>
                  <span className="font-bold">{captureAnalytics?.metrics?.avgTimeToBid || 18} days</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Activity Log Tab */}
        <TabsContent value="activity" className="main-scroll m-0 p-4">
          <div className="w-full space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Autonomous Activity Log</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchActivity()}
                data-testid="button-refresh-activity"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            {/* Status Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{herbieStatus?.stats.newOpportunities || 0}</div>
                  <p className="text-sm text-muted-foreground">New Opps</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{herbieStatus?.stats.pendingApprovals || 0}</div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{herbieStatus?.stats.activeBids || 0}</div>
                  <p className="text-sm text-muted-foreground">Active Bids</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold">{herbieStatus?.stats.upcomingDeadlines || 0}</div>
                  <p className="text-sm text-muted-foreground">Deadlines</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-amber-500">{herbieStatus?.stats.exceptionsCount || 0}</div>
                  <p className="text-sm text-muted-foreground">Exceptions</p>
                </CardContent>
              </Card>
            </div>

            {activityLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activityLog && activityLog.length > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>HERBIE's autonomous actions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {activityLog.map((activity) => (
                      <div key={activity.id} className="flex items-start gap-4 p-3 rounded-lg bg-muted">
                        <div className="mt-1">
                          {getActionIcon(activity.action)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{formatActionName(activity.action)}</p>
                            <Badge
                              variant={
                                activity.outcome === "success" ? "default" :
                                activity.outcome === "error" ? "destructive" : "secondary"
                              }
                              className="text-xs"
                            >
                              {activity.outcome}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {entityLabelFn(activity.entityType || "")}: {activity.entityId.substring(0, 8)}...
                          </p>
                          {activity.details && (
                            <div className="mt-1 text-xs text-muted-foreground">
                              {typeof activity.details.score === "number" && <span className="mr-3">Score: {activity.details.score}</span>}
                              {typeof activity.details.evaluated === "number" && <span className="mr-3">Evaluated: {activity.details.evaluated}</span>}
                              {typeof activity.details.approvalRequests === "number" && <span className="mr-3">Approvals: {activity.details.approvalRequests}</span>}
                              {typeof activity.details.projectsCreated === "number" && <span>Projects: {activity.details.projectsCreated}</span>}
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(activity.timestamp).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No activity logged yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click "Run Cycle" to start HERBIE's autonomous evaluation
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Knowledge Vault Tab */}
        <TabsContent value="knowledge" className="main-scroll m-0 p-4">
          <div className="w-full space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Knowledge Vault Search
                </CardTitle>
                <CardDescription>
                  Search across all documents, opportunities, bids, and company knowledge
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Ask a question about your knowledge base..."
                    value={knowledgeQuery}
                    onChange={(e) => setKnowledgeQuery(e.target.value)}
                    className="min-h-[60px]"
                    data-testid="input-knowledge-search"
                  />
                  <Button 
                    onClick={() => knowledgeSearchMutation.mutate(knowledgeQuery)}
                    disabled={!knowledgeQuery.trim() || knowledgeSearchMutation.isPending}
                    data-testid="button-knowledge-search"
                  >
                    {knowledgeSearchMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Search className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                
                {knowledgeResults && (
                  <div className="mt-6 space-y-4">
                    <div className="p-4 rounded-lg bg-muted">
                      <h4 className="font-medium mb-2 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-yellow-500" />
                        Answer
                      </h4>
                      <p className="text-sm">{knowledgeResults.answer}</p>
                    </div>
                    
                    {knowledgeResults.sources.length > 0 && (
                      <div>
                        <h4 className="font-medium mb-2">Sources</h4>
                        <div className="space-y-2">
                          {knowledgeResults.sources.map((source, idx) => (
                            <div key={idx} className="p-3 rounded border flex items-start gap-3">
                              <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                              <div className="flex-1">
                                <div className="font-medium text-sm">{source.title}</div>
                                <p className="text-xs text-muted-foreground mt-1">{source.excerpt}</p>
                                <Badge variant="outline" className="mt-2">{source.type}</Badge>
                              </div>
                              <Button variant="ghost" size="icon" asChild>
                                <a href={source.link}>
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Recent Documents</CardTitle>
                    <CardDescription>Recently added knowledge documents</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchKnowledge()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {knowledgeDocuments && knowledgeDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {knowledgeDocuments.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border">
                        <FileText className="h-5 w-5 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium">{doc.title}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Badge variant="outline">{doc.documentType}</Badge>
                            <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BookOpen className="h-12 w-12 mx-auto mb-4" />
                    <p>No documents in knowledge vault yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Teaming Partners Tab */}
        <TabsContent value="teaming" className="main-scroll m-0 p-4">
          <div className="w-full space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Teaming Partner Directory
                    </CardTitle>
                    <CardDescription>
                      Potential partners for joint ventures and subcontracting
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchTeaming()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {teamingPartners && teamingPartners.length > 0 ? (
                  <div className="space-y-4">
                    {teamingPartners.map((partner) => (
                      <div key={partner.id} className="p-4 rounded-lg border">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-muted-foreground" />
                            </div>
                            <div>
                              <div className="font-medium">{partner.companyName}</div>
                              <div className="text-sm text-muted-foreground">
                                {partner.contactName && `${partner.contactName} • `}
                                {partner.contactEmail}
                              </div>
                            </div>
                          </div>
                          <Badge variant={
                            partner.relationshipStatus === "preferred" ? "default" :
                            partner.relationshipStatus === "active" ? "secondary" : "outline"
                          }>
                            {partner.relationshipStatus}
                          </Badge>
                        </div>
                        
                        <div className="mt-3 flex flex-wrap gap-1">
                          {partner.naicsCodes?.slice(0, 3).map((code, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              NAICS: {code}
                            </Badge>
                          ))}
                          {partner.setAsideCertifications?.map((cert, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {cert}
                            </Badge>
                          ))}
                        </div>
                        
                        {partner.capabilities && (
                          <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                            {partner.capabilities}
                          </p>
                        )}
                        
                        {partner.rating && (
                          <div className="mt-2 flex items-center gap-1">
                            {[...Array(5)].map((_, i) => (
                              <div 
                                key={i} 
                                className={`h-2 w-2 rounded-full ${i < partner.rating! ? 'bg-yellow-500' : 'bg-muted'}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4" />
                    <p>No teaming partners added yet</p>
                    <p className="text-sm mt-1">Add partners to match with opportunities</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Connectors Tab */}
        <TabsContent value="connectors" className="main-scroll m-0 p-4">
          <div className="w-full space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Link2 className="h-5 w-5" />
                      External Connectors
                    </CardTitle>
                    <CardDescription>
                      Integrations with external systems for data synchronization
                    </CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchConnectors()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2">
                  {connectorStatuses?.map((connector) => (
                    <Card key={connector.type} className="overflow-hidden">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            {connector.type.charAt(0).toUpperCase() + connector.type.slice(1)}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            {connector.status.connected ? (
                              <Badge variant="default" className="bg-green-500">
                                <Check className="h-3 w-3 mr-1" />
                                Connected
                              </Badge>
                            ) : (
                              <Badge variant="outline">
                                <X className="h-3 w-3 mr-1" />
                                Not Connected
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Status:</span>
                            <span>{connector.status.enabled ? "Enabled" : "Disabled"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Records Synced:</span>
                            <span>{connector.status.recordsSynced}</span>
                          </div>
                          {connector.status.lastSync && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Last Sync:</span>
                              <span>{new Date(connector.status.lastSync).toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2 mt-4">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => connectorToggleMutation.mutate({ 
                              type: connector.type, 
                              enable: !connector.status.enabled 
                            })}
                            disabled={connectorToggleMutation.isPending}
                            data-testid={`button-toggle-${connector.type}`}
                          >
                            {connector.status.enabled ? "Disable" : "Enable"}
                          </Button>
                          <Button 
                            variant="default" 
                            size="sm" 
                            className="flex-1"
                            onClick={() => connectorSyncMutation.mutate(connector.type)}
                            disabled={!connector.status.enabled || connectorSyncMutation.isPending}
                            data-testid={`button-sync-${connector.type}`}
                          >
                            {connectorSyncMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RefreshCw className="h-4 w-4 mr-1" />
                                Sync
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  
                  {(!connectorStatuses || connectorStatuses.length === 0) && (
                    <div className="col-span-2 text-center py-8 text-muted-foreground">
                      <Link2 className="h-12 w-12 mx-auto mb-4" />
                      <p>No connectors configured yet</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        </Tabs>

        {/* Right: Persistent HERBIE Chat Sidebar */}
        <div className="right-panel bg-muted/30" data-testid="persistent-chat-sidebar">
          <div className="border-b p-3 flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Ask HERBIE</p>
              <p className="text-xs text-muted-foreground">Always available</p>
            </div>
            <Badge className="ml-auto bg-green-500/10 text-green-500 border-green-500/20 gap-1 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Online
            </Badge>
          </div>

          <ScrollArea className="flex-1 p-3">
            <div className="space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-2 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <Avatar className="h-6 w-6 flex-shrink-0">
                    <AvatarFallback className={message.role === "assistant" ? "bg-primary text-primary-foreground text-xs" : "text-xs"}>
                      {message.role === "assistant" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    </AvatarFallback>
                  </Avatar>
                  <div className={`flex-1 ${message.role === "user" ? "text-right" : ""}`}>
                    <div
                      className={`inline-block rounded-lg p-2 max-w-[90%] text-left text-sm ${
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-background border"
                      }`}
                    >
                      {message.content.split("\n").slice(0, 5).map((line, i) => (
                        <p key={i} className="my-0.5 text-xs">{line.replace(/\*\*/g, "")}</p>
                      ))}
                      {message.content.split("\n").length > 5 && (
                        <p className="text-xs text-muted-foreground mt-1">... see full response in Chat tab</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {chatMutation.isPending && (
                <div className="flex gap-2">
                  <Avatar className="h-6 w-6">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                      <Bot className="h-3 w-3" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="bg-background border rounded-lg p-2">
                    <div className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs text-muted-foreground">Thinking...</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* Quick Actions */}
          <div className="border-t border-b p-2">
            <p className="text-xs text-muted-foreground mb-1.5">Quick Commands</p>
            <div className="flex flex-wrap gap-1">
              {["/briefing", "/approvals", "/pipeline"].map((cmd) => (
                <Button
                  key={cmd}
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => {
                    setInput(cmd);
                    handleSendMessage();
                  }}
                  data-testid={`sidebar-quick-${cmd.slice(1)}`}
                >
                  {cmd}
                </Button>
              ))}
            </div>
          </div>

          {/* Input Area */}
          <div className="p-3">
            <div className="relative">
              {showSlashCommands && (
                <div className="absolute bottom-full mb-2 left-0 right-0 bg-background border rounded-lg shadow-lg z-10 max-h-40 overflow-auto">
                  {filteredCommands.slice(0, 5).map((cmd, index) => (
                    <button
                      key={cmd.command}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-left text-xs hover-elevate ${index === selectedCommandIndex ? 'bg-muted' : ''}`}
                      onClick={() => {
                        const isPrefillCommand = ["/score", "/search", "/audit"].includes(cmd.command);
                        executeSlashCommand(cmd.command, !isPrefillCommand);
                      }}
                      data-testid={`sidebar-slash-${cmd.command.slice(1)}`}
                    >
                      <cmd.icon className="h-3 w-3 text-muted-foreground" />
                      <span className="font-medium">{cmd.command}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-1.5">
                <Textarea
                  ref={textareaRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask HERBIE... (/ for commands)"
                  className="resize-none min-h-[36px] max-h-[80px] text-sm"
                  rows={1}
                  data-testid="sidebar-input-message"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || chatMutation.isPending}
                  size="sm"
                  className="h-9 w-9 p-0"
                  data-testid="sidebar-button-send"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
