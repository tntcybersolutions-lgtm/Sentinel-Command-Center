import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  FileText,
  CheckCircle,
  Clock,
  DollarSign,
  Building2,
  AlertTriangle,
  Target,
  Users,
  Briefcase,
  Send,
  Download,
  Edit,
  Copy,
  ChevronDown,
  ChevronUp,
  FolderOpen,
  ChevronRight,
  Plus,
  Upload,
  MessageSquare,
  FileCheck,
  ClipboardList,
  CircleCheck,
  CircleDot,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface JacketFolder {
  id: string;
  name: string;
  path: string;
  sortOrder: number;
  documentCount: number | null;
}

interface BidRfi {
  id: string;
  rfiNumber: number;
  subject: string;
  question: string;
  status: string;
  sentAt: string | null;
  responseReceivedAt: string | null;
}

interface BidAddendum {
  id: string;
  addendumNumber: number;
  title: string;
  description: string | null;
  issuedAt: string;
  acknowledged: boolean;
}

interface BidChecklist {
  id: string;
  name: string;
  checklistType: string;
  items: BidChecklistItem[];
}

interface BidChecklistItem {
  id: string;
  itemText: string;
  isCompleted: boolean;
  completedAt: string | null;
}

interface BidDocumentation {
  executiveSummary?: string;
  technicalApproach?: string;
  pastPerformance?: string;
  keyPersonnel?: string;
  complianceNotes?: string;
  riskAssessment?: string;
  competitiveAnalysis?: string;
  pricingStrategy?: string;
}

interface BidProject {
  id: string;
  opportunityTitle: string;
  agency: string;
  status: string;
  owner: { name: string; initials: string } | null;
  value: number;
  dueAt: string;
  progress: number;
  tasksCompleted: number;
  tasksTotal: number;
  artifactsReady: number;
  artifactsTotal: number;
  documentation?: BidDocumentation | null;
  createdAt?: string;
}

interface BidDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bid: BidProject | null;
}

const documentationFields = [
  { key: "executiveSummary", label: "Executive Summary", icon: FileText, description: "High-level overview of your bid approach" },
  { key: "technicalApproach", label: "Technical Approach", icon: Target, description: "How you'll deliver the requirements" },
  { key: "pastPerformance", label: "Past Performance", icon: Briefcase, description: "Relevant project experience" },
  { key: "keyPersonnel", label: "Key Personnel", icon: Users, description: "Team members and qualifications" },
  { key: "complianceNotes", label: "Compliance Notes", icon: CheckCircle, description: "FAR/DFARS requirements checklist" },
  { key: "riskAssessment", label: "Risk Assessment", icon: AlertTriangle, description: "Potential risks and mitigations" },
  { key: "competitiveAnalysis", label: "Competitive Analysis", icon: Building2, description: "Market positioning insights" },
  { key: "pricingStrategy", label: "Pricing Strategy", icon: DollarSign, description: "Cost approach and justification" },
];

