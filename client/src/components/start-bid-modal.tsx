import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot,
  Sparkles,
  FileText,
  CheckCircle,
  Clock,
  DollarSign,
  Building2,
  Loader2,
  Wand2,
  AlertTriangle,
  Target,
  Users,
  Briefcase,
  Eye,
  Edit,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Opportunity {
  id: string;
  title: string;
  agency?: string;
  value?: number;
  deadline?: string;
  description?: string;
  naicsCode?: string;
  setAside?: string;
  placeOfPerformance?: string;
  solicitationNumber?: string;
}

interface StartBidModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  opportunity: Opportunity | null;
}

interface HerbieDocumentation {
  executiveSummary: string;
  technicalApproach: string;
  pastPerformance: string;
  keyPersonnel: string;
  complianceNotes: string;
  riskAssessment: string;
  competitiveAnalysis: string;
  pricingStrategy: string;
}

export function StartBidModal({ open, onOpenChange, opportunity }: StartBidModalProps) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [previewMode, setPreviewMode] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [documentation, setDocumentation] = useState<HerbieDocumentation>({
    executiveSummary: "",
    technicalApproach: "",
    pastPerformance: "",
    keyPersonnel: "",
    complianceNotes: "",
    riskAssessment: "",
    competitiveAnalysis: "",
    pricingStrategy: "",
  });

  const createBidMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/bid-projects", {
        opportunityId: opportunity?.id,
        documentationJson: documentation,
      });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/bid-projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      onOpenChange(false);
      setLocation("/bids");
      toast({
        title: "Bid Project Created",
        description: "Your bid project has been initialized with HERBIE documentation.",
        action: (
          <ToastAction altText="View Bid Pipeline" onClick={() => setLocation("/bids")} data-testid="toast-action-view-bids">
            View Pipeline
          </ToastAction>
        ),
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create bid project. Please try again.",
        variant: "destructive",
      });
    },
  });

  const generateDocumentationMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/herbie/generate-bid-documentation", {
        opportunityId: opportunity?.id,
        opportunityTitle: opportunity?.title,
        agency: opportunity?.agency,
        value: opportunity?.value,
        description: opportunity?.description,
        naicsCode: opportunity?.naicsCode,
        setAside: opportunity?.setAside,
        placeOfPerformance: opportunity?.placeOfPerformance,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setDocumentation(data);
      setIsGenerating(false);
      setGenerationProgress(100);
      toast({
        title: "Documentation Generated",
        description: "HERBIE has populated all bid documentation fields.",
        action: (
          <ToastAction altText="View Documentation" onClick={() => setActiveTab("documentation")} data-testid="toast-action-view-docs">
            View
          </ToastAction>
        ),
      });
    },
    onError: () => {
      setIsGenerating(false);
      toast({
        title: "Generation Failed",
        description: "HERBIE couldn't generate documentation. You can fill in fields manually.",
        variant: "destructive",
      });
    },
  });

  const handleGenerateWithHerbie = async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    
    const progressInterval = setInterval(() => {
      setGenerationProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);

    generateDocumentationMutation.mutate();
  };

  const handleStartBid = () => {
    createBidMutation.mutate();
  };

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

  const filledFields = Object.values(documentation).filter((v) => v.length > 0).length;
  const totalFields = documentationFields.length;
  const completionPercent = Math.round((filledFields / totalFields) * 100);

  if (!opportunity) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-semibold flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Start Bid Project
              </DialogTitle>
              <DialogDescription className="mt-1">
                Create a new bid for "{opportunity.title}"
              </DialogDescription>
            </div>
            <Badge variant="outline" className="shrink-0">
              {opportunity.agency || "Federal"}
            </Badge>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 pt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview" data-testid="tab-bid-overview">Overview</TabsTrigger>
              <TabsTrigger value="documentation" data-testid="tab-bid-documentation">
                Documentation
                {filledFields > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 min-w-5 p-0 flex items-center justify-center text-xs">
                    {filledFields}/{totalFields}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="herbie" data-testid="tab-bid-herbie">
                <Bot className="h-4 w-4 mr-1" />
                HERBIE AI
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1 min-h-0 overflow-auto">
            <div className="px-6 py-4">
            <TabsContent value="overview" className="mt-0 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Opportunity Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Title</Label>
                    <p className="font-medium">{opportunity.title}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Agency</Label>
                    <p className="font-medium">{opportunity.agency || "Not specified"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Estimated Value</Label>
                    <p className="font-medium text-green-600">
                      {opportunity.value ? `$${(opportunity.value / 1000000).toFixed(1)}M` : "\u2014"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Deadline</Label>
                    <p className="font-medium flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString() : "\u2014"}
                    </p>
                  </div>
                  {opportunity.naicsCode && (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">NAICS Code</Label>
                      <p className="font-medium">{opportunity.naicsCode}</p>
                    </div>
                  )}
                  {opportunity.setAside && (
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Set-Aside</Label>
                      <Badge variant="secondary">{opportunity.setAside}</Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Bid Tasks (Auto-Created)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {[
                      "Draft Proposal Narrative",
                      "Complete Compliance Checklist",
                      "Prepare Pricing Schedule",
                      "Update Capability Statement",
                      "Compile Past Performance References",
                      "Technical Review",
                      "Final Review & QC",
                    ].map((task, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-4 w-4 text-muted-foreground" />
                        <span>{task}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documentation" className="mt-0 space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-medium">Bid Documentation</h3>
                  <p className="text-sm text-muted-foreground">
                    {filledFields > 0 ? "Professional proposal content generated by HERBIE" : "Fill in manually or use HERBIE to auto-generate"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{completionPercent}%</span>
                    <Progress value={completionPercent} className="w-20" />
                  </div>
                  {filledFields > 0 && (
                    <div className="flex border rounded-md overflow-hidden">
                      <Button
                        variant={previewMode ? "default" : "ghost"}
                        size="sm"
                        className="rounded-none h-8"
                        onClick={() => setPreviewMode(true)}
                        data-testid="button-preview-mode"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        Preview
                      </Button>
                      <Button
                        variant={!previewMode ? "default" : "ghost"}
                        size="sm"
                        className="rounded-none h-8"
                        onClick={() => setPreviewMode(false)}
                        data-testid="button-edit-mode"
                      >
                        <Edit className="h-3.5 w-3.5 mr-1" />
                        Edit
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {filledFields === 0 ? (
                <>
                  {documentationFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <field.icon className="h-4 w-4 text-muted-foreground" />
                        {field.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                      <Textarea
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                        value={documentation[field.key as keyof HerbieDocumentation]}
                        onChange={(e) =>
                          setDocumentation((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        className="min-h-24 resize-none"
                        data-testid={`input-${field.key}`}
                      />
                    </div>
                  ))}
                </>
              ) : previewMode ? (
                <div className="space-y-4">
                  {documentationFields.map((field) => {
                    const content = documentation[field.key as keyof HerbieDocumentation];
                    if (!content) return null;
                    const isExpanded = expandedSections[field.key] !== false;

                    return (
                      <Card key={field.key} data-testid={`preview-section-${field.key}`} className="overflow-hidden">
                        <CardHeader 
                          className="pb-3 cursor-pointer hover-elevate"
                          onClick={() => setExpandedSections(prev => ({ ...prev, [field.key]: !prev[field.key] }))}
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
                          </CardContent>
                        )}
                      </Card>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {documentationFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <field.icon className="h-4 w-4 text-muted-foreground" />
                        {field.label}
                      </Label>
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                      <Textarea
                        placeholder={`Enter ${field.label.toLowerCase()}...`}
                        value={documentation[field.key as keyof HerbieDocumentation]}
                        onChange={(e) =>
                          setDocumentation((prev) => ({
                            ...prev,
                            [field.key]: e.target.value,
                          }))
                        }
                        className="min-h-32 resize-y font-mono text-sm"
                        data-testid={`input-${field.key}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="herbie" className="mt-0 space-y-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Bot className="h-5 w-5 text-primary" />
                    HERBIE AI Documentation Assistant
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    HERBIE can analyze the opportunity and automatically generate documentation for your bid,
                    including executive summary, technical approach, compliance notes, and more.
                  </p>

                  {isGenerating ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm">HERBIE is analyzing the opportunity...</span>
                      </div>
                      <Progress value={generationProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        Generating: Executive Summary, Technical Approach, Compliance Notes...
                      </p>
                    </div>
                  ) : (
                    <Button
                      onClick={handleGenerateWithHerbie}
                      className="w-full"
                      size="lg"
                      data-testid="button-generate-herbie"
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Generate Documentation with HERBIE
                    </Button>
                  )}

                  <Separator />

                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">What HERBIE will generate:</h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {documentationFields.map((field) => (
                        <div key={field.key} className="flex items-center gap-2 text-sm">
                          <field.icon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span>{field.label}</span>
                          {documentation[field.key as keyof HerbieDocumentation] && (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 ml-auto" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {filledFields > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      Generated Documentation Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {documentationFields
                      .filter((f) => documentation[f.key as keyof HerbieDocumentation])
                      .slice(0, 3)
                      .map((field) => (
                        <div key={field.key} className="space-y-1">
                          <Label className="text-xs text-muted-foreground">{field.label}</Label>
                          <p className="text-sm line-clamp-2">
                            {documentation[field.key as keyof HerbieDocumentation]}
                          </p>
                        </div>
                      ))}
                    {filledFields > 3 && (
                      <p className="text-xs text-muted-foreground">
                        + {filledFields - 3} more fields generated
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <div className="border-t p-4 flex items-center justify-between gap-4 shrink-0 bg-background relative z-50">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-bid">
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {filledFields === 0 && (
              <p className="text-xs text-muted-foreground">
                Tip: Use HERBIE to auto-fill documentation
              </p>
            )}
            <Button
              onClick={handleStartBid}
              disabled={createBidMutation.isPending}
              data-testid="button-create-bid"
            >
              {createBidMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Create Bid Project
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
