import { useState, useEffect, Component, ErrorInfo, ReactNode, lazy, Suspense } from "react";
import { Switch, Route, useLocation, useRoute } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { DocumentViewerProvider } from "@/contexts/document-viewer-context";
import { ProjectContextProvider } from "@/nav/project-context";
import { EntityDrawer } from "@/features/drawers/EntityDrawer";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { ModeBadge } from "@/components/ModeBadge";
import { Bell, Search, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

interface RouteErrorBoundaryProps {
  children: ReactNode;
  routeName: string;
}

interface RouteErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): Partial<RouteErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[RouteErrorBoundary:${this.props.routeName}] Caught error:`, error, errorInfo);
    try {
      fetch("/api/debug/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          error: error.message,
          componentStack: errorInfo.componentStack?.slice(0, 1000),
          route: this.props.routeName,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
        }),
      }).catch(() => {});
    } catch (_) {}
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6" data-testid="route-error-boundary">
          <div className="max-w-lg mx-auto bg-destructive/10 border border-destructive/20 rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-6 w-6" />
              <h2 className="text-lg font-semibold">Page Error: {this.props.routeName}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              This page encountered an error. Other pages should still work.
            </p>
            {this.state.error && (
              <div className="bg-muted rounded p-3 overflow-auto max-h-32">
                <p className="text-sm font-mono text-destructive">{this.state.error.message}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => this.setState({ hasError: false, error: null })}
                data-testid="button-route-try-again"
              >
                Try Again
              </Button>
              <Button
                onClick={() => window.location.reload()}
                className="gap-2"
                data-testid="button-route-reload"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function SafeRoute({ component: Comp, name }: { component: React.ComponentType<any>, name: string }) {
  return (
    <RouteErrorBoundary routeName={name}>
      <Comp />
    </RouteErrorBoundary>
  );
}

function EntityDetailRoute() {
  const [, params] = useRoute("/entity/:entityType/:id");
  if (!params?.entityType || !params?.id) return <NotFound />;
  return (
    <RouteErrorBoundary routeName="EntityDetail">
      <EntityDetail entityType={params.entityType} id={params.id} />
    </RouteErrorBoundary>
  );
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-card border rounded-lg p-6 space-y-4">
            <div className="flex items-center gap-3 text-destructive">
              <AlertTriangle className="h-8 w-8" />
              <h1 className="text-xl font-semibold">Something went wrong</h1>
            </div>
            <p className="text-muted-foreground">
              The application encountered an unexpected error. Please try refreshing the page.
            </p>
            {this.state.error && (
              <div className="bg-muted rounded p-3 overflow-auto max-h-40">
                <p className="text-sm font-mono text-destructive">
                  {this.state.error.message}
                </p>
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                    {this.state.errorInfo.componentStack.slice(0, 500)}
                  </pre>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button onClick={this.handleReload} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </Button>
              <Button variant="outline" onClick={this.handleReset}>
                Try Again
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import Opportunities from "@/pages/opportunities";
import Approvals from "@/pages/approvals";
import Bids from "@/pages/bids";
import BidJacket from "@/pages/bid-jacket";
import Herbie from "@/pages/herbie";
import HomeAssistant from "@/pages/home-assistant";
import Integrations from "@/pages/integrations";
import SettingsPage from "@/pages/settings";
import Inventory from "@/pages/inventory";
import Tickets from "@/pages/tickets";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/projects/ProjectDetail";
import ProjectWorkspace from "@/pages/projects/ProjectWorkspace";
import EntityDetail from "@/pages/EntityDetail";
import Workforce from "@/pages/workforce";
import Vendors from "@/pages/vendors";
import Compliance from "@/pages/compliance";
import Finance from "@/pages/finance";
import Marketing from "@/pages/marketing";
import Analytics from "@/pages/analytics";
import Documents from "@/pages/documents";
import Contacts from "@/pages/contacts";
import AuditLog from "@/pages/audit";
import Notifications from "@/pages/notifications";
import KnowledgeVault from "@/pages/knowledge-vault";
import Companies from "@/pages/companies";
import Blueprints from "@/pages/blueprints";
import SmartTakeoff from "@/pages/smart-takeoff";
import DesignSystems from "@/pages/design-systems";
import EgnyteDiagnostics from "@/pages/egnyte-diagnostics";
import EgnyteSyncMonitor from "@/pages/egnyte-sync-monitor";
import AIReviewQueue from "@/pages/ai-review-queue";
import ViewerDemo from "@/pages/viewer-demo";
import VendorPortal from "@/pages/vendor-portal";
import Competitors from "@/pages/competitors";
import FederalSearch from "@/pages/federal-search";
import CaptureFeed from "@/pages/capture-feed";
import CapturePipeline from "@/pages/capture-pipeline";
import CaptureDetail from "@/pages/capture-detail";
import CaptureAutomation from "@/pages/capture-automation";
import FitProfiles from "@/pages/fit-profiles";
import OrgBrain from "@/pages/org-brain";
import HigherGov from "@/pages/highergov";
import EventLog from "@/pages/event-log";
import AutomationWorkflows from "@/pages/automation-workflows";
import ExecutionTasks from "@/pages/execution-tasks";
import ExecutionSubmittals from "@/pages/execution-submittals";
import ExecutionRFIs from "@/pages/execution-rfis";
import ExecutionPurchaseOrders from "@/pages/execution-purchase-orders";
import DataHygiene from "@/pages/data-hygiene";
import ProjectCockpit from "@/pages/project-cockpit";
const ProactiveIntelligence = lazy(() => import("@/pages/proactive-intelligence"));
const CoiTracker = lazy(() => import("@/pages/coi-tracker"));
const BidReadiness = lazy(() => import("@/pages/bid-readiness"));
const VoiceDailyLog = lazy(() => import("./pages/voice-daily-log"));
const VendorConfidence = lazy(() => import('@/pages/vendor-confidence-dashboard'));
const HerbieDigest = lazy(() => import('@/pages/herbie-digest-page'));
const HerbieAutonomous = lazy(() => import('@/pages/herbie-autonomous-dashboard'));
const HerbieMemory = lazy(() => import('@/pages/herbie-memory-inspector'));
const ChangeOrderApprovals = lazy(() => import('@/pages/approvals'));
import NotFound from "@/pages/not-found";

function LegacyRedirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation(to); }, [to, setLocation]);
  return null;
}

function Router() {
  return (
    <Switch>
      {/* ── Home ── */}
      <Route path="/" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/home" component={() => <SafeRoute component={HomeAssistant} name="Home" />} />
      <Route path="/dashboard" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/home/my-day" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/approvals" component={() => <SafeRoute component={Approvals} name="Approvals" />} />
      <Route path="/notifications" component={() => <SafeRoute component={Notifications} name="Notifications" />} />
      <Route path="/planner" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/calendar" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/my-day" component={() => <LegacyRedirect to="/home" />} />

      {/* ── Capture ── */}
      <Route path="/capture/opportunities" component={() => <SafeRoute component={Opportunities} name="Opportunities" />} />
      <Route path="/capture/pipeline" component={() => <SafeRoute component={CapturePipeline} name="Pipeline" />} />
      <Route path="/capture/agencies" component={() => <SafeRoute component={Companies} name="Agencies" />} />
      <Route path="/capture/competitors" component={() => <SafeRoute component={Competitors} name="Competitors" />} />
      <Route path="/capture/federal-search" component={() => <SafeRoute component={FederalSearch} name="FederalSearch" />} />
      <Route path="/capture/highergov" component={() => <SafeRoute component={HigherGov} name="HigherGov" />} />
      <Route path="/capture/automation" component={() => <SafeRoute component={CaptureAutomation} name="CaptureAutomation" />} />
      <Route path="/capture/fit-profiles" component={() => <SafeRoute component={FitProfiles} name="FitProfiles" />} />
      <Route path="/capture/feed" component={() => <SafeRoute component={CaptureFeed} name="CaptureFeed" />} />
      <Route path="/capture/opportunity/:id" component={() => <SafeRoute component={CaptureDetail} name="CaptureDetail" />} />
      <Route path="/capture/pursuits/:id" component={() => <SafeRoute component={BidJacket} name="PursuitWorkspace" />} />

      {/* ── Pre-Construction ── */}
      <Route path="/precon/dashboard" component={() => <LegacyRedirect to="/capture/opportunities" />} />

      {/* ── Estimate ── */}
      <Route path="/estimate/blueprints" component={() => <SafeRoute component={Blueprints} name="Blueprints" />} />
      <Route path="/blueprints/:id/smart-takeoff" component={() => <SafeRoute component={SmartTakeoff} name="SmartTakeoff" />} />
      <Route path="/estimate/takeoff" component={() => <SafeRoute component={DesignSystems} name="TakeoffEngine" />} />
      <Route path="/estimate/design-systems" component={() => <SafeRoute component={DesignSystems} name="DesignSystems" />} />

      {/* ── PM / Execution (legacy redirects) ── */}
      <Route path="/pm/cockpit" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/operations/dashboard" component={() => <LegacyRedirect to="/home" />} />

      {/* ── Execution ── */}
      <Route path="/projects/active" component={() => <SafeRoute component={Projects} name="ActiveProjects" />} />
      <Route path="/projects/:id/cockpit" component={() => <SafeRoute component={ProjectCockpit} name="ProjectCockpit" />} />
      <Route path="/projects/:projectId/:module" component={() => <SafeRoute component={ProjectWorkspace} name="ProjectWorkspaceModule" />} />
      <Route path="/projects/:id" component={() => <SafeRoute component={ProjectDetail} name="ProjectWorkspace" />} />
      <Route path="/execution/tasks" component={() => <SafeRoute component={ExecutionTasks} name="Tasks" />} />
      <Route path="/execution/submittals" component={() => <SafeRoute component={ExecutionSubmittals} name="Submittals" />} />
      <Route path="/execution/rfis" component={() => <SafeRoute component={ExecutionRFIs} name="RFIs" />} />
      <Route path="/execution/purchase-orders" component={() => <SafeRoute component={ExecutionPurchaseOrders} name="PurchaseOrders" />} />
      <Route path="/execution/tickets" component={() => <SafeRoute component={Tickets} name="Tickets" />} />
      <Route path="/execution/inventory" component={() => <SafeRoute component={Inventory} name="Inventory" />} />
      <Route path="/execution/workforce" component={() => <SafeRoute component={Workforce} name="Workforce" />} />
      <Route path="/execution/vendors" component={() => <SafeRoute component={Vendors} name="Vendors" />} />
        <Route path="/coi" component={() => <Suspense fallback={<div>Loading...</div>}><CoiTracker /></Suspense>} />
              <Route path="/bid-readiness" component={() => <Suspense fallback={<div>Loading...</div>}><BidReadiness /></Suspense>} />
        <Route path="/voice-daily-log" component={() => <Suspense fallback={<div>Loading...</div>}><VoiceDailyLog /></Suspense>} />
              <Route path="/proactive-intelligence" component={() => <Suspense fallback={<div>Loading...</div>}><ProactiveIntelligence /></Suspense>} />
              <Route path="/vendor-confidence" component={() => <Suspense fallback={<div>Loading...</div>}><VendorConfidence /></Suspense>} />
              <Route path="/herbie-digest" component={() => <Suspense fallback={<div>Loading...</div>}><HerbieDigest /></Suspense>} />
              <Route path="/herbie-autonomous" component={() => <Suspense fallback={<div>Loading...</div>}><HerbieAutonomous /></Suspense>} />
              <Route path="/herbie-memory" component={() => <Suspense fallback={<div>Loading...</div>}><HerbieMemory /></Suspense>} />
              <Route path="/change-order-approvals" component={() => <Suspense fallback={<div>Loading...</div>}><ChangeOrderApprovals /></Suspense>} />

      {/* ── Financial Control ── */}
      <Route path="/financial/overview" component={() => <SafeRoute component={Finance} name="Finance" />} />
      <Route path="/financial/bills" component={() => <SafeRoute component={Finance} name="Bills" />} />
      <Route path="/financial/invoices" component={() => <SafeRoute component={Finance} name="Invoices" />} />
      <Route path="/financial/change-orders" component={() => <SafeRoute component={Finance} name="ChangeOrders" />} />
      <Route path="/financial/dashboard" component={() => <LegacyRedirect to="/financial/overview" />} />
      <Route path="/executive/dashboard" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/financial/compliance" component={() => <SafeRoute component={Compliance} name="Compliance" />} />

      {/* ── Knowledge Base ── */}
      <Route path="/knowledge/base" component={() => <SafeRoute component={OrgBrain} name="KnowledgeBase" />} />
      <Route path="/knowledge/contacts" component={() => <SafeRoute component={Contacts} name="Contacts" />} />

      {/* ── Automation / AI ── */}
      <Route path="/automation/herbie" component={() => <SafeRoute component={Herbie} name="Herbie" />} />
      <Route path="/automation/events" component={() => <SafeRoute component={EventLog} name="EventLog" />} />
      <Route path="/automation/workflows" component={() => <SafeRoute component={AutomationWorkflows} name="Workflows" />} />
      <Route path="/automation/integrations" component={() => <SafeRoute component={Integrations} name="Integrations" />} />
      <Route path="/automation/settings" component={() => <SafeRoute component={SettingsPage} name="Settings" />} />
      <Route path="/automation/audit" component={() => <SafeRoute component={AuditLog} name="AuditLog" />} />
      <Route path="/automation/egnyte-sync" component={() => <SafeRoute component={EgnyteSyncMonitor} name="EgnyteSyncMonitor" />} />
      <Route path="/automation/data-hygiene" component={() => <SafeRoute component={DataHygiene} name="DataHygiene" />} />

      {/* ── Generic Entity Detail ── */}
      <Route path="/entity/:entityType/:id" component={EntityDetailRoute} />

      {/* ── Legacy route redirects (old URLs still work) ── */}
      <Route path="/opportunities" component={() => <LegacyRedirect to="/capture/opportunities" />} />
      <Route path="/federal-search" component={() => <LegacyRedirect to="/capture/federal-search" />} />
      <Route path="/competitors" component={() => <LegacyRedirect to="/capture/competitors" />} />
      <Route path="/vendors" component={() => <LegacyRedirect to="/execution/vendors" />} />
      <Route path="/companies" component={() => <LegacyRedirect to="/capture/agencies" />} />
      <Route path="/company-jackets" component={() => <LegacyRedirect to="/capture/agencies" />} />
      <Route path="/bids" component={() => <LegacyRedirect to="/capture/pipeline" />} />
      <Route path="/bid-jacket/:id" component={() => <SafeRoute component={BidJacket} name="BidJacket" />} />
      <Route path="/projects" component={() => <LegacyRedirect to="/projects/active" />} />
      <Route path="/compliance" component={() => <LegacyRedirect to="/financial/compliance" />} />
      <Route path="/contacts" component={() => <LegacyRedirect to="/knowledge/contacts" />} />
      <Route path="/integrations" component={() => <LegacyRedirect to="/automation/integrations" />} />
      <Route path="/settings" component={() => <LegacyRedirect to="/automation/settings" />} />
      <Route path="/audit" component={() => <LegacyRedirect to="/automation/audit" />} />
      <Route path="/admin/memory" component={() => <LegacyRedirect to="/knowledge/base" />} />
      <Route path="/admin/integrations" component={() => <LegacyRedirect to="/automation/integrations" />} />
      <Route path="/admin/settings" component={() => <LegacyRedirect to="/automation/settings" />} />
      <Route path="/admin/audit" component={() => <LegacyRedirect to="/automation/audit" />} />
      <Route path="/admin/egnyte-sync" component={() => <LegacyRedirect to="/automation/egnyte-sync" />} />
      <Route path="/company/brain" component={() => <LegacyRedirect to="/knowledge/base" />} />
      <Route path="/company/compliance" component={() => <LegacyRedirect to="/financial/compliance" />} />
      <Route path="/company/contacts" component={() => <LegacyRedirect to="/knowledge/contacts" />} />
      <Route path="/fit-profiles" component={() => <LegacyRedirect to="/capture/fit-profiles" />} />
      <Route path="/ai-review-queue" component={() => <LegacyRedirect to="/capture/opportunities" />} />
      <Route path="/documents" component={() => <LegacyRedirect to="/capture/opportunities" />} />
      <Route path="/knowledge-vault" component={() => <LegacyRedirect to="/knowledge/base" />} />
      <Route path="/egnyte-diagnostics" component={() => <LegacyRedirect to="/automation/egnyte-sync" />} />
      <Route path="/egnyte-sync-monitor" component={() => <LegacyRedirect to="/automation/egnyte-sync" />} />
      <Route path="/blueprints" component={() => <LegacyRedirect to="/estimate/blueprints" />} />
      <Route path="/design-systems" component={() => <LegacyRedirect to="/estimate/design-systems" />} />
      <Route path="/blueprint-hub" component={() => <LegacyRedirect to="/estimate/blueprints" />} />
      <Route path="/takeoff-engine" component={() => <LegacyRedirect to="/estimate/takeoff" />} />
      <Route path="/systems-matrix" component={() => <LegacyRedirect to="/estimate/design-systems" />} />
      <Route path="/auto-build" component={() => <LegacyRedirect to="/estimate/design-systems" />} />
      <Route path="/herbie" component={() => <LegacyRedirect to="/automation/herbie" />} />
      <Route path="/inventory" component={() => <LegacyRedirect to="/execution/inventory" />} />
      <Route path="/tickets" component={() => <LegacyRedirect to="/execution/tickets" />} />
      <Route path="/workforce" component={() => <LegacyRedirect to="/execution/workforce" />} />
      <Route path="/finance" component={() => <LegacyRedirect to="/financial/overview" />} />
      <Route path="/marketing" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/analytics" component={() => <LegacyRedirect to="/home" />} />
      <Route path="/capture/vendors" component={() => <LegacyRedirect to="/execution/vendors" />} />
      <Route path="/queue/submittals" component={() => <LegacyRedirect to="/execution/submittals" />} />
      <Route path="/queue/rfis" component={() => <LegacyRedirect to="/execution/rfis" />} />
      <Route path="/queue/tasks" component={() => <LegacyRedirect to="/execution/tasks" />} />

      {/* ── Debug/Vendor (kept) ── */}
      <Route path="/debug/viewer-demo" component={() => <SafeRoute component={ViewerDemo} name="ViewerDemo" />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [commandOpen, setCommandOpen] = useState(false);
  const [location] = useLocation();
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3.5rem",
  };

  if (location.startsWith("/v/bid/")) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <Route path="/v/bid/:token" component={VendorPortal} />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <DocumentViewerProvider>
        <ProjectContextProvider>
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full min-w-0 overflow-hidden">
              <AppSidebar />
              <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                <header className="flex items-center justify-between gap-4 border-b px-4 py-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 min-w-0 flex-shrink-0">
                  <ModeBadge />
                  <div className="flex items-center gap-2">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                    <span className="text-sm font-medium text-muted-foreground hidden sm:inline">
                      Sentinel Command Center
                    </span>
                  </div>
                  <Button 
                    variant="outline" 
                    className="hidden md:flex items-center gap-2 h-8 px-3 text-muted-foreground"
                    onClick={() => setCommandOpen(true)}
                    data-testid="button-command-palette"
                  >
                    <Search className="h-3.5 w-3.5" />
                    <span className="text-sm">Search or command...</span>
                    <kbd className="ml-2 pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                      <span className="text-xs">⌘</span>K
                    </kbd>
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" className="relative" data-testid="button-notifications">
                      <Bell className="h-4 w-4" />
                      <Badge className="absolute -top-1 -right-1 h-4 min-w-4 p-0 flex items-center justify-center text-[10px]">
                        3
                      </Badge>
                    </Button>
                    <ThemeToggle />
                  </div>
                </header>
                <main className="flex-1 min-w-0 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
          <EntityDrawer />
          <ConfirmDialog />
          <Toaster />
        </TooltipProvider>
        </ProjectContextProvider>
        </DocumentViewerProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AppWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

export default AppWithErrorBoundary;