export function BidDetailModal({ open, onOpenChange, bid }: BidDetailModalProps) {
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: folders = [] } = useQuery<JacketFolder[]>({
    queryKey: ["/api/bids", bid?.id, "folders"],
    enabled: !!bid && activeTab === "folders",
  });

  const { data: rfis = [] } = useQuery<BidRfi[]>({
    queryKey: ["/api/bids", bid?.id, "rfis"],
    enabled: !!bid && activeTab === "rfis",
  });

  const { data: addenda = [] } = useQuery<BidAddendum[]>({
    queryKey: ["/api/bids", bid?.id, "addenda"],
    enabled: !!bid && activeTab === "rfis",
  });

  const { data: checklists = [] } = useQuery<BidChecklist[]>({
    queryKey: ["/api/bids", bid?.id, "checklists"],
    enabled: !!bid && activeTab === "checklists",
  });

  const updateChecklistItemMutation = useMutation({
    mutationFn: async ({ itemId, isCompleted }: { itemId: string; isCompleted: boolean }) => {
      const res = await apiRequest("PATCH", `/api/checklist-items/${itemId}`, { isCompleted });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bids", bid?.id, "checklists"] });
      toast({ title: "Updated", description: "Checklist item updated." });
    },
  });
  
  if (!bid) return null;

  const documentation = bid.documentation || {};
  const filledFields = Object.values(documentation).filter((v) => v && v.length > 0).length;
  const totalFields = documentationFields.length;
  const completionPercent = Math.round((filledFields / totalFields) * 100);

  const toggleSection = (key: string) => {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "initiated":
        return <Badge variant="outline">Initiated</Badge>;
      case "drafting":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Drafting</Badge>;
      case "review":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Review</Badge>;
      case "final_review":
        return <Badge className="bg-orange-500/10 text-orange-500 border-orange-500/20">Final Review</Badge>;
      case "ready":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Ready</Badge>;
      case "submitted":
        return <Badge className="bg-primary/10 text-primary border-primary/20">Submitted</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getDaysRemaining = () => {
    const days = Math.ceil((new Date(bid.dueAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) return "Past due";
    if (days === 0) return "Due today";
    if (days === 1) return "Due tomorrow";
    return `${days} days remaining`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {bid.opportunityTitle}
              </DialogTitle>
              <DialogDescription className="mt-1 flex items-center gap-3">
                <span>{bid.agency}</span>
                <span className="text-muted-foreground">|</span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" />
                  ${(bid.value / 1000000).toFixed(1)}M
                </span>
                <span className="text-muted-foreground">|</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {getDaysRemaining()}
                </span>
              </DialogDescription>
            </div>
            {getStatusBadge(bid.status)}
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4 shrink-0">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="overview" data-testid="tab-bid-detail-overview">Overview</TabsTrigger>
              <TabsTrigger value="folders" data-testid="tab-bid-detail-folders">
                Folders
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                  8
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="documentation" data-testid="tab-bid-detail-documentation">
                Docs
                <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                  {filledFields}/{totalFields}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="rfis" data-testid="tab-bid-detail-rfis">
                RFIs
                {rfis.length > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                    {rfis.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="checklists" data-testid="tab-bid-detail-checklists">Checklists</TabsTrigger>
              <TabsTrigger value="tasks" data-testid="tab-bid-detail-tasks">Tasks</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0 overflow-auto">
            <div className="px-6 py-4">
              <TabsContent value="overview" className="mt-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Progress</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{bid.progress}%</div>
                      <Progress value={bid.progress} className="mt-2 h-2" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Tasks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{bid.tasksCompleted}/{bid.tasksTotal}</div>
                      <p className="text-xs text-muted-foreground">Completed</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Documents</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{bid.artifactsReady}/{bid.artifactsTotal}</div>
                      <p className="text-xs text-muted-foreground">Ready</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">Owner</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-lg font-medium">{bid.owner?.name || "Unassigned"}</div>
                      <p className="text-xs text-muted-foreground">Project Lead</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Bid Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                        <div className="flex-1">
                          <p className="font-medium">Project Created</p>
                          <p className="text-sm text-muted-foreground">
                            {bid.createdAt ? new Date(bid.createdAt).toLocaleDateString() : "Recently"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="h-2 w-2 rounded-full bg-blue-500" />
                        <div className="flex-1">
                          <p className="font-medium">Documentation Generated</p>
                          <p className="text-sm text-muted-foreground">{filledFields} of {totalFields} sections complete</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="h-2 w-2 rounded-full bg-muted" />
                        <div className="flex-1">
                          <p className="font-medium text-muted-foreground">Submission Deadline</p>
                          <p className="text-sm text-muted-foreground">{new Date(bid.dueAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="folders" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Bid Jacket Folders</h3>
                    <p className="text-sm text-muted-foreground">
                      Standardized 8-folder structure for bid documentation
                    </p>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-upload-document">
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>

                <div className="grid gap-3">
                  {folders.length > 0 ? folders.map((folder) => (
                    <Card key={folder.id} className="hover-elevate cursor-pointer" data-testid={`folder-${folder.id}`}>
                      <CardContent className="p-4 flex items-center gap-4">
                        <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">{folder.name.replace(/_/g, " ")}</div>
                          <div className="text-xs text-muted-foreground truncate">{folder.path}</div>
                        </div>
                        <Badge variant="outline">{folder.documentCount || 0} docs</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </CardContent>
                    </Card>
                  )) : (
                    <>
                      {[
                        { code: "01", name: "Bid Request", desc: "Original solicitation documents" },
                        { code: "02", name: "Plans & Specifications", desc: "Drawings, specs, SOW" },
                        { code: "03", name: "RFIs", desc: "Requests for information" },
                        { code: "04", name: "Addenda", desc: "Contract amendments" },
                        { code: "05", name: "Takeoff & Estimating", desc: "Quantity calculations, pricing" },
                        { code: "06", name: "Subcontractor Quotes", desc: "Vendor and sub pricing" },
                        { code: "07", name: "Final Bid Submission", desc: "Completed bid package" },
                        { code: "08", name: "Bid Communications", desc: "Emails, correspondence" },
                      ].map((f) => (
                        <Card key={f.code} className="hover-elevate cursor-pointer" data-testid={`folder-${f.code}`}>
                          <CardContent className="p-4 flex items-center gap-4">
                            <FolderOpen className="h-5 w-5 text-amber-500 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium">{f.code}_{f.name.replace(/ /g, "_")}</div>
                              <div className="text-xs text-muted-foreground">{f.desc}</div>
                            </div>
                            <Badge variant="outline">0 docs</Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                          </CardContent>
                        </Card>
                      ))}
                    </>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="rfis" className="mt-0 space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-medium">Requests for Information</h3>
                      <p className="text-sm text-muted-foreground">
                        Track questions submitted to the contracting officer
                      </p>
                    </div>
                    <Button variant="outline" size="sm" data-testid="button-new-rfi">
                      <Plus className="h-4 w-4 mr-2" />
                      New RFI
                    </Button>
                  </div>

                  {rfis.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="py-8 text-center">
                        <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No RFIs submitted yet</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {rfis.map((rfi) => (
                        <Card key={rfi.id} data-testid={`rfi-${rfi.id}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1">
                                <div className="font-medium">RFI #{rfi.rfiNumber}: {rfi.subject}</div>
                                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{rfi.question}</p>
                              </div>
                              <Badge className={
                                rfi.status === "answered" ? "bg-green-500/10 text-green-500" :
                                rfi.status === "pending" ? "bg-yellow-500/10 text-yellow-500" :
                                "bg-muted text-muted-foreground"
                              }>
                                {rfi.status}
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-medium">Addenda</h3>
                      <p className="text-sm text-muted-foreground">
                        Contract modifications and amendments
                      </p>
                    </div>
                  </div>

                  {addenda.length === 0 ? (
                    <Card className="border-dashed">
                      <CardContent className="py-8 text-center">
                        <FileCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No addenda issued for this solicitation</p>
                      </CardContent>
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {addenda.map((add) => (
                        <Card key={add.id} data-testid={`addendum-${add.id}`}>
                          <CardContent className="p-4 flex items-center gap-4">
                            <FileCheck className="h-5 w-5 text-blue-500 shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium">Addendum #{add.addendumNumber}: {add.title}</div>
                              <div className="text-xs text-muted-foreground">
                                Issued: {new Date(add.issuedAt).toLocaleDateString()}
                              </div>
                            </div>
                            {add.acknowledged ? (
                              <Badge className="bg-green-500/10 text-green-500">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Acknowledged
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-amber-500 border-amber-500/30">
                                Action Required
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="checklists" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">Bid Checklists</h3>
                    <p className="text-sm text-muted-foreground">
                      Track required items and compliance requirements
                    </p>
                  </div>
                  <Button variant="outline" size="sm" data-testid="button-new-checklist">
                    <Plus className="h-4 w-4 mr-2" />
                    New Checklist
                  </Button>
                </div>

                {checklists.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-muted-foreground mb-4">No checklists created yet</p>
                      <Button variant="outline" size="sm" data-testid="button-create-default-checklist">
                        Create Submission Checklist
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {checklists.map((checklist) => {
                      const completed = checklist.items?.filter(i => i.isCompleted).length || 0;
                      const total = checklist.items?.length || 0;
                      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                      
                      return (
                        <Card key={checklist.id} data-testid={`checklist-${checklist.id}`}>
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-base flex items-center gap-2">
                                <ClipboardList className="h-4 w-4" />
                                {checklist.name}
                              </CardTitle>
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">{percent}%</span>
                                <Progress value={percent} className="w-20" />
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <div className="space-y-2">
                              {checklist.items?.map((item) => (
                                <div 
                                  key={item.id} 
                                  className="flex items-center gap-3 p-2 rounded hover-elevate cursor-pointer"
                                  onClick={() => updateChecklistItemMutation.mutate({ 
                                    itemId: item.id, 
                                    isCompleted: !item.isCompleted 
                                  })}
                                  data-testid={`checklist-item-${item.id}`}
                                >
                                  {item.isCompleted ? (
                                    <CircleCheck className="h-5 w-5 text-green-500 shrink-0" />
                                  ) : (
                                    <CircleDot className="h-5 w-5 text-muted-foreground shrink-0" />
                                  )}
                                  <span className={item.isCompleted ? "line-through text-muted-foreground" : ""}>
                                    {item.itemText}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="documentation" className="mt-0 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium">HERBIE-Generated Bid Documentation</h3>
                    <p className="text-sm text-muted-foreground">
                      AI-generated content for your bid proposal
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{completionPercent}% complete</span>
                    <Progress value={completionPercent} className="w-24" />
                  </div>
                </div>

                <Separator />

                {filledFields === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <h3 className="font-medium mb-2">No Documentation Generated</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        This bid project was created without HERBIE documentation.
                      </p>
                      <Button variant="outline" data-testid="button-generate-docs">
                        Generate Documentation
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {documentationFields.map((field) => {
                      const content = documentation[field.key as keyof BidDocumentation];
                      if (!content) return null;
                      const isExpanded = expandedSections[field.key] !== false;

                      return (
                        <Card key={field.key} data-testid={`doc-section-${field.key}`} className="overflow-hidden">
                          <CardHeader 
                            className="pb-3 cursor-pointer hover-elevate"
                            onClick={() => toggleSection(field.key)}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <CardTitle className="text-base flex items-center gap-2">
                                <field.icon className="h-4 w-4 text-primary shrink-0" />
                                {field.label}
                              </CardTitle>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">
                                  {content.length > 500 ? "Detailed" : "Summary"}
                                </Badge>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{field.description}</p>
                          </CardHeader>
                          {isExpanded && (
                            <CardContent className="pt-0">
                              <div className="prose prose-sm dark:prose-invert max-w-none 
                                prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-4 prose-headings:mb-2
                                prose-h2:text-lg prose-h2:border-b prose-h2:pb-2 prose-h2:border-border
                                prose-h3:text-base prose-h3:text-primary
                                prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:my-2
                                prose-ul:my-2 prose-ol:my-2 prose-li:my-0.5 prose-li:text-muted-foreground
                                prose-strong:text-foreground prose-strong:font-semibold
                                prose-table:text-sm prose-table:w-full prose-table:border-collapse
                                prose-th:border prose-th:border-border prose-th:p-2 prose-th:bg-muted prose-th:text-left prose-th:font-medium
                                prose-td:border prose-td:border-border prose-td:p-2
                                prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
                                prose-pre:bg-muted prose-pre:p-3 prose-pre:rounded-md prose-pre:overflow-x-auto
                              ">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {content}
                                </ReactMarkdown>
                              </div>
                              <div className="flex items-center gap-2 mt-4 pt-4 border-t">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  data-testid={`button-edit-${field.key}`}
                                >
                                  <Edit className="h-3.5 w-3.5 mr-1" />
                                  Edit
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => copyToClipboard(content)}
                                  data-testid={`button-copy-${field.key}`}
                                >
                                  <Copy className="h-3.5 w-3.5 mr-1" />
                                  Copy
                                </Button>
                              </div>
                            </CardContent>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="mt-0 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Bid Tasks</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {[
                        { name: "Draft Proposal Narrative", status: "complete" },
                        { name: "Complete Compliance Checklist", status: "complete" },
                        { name: "Prepare Pricing Schedule", status: "in_progress" },
                        { name: "Update Capability Statement", status: "pending" },
                        { name: "Compile Past Performance References", status: "pending" },
                        { name: "Technical Review", status: "pending" },
                        { name: "Final Review & QC", status: "pending" },
                      ].map((task, i) => (
                        <div key={i} className="flex items-center gap-3 p-3 rounded-lg border">
                          <CheckCircle 
                            className={`h-5 w-5 ${
                              task.status === "complete" 
                                ? "text-green-500" 
                                : task.status === "in_progress"
                                ? "text-blue-500"
                                : "text-muted-foreground"
                            }`} 
                          />
                          <span className={task.status === "complete" ? "line-through text-muted-foreground" : ""}>
                            {task.name}
                          </span>
                          <Badge 
                            variant="secondary" 
                            className={`ml-auto text-xs ${
                              task.status === "complete" 
                                ? "bg-green-500/10 text-green-500" 
                                : task.status === "in_progress"
                                ? "bg-blue-500/10 text-blue-500"
                                : ""
                            }`}
                          >
                            {task.status === "complete" ? "Done" : task.status === "in_progress" ? "In Progress" : "Pending"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <div className="border-t p-4 flex items-center justify-between gap-4 shrink-0 bg-background">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-close-bid-detail">
            Close
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" data-testid="button-download-bid">
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button data-testid="button-submit-bid">
              <Send className="mr-2 h-4 w-4" />
              Submit Bid
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
