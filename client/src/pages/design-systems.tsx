import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { ObjectUploader } from "@/components/ObjectUploader";
import {
  Layers,
  Ruler,
  Calculator,
  Cpu,
  Workflow,
  Upload,
  Loader2,
  FileText,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Download,
  Search,
  Filter,
  Plus,
  ArrowRight,
  Building2,
  Zap,
  Wrench,
  Flame,
  Droplets,
  Wind,
  Lightbulb,
  Cable,
  Camera,
  Speaker,
  Brain,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RefreshCw,
  FileSpreadsheet,
  Package,
  Wand2,
  Bot,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  X,
} from "lucide-react";

const DISCIPLINES = [
  { id: "architectural", label: "Architectural", icon: Building2, color: "bg-blue-500" },
  { id: "structural", label: "Structural", icon: Building2, color: "bg-orange-500" },
  { id: "civil", label: "Civil", icon: Building2, color: "bg-green-500" },
  { id: "mep", label: "MEP", icon: Zap, color: "bg-yellow-500" },
  { id: "low_voltage", label: "Low Voltage", icon: Cable, color: "bg-purple-500" },
  { id: "fire_life_safety", label: "Fire/Life Safety", icon: Flame, color: "bg-red-500" },
  { id: "rcp", label: "RCP", icon: Lightbulb, color: "bg-cyan-500" },
];

const SYSTEMS = [
  { id: "structural", label: "Structural/Framing", icon: Building2, color: "bg-orange-500" },
  { id: "electrical", label: "Electrical", icon: Zap, color: "bg-yellow-500" },
  { id: "plumbing", label: "Plumbing", icon: Droplets, color: "bg-blue-500" },
  { id: "hvac", label: "HVAC", icon: Wind, color: "bg-cyan-500" },
  { id: "drywall", label: "Drywall/Finishes", icon: Building2, color: "bg-gray-500" },
  { id: "doors", label: "Doors & Hardware", icon: Building2, color: "bg-amber-600" },
  { id: "windows", label: "Windows & Glazing", icon: Building2, color: "bg-sky-400" },
  { id: "lighting", label: "Lighting", icon: Lightbulb, color: "bg-yellow-400" },
  { id: "lv_data", label: "Low Voltage/Data", icon: Cable, color: "bg-purple-500" },
  { id: "security", label: "Security/Cameras", icon: Camera, color: "bg-red-500" },
  { id: "audio", label: "Audio/PA/Intercom", icon: Speaker, color: "bg-pink-500" },
  { id: "smart_building", label: "Smart Building", icon: Brain, color: "bg-green-500" },
];

interface TakeoffCategory {
  id: string;
  name: string;
  code: string;
  trade: string;
  defaultUnit: string;
  color: string | null;
  sortOrder: number;
}

const DEFAULT_TAKEOFF_CATEGORIES = [
  { id: "concrete", name: "Concrete", code: "CONC", trade: "concrete", defaultUnit: "CY" },
  { id: "framing", name: "Framing", code: "FRAM", trade: "framing", defaultUnit: "LF" },
  { id: "drywall", name: "Drywall/Sheetrock", code: "DRY", trade: "drywall", defaultUnit: "SF" },
  { id: "flooring", name: "Flooring", code: "FLR", trade: "flooring", defaultUnit: "SF" },
  { id: "doors", name: "Doors & Hardware", code: "DOOR", trade: "doors", defaultUnit: "EA" },
  { id: "windows", name: "Windows & Glazing", code: "WIN", trade: "windows", defaultUnit: "EA" },
  { id: "electrical", name: "Electrical Devices", code: "ELEC", trade: "electrical", defaultUnit: "EA" },
  { id: "plumbing", name: "Plumbing Fixtures", code: "PLMB", trade: "plumbing", defaultUnit: "EA" },
  { id: "lv_devices", name: "Low-Voltage Devices", code: "LV", trade: "low_voltage", defaultUnit: "EA" },
  { id: "fire_devices", name: "Fire Devices", code: "FIRE", trade: "fire", defaultUnit: "EA" },
  { id: "cabling", name: "Cabling", code: "CABL", trade: "cabling", defaultUnit: "LF" },
];

const AUTO_BUILD_PHASES = [
  { name: "Framing", type: "framing", dependencies: [], inspections: ["Rough Framing"], submittals: ["Lumber Shop Drawings"] },
  { name: "Electrical Rough-In", type: "electrical_rough", dependencies: ["Framing"], inspections: ["Electrical Rough"], submittals: ["Panel Schedules", "Fixture Cut Sheets"] },
  { name: "Plumbing Rough-In", type: "plumbing_rough", dependencies: ["Framing"], inspections: ["Plumbing Rough"], submittals: ["Fixture Cut Sheets", "Pipe Sizing"] },
  { name: "HVAC Rough-In", type: "hvac_rough", dependencies: ["Framing"], inspections: ["Mechanical Rough"], submittals: ["Equipment Schedules", "Duct Layouts"] },
  { name: "Low Voltage Rough", type: "lv_rough", dependencies: ["Framing"], inspections: ["Low Voltage Pathway"], submittals: ["Cable Schedules", "Rack Elevations"] },
  { name: "Drywall", type: "drywall", dependencies: ["Electrical Rough-In", "Plumbing Rough-In", "HVAC Rough-In"], inspections: ["Insulation", "Fire Stopping"], submittals: [] },
  { name: "Finishes", type: "finishes", dependencies: ["Drywall"], inspections: ["Paint", "Flooring"], submittals: ["Paint Schedule", "Flooring Samples"] },
  { name: "Electrical Trim", type: "electrical_trim", dependencies: ["Finishes"], inspections: ["Electrical Final"], submittals: [] },
  { name: "Low Voltage Terminations", type: "lv_term", dependencies: ["Drywall"], inspections: ["Low Voltage Final"], submittals: ["Test Results"] },
  { name: "Commissioning", type: "commissioning", dependencies: ["Electrical Trim", "Low Voltage Terminations"], inspections: ["Final Building"], submittals: ["Commissioning Report", "O&M Manuals"] },
];

interface DrawingSheet {
  id: string;
  sheetNumber: string;
  sheetTitle: string;
  discipline: string;
  version: number;
  isCurrentSet: boolean;
  fileType: string;
  scale?: string;
  revisionNumber?: string;
  storageKey?: string;
}

interface TakeoffQuantity {
  id: string;
  categoryId: string;
  room?: string;
  floor?: string;
  quantity: string;
  unit: string;
  unitCost?: string;
  extendedCost?: string;
  notes?: string;
}

interface BuildingSystem {
  id: string;
  systemType: string;
  systemName: string;
  status: string;
  completionPercent: number;
  commissioningStatus: string;
  asBuiltStatus: string;
}

// Subset of the blueprints row needed by the Import-from-Plans flow.
interface Blueprint {
  id: string;
  title: string;
  fileName?: string;
  pageCount?: number;
  uploadedAt?: string;
  createdAt?: string;
}

// Shape of takeoff_items returned by GET /api/blueprints/:id/takeoff-items.
interface BlueprintTakeoffItem {
  id: string;
  name: string;
  category: string;
  quantity: string;
  unit: string;
  unitCost?: string;
}

// Deterministic muted-color palette for category badges. Each category name
// hashes to a fixed slot in the palette, so the same category always renders
// in the same color across reloads. Colors are explicit light/dark pairs so
// they read well in both themes without relying on Tailwind's `dark:`
// auto-handling for non-utility custom classes.
const CATEGORY_BADGE_PALETTE = [
  "bg-blue-100 text-blue-900 border-blue-200 dark:bg-blue-950/50 dark:text-blue-200 dark:border-blue-900",
  "bg-emerald-100 text-emerald-900 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900",
  "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900",
  "bg-violet-100 text-violet-900 border-violet-200 dark:bg-violet-950/50 dark:text-violet-200 dark:border-violet-900",
  "bg-rose-100 text-rose-900 border-rose-200 dark:bg-rose-950/50 dark:text-rose-200 dark:border-rose-900",
  "bg-cyan-100 text-cyan-900 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-200 dark:border-cyan-900",
  "bg-orange-100 text-orange-900 border-orange-200 dark:bg-orange-950/50 dark:text-orange-200 dark:border-orange-900",
  "bg-teal-100 text-teal-900 border-teal-200 dark:bg-teal-950/50 dark:text-teal-200 dark:border-teal-900",
  "bg-pink-100 text-pink-900 border-pink-200 dark:bg-pink-950/50 dark:text-pink-200 dark:border-pink-900",
  "bg-indigo-100 text-indigo-900 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-200 dark:border-indigo-900",
  "bg-lime-100 text-lime-900 border-lime-200 dark:bg-lime-950/50 dark:text-lime-200 dark:border-lime-900",
  "bg-sky-100 text-sky-900 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-900",
];
function categoryBadgeClass(name: string | undefined | null): string {
  const key = (name || "Unknown").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return CATEGORY_BADGE_PALETTE[Math.abs(h) % CATEGORY_BADGE_PALETTE.length];
}

export default function DesignSystems() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [location] = useLocation();
  
  const getTabFromPath = (path: string): string => {
    // Support explicit ?tab= query string
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab");
      if (tab && ["overview", "blueprint-hub", "takeoff", "systems", "deliverables"].includes(tab)) return tab;
    }
    if (path === "/blueprint-hub" || path === "/estimate/blueprint-hub") return "blueprint-hub";
    if (path === "/takeoff-engine" || path === "/estimate/takeoff") return "takeoff";
    if (path === "/systems-matrix" || path === "/estimate/systems") return "systems";
    if (path === "/auto-build" || path === "/estimate/auto-build") return "overview";
    if (path === "/deliverables" || path === "/estimate/deliverables") return "deliverables";
    return "overview";
  };
  
  const [activeTab, setActiveTab] = useState(() => getTabFromPath(location));
  const [visibleDisciplines, setVisibleDisciplines] = useState<Set<string>>(new Set(DISCIPLINES.map(d => d.id)));
  const [searchQuery, setSearchQuery] = useState("");
  
  useEffect(() => {
    setActiveTab(getTabFromPath(location));
  }, [location]);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAutoBuildOpen, setIsAutoBuildOpen] = useState(false);
  const [isNewTakeoffOpen, setIsNewTakeoffOpen] = useState(false);
  const [isImportTakeoffOpen, setIsImportTakeoffOpen] = useState(false);
  const [selectedBlueprintIds, setSelectedBlueprintIds] = useState<Set<string>>(new Set());
  const [isAddSystemOpen, setIsAddSystemOpen] = useState(false);
  const [isEditTakeoffOpen, setIsEditTakeoffOpen] = useState(false);
  const [isEditSystemOpen, setIsEditSystemOpen] = useState(false);
  const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
  const [editingTakeoff, setEditingTakeoff] = useState<TakeoffQuantity | null>(null);
  const [deletingTakeoff, setDeletingTakeoff] = useState<TakeoffQuantity | null>(null);
  // Sort state for takeoff table. `sortBy === null` means use the default sort
  // (Category asc, then Trade asc as tiebreaker). Clicking a header sets the
  // sort key and toggles direction.
  const [takeoffSortBy, setTakeoffSortBy] = useState<null | "category" | "trade" | "name" | "quantity" | "unit" | "unitCost" | "extended" | "notes">(null);
  const [takeoffSortDir, setTakeoffSortDir] = useState<"asc" | "desc">("asc");
  const [takeoffSearch, setTakeoffSearch] = useState("");
  // Controlled state for the New Takeoff Item dialog so we can do inline validation.
  const emptyNewTakeoff = { categoryId: "", projectId: "", room: "", quantity: "", unit: "EA", unitCost: "", notes: "" };
  const [newTakeoffForm, setNewTakeoffForm] = useState(emptyNewTakeoff);
  const [newTakeoffErrors, setNewTakeoffErrors] = useState<Record<string, string>>({});
  const [editingSystem, setEditingSystem] = useState<BuildingSystem | null>(null);
  const [viewingSheet, setViewingSheet] = useState<DrawingSheet | null>(null);
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);
  const [generatingDeliverable, setGeneratingDeliverable] = useState<string | null>(null);
  const [takeoffFilter, setTakeoffFilter] = useState<string>("all");
  const [uploadedStorageKey, setUploadedStorageKey] = useState<string | null>(null);
  const [downloadingSheet, setDownloadingSheet] = useState<string | null>(null);

  const { data: drawingSheets = [] } = useQuery<DrawingSheet[]>({
    queryKey: ["/api/drawing-sheets"],
  });

  const { data: takeoffQuantities = [] } = useQuery<TakeoffQuantity[]>({
    queryKey: ["/api/takeoff-quantities"],
  });

  const { data: buildingSystems = [] } = useQuery<BuildingSystem[]>({
    queryKey: ["/api/building-systems"],
  });

  const { data: takeoffCategoriesData = [] } = useQuery<TakeoffCategory[]>({
    queryKey: ["/api/takeoff-categories"],
  });

  const { data: projectsData = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/projects"],
  });

  const { data: blueprintsData = [] } = useQuery<Blueprint[]>({
    queryKey: ["/api/blueprints"],
  });

  const { data: systemDevicesAll = [] } = useQuery<Array<{ id: string; systemId: string; deviceType: string; manufacturer?: string; model?: string; quantity: number; location?: string; installedCount?: number }>>({
    queryKey: ["/api/system-devices"],
  });

  const takeoffCategories = takeoffCategoriesData.map(c => ({ id: c.id, name: c.name, trade: c.trade, unit: c.defaultUnit }));

  const uploadSheetMutation = useMutation({
    mutationFn: async (data: { sheetNumber: string; sheetTitle: string; discipline: string; fileType: string; storageKey?: string }) => {
      return apiRequest("POST", "/api/drawing-sheets", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drawing-sheets"] });
      toast({ title: "Drawing uploaded", description: "Sheet added to the set" });
      setIsUploadOpen(false);
      setUploadedStorageKey(null);
    },
  });

  const downloadSheetFile = async (sheetId: string) => {
    setDownloadingSheet(sheetId);
    try {
      const link = document.createElement("a");
      link.href = `/api/drawing-sheets/${sheetId}/download`;
      link.download = "drawing";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Download started", description: "Your file is downloading" });
    } catch (error) {
      toast({ title: "Download failed", description: "Could not download file", variant: "destructive" });
    } finally {
      setDownloadingSheet(null);
    }
  };

  const autoBuildMutation = useMutation({
    mutationFn: async (data: { projectId: string }) => {
      return apiRequest("POST", "/api/auto-build", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-phases"] });
      toast({ title: "Project built", description: "Phases, tasks, and schedules generated from plans" });
      setIsAutoBuildOpen(false);
    },
  });

  const createTakeoffQuantityMutation = useMutation({
    mutationFn: async (data: { categoryId: string; room: string; floor: string; quantity: string; unit: string; unitCost: string }) => {
      const extendedCost = (parseFloat(data.quantity) * parseFloat(data.unitCost || "0")).toFixed(2);
      return apiRequest("POST", "/api/takeoff-quantities", { ...data, extendedCost });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoff-quantities"] });
      toast({ title: "Takeoff item added", description: "Quantity recorded successfully" });
      setIsNewTakeoffOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const addSystemMutation = useMutation({
    mutationFn: async (data: { systemType: string; systemName: string; status: string }) => {
      return apiRequest("POST", "/api/building-systems", { 
        ...data, 
        completionPercent: 0,
        commissioningStatus: "pending",
        asBuiltStatus: "pending",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/building-systems"] });
      toast({ title: "System added", description: "Building system created successfully" });
      setIsAddSystemOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const syncSystemsMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("GET", "/api/building-systems");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/building-systems"] });
      queryClient.invalidateQueries({ queryKey: ["/api/system-devices"] });
      toast({ title: "Systems synced", description: "All system statuses refreshed" });
    },
    onError: (error: Error) => {
      toast({ title: "Sync failed", description: error.message || "Could not refresh systems", variant: "destructive" });
    },
  });

  const updateTakeoffMutation = useMutation({
    mutationFn: async (data: { id: string; categoryId: string; room: string; floor: string; quantity: string; unit: string; unitCost: string; notes: string }) => {
      const extendedCost = (parseFloat(data.quantity) * parseFloat(data.unitCost || "0")).toFixed(2);
      return apiRequest("PATCH", `/api/takeoff-quantities/${data.id}`, { ...data, extendedCost });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoff-quantities"] });
      toast({ title: "Takeoff updated", description: "Quantity updated successfully" });
      setIsEditTakeoffOpen(false);
      setEditingTakeoff(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTakeoffMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/takeoff-quantities/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/takeoff-quantities"] });
      toast({ title: "Takeoff deleted", description: "Item removed successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Bulk-imports takeoff items from one or more selected blueprints.
  // Delegates the per-item work to the server route
  // POST /api/takeoffs/import-from-blueprints, which maps each blueprint
  // item's free-text `category` to a takeoff_category by name. Items whose
  // category doesn't match an existing category come back as "skipped".
  const importTakeoffFromBlueprintsMutation = useMutation({
    mutationFn: async (blueprintIds: string[]) => {
      if (blueprintIds.length === 0) throw new Error("No blueprints selected");
      const result = await apiRequest("POST", "/api/takeoffs/import-from-blueprints", { blueprintIds });
      const data = await result.json() as {
        created: number;
        skipped: string[];
        failed: Array<{ name: string; error: string }>;
        perBlueprint: Array<{ blueprintId: string; blueprintTitle: string; created: number; skipped: string[]; failed: Array<{ name: string; error: string }> }>;
      };
      if (data.created > 0) {
        await queryClient.invalidateQueries({ queryKey: ["/api/takeoff-quantities"] });
      }
      return data;
    },
    onSuccess: ({ created, skipped, failed, perBlueprint }) => {
      const bpCount = perBlueprint.length;
      if (created === 0) {
        const reason = skipped.length > 0
          ? `No matching takeoff categories. Missing: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""}.`
          : failed.length > 0
            ? `All ${failed.length} item(s) failed: ${failed[0].error}`
            : `Selected blueprint${bpCount === 1 ? "" : "s"} ha${bpCount === 1 ? "s" : "ve"} no takeoff items to import.`;
        toast({ title: "Nothing imported", description: reason, variant: "destructive" });
        return;
      }
      const parts: string[] = [`Created ${created} takeoff item${created === 1 ? "" : "s"} from ${bpCount} blueprint${bpCount === 1 ? "" : "s"}`];
      if (skipped.length > 0) parts.push(`skipped ${skipped.length} (no matching category)`);
      if (failed.length > 0) parts.push(`${failed.length} failed`);
      const isPartial = skipped.length > 0 || failed.length > 0;
      toast({
        title: isPartial ? "Import partially complete" : "Import complete",
        description: parts.join(", ") + ".",
        variant: isPartial ? "destructive" : "default",
      });
      setIsImportTakeoffOpen(false);
      setSelectedBlueprintIds(new Set());
    },
    onError: (error: Error) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const updateSystemMutation = useMutation({
    mutationFn: async (data: { id: string; systemName: string; status: string; completionPercent: number; commissioningStatus: string; asBuiltStatus: string }) => {
      return apiRequest("PATCH", `/api/building-systems/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/building-systems"] });
      toast({ title: "System updated", description: "Building system updated successfully" });
      setIsEditSystemOpen(false);
      setEditingSystem(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSheetMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/drawing-sheets/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drawing-sheets"] });
      toast({ title: "Sheet deleted", description: "Drawing sheet removed successfully" });
      setIsViewSheetOpen(false);
      setViewingSheet(null);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteSystemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/building-systems/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/building-systems"] });
      toast({ title: "System deleted", description: "Building system removed successfully" });
      setIsEditSystemOpen(false);
      setEditingSystem(null);
      if (selectedSystemId === editingSystem?.id) {
        setSelectedSystemId(null);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const generateDeliverableMutation = useMutation({
    mutationFn: async (type: string) => {
      setGeneratingDeliverable(type);
      return apiRequest("POST", `/api/generate-deliverable/${type}`, { projectId: "current" });
    },
    onSuccess: (_, type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-deliverables"] });
      // device_schedule seeds devices; as_built updates building system status
      if (type === "device_schedule") {
        queryClient.invalidateQueries({ queryKey: ["/api/system-devices"] });
      }
      if (type === "as_built") {
        queryClient.invalidateQueries({ queryKey: ["/api/building-systems"] });
      }
      const titles: Record<string, string> = {
        trade_scope: "Trade Scopes",
        bid_package: "Bid Packages",
        material_list: "Material Lists",
        cable_schedule: "Cable Schedules",
        device_schedule: "Device Schedules",
        rack_elevation: "Rack Elevations",
        as_built: "As-Built Sets",
        owner_handoff: "Owner Handoff",
        smart_building_config: "Smart Building Config",
      };
      toast({ title: "Deliverable generated", description: `${titles[type] || type} created successfully` });
      setGeneratingDeliverable(null);
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
      setGeneratingDeliverable(null);
    },
  });

  const generateAllDeliverablesMutation = useMutation({
    mutationFn: async () => {
      const types = ["trade_scope", "bid_package", "material_list", "cable_schedule", "device_schedule", "rack_elevation", "as_built", "owner_handoff", "smart_building_config"];
      for (const type of types) {
        await apiRequest("POST", `/api/generate-deliverable/${type}`, { projectId: "current" });
      }
      return { generated: types.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-deliverables"] });
      toast({ title: "All deliverables generated", description: "9 document types created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const askHerbieAutoDocMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/herbie/chat", {
        message: "Auto-document this project. Generate all 9 deliverables and enrich each with an executive summary for the PM.",
        history: [],
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-deliverables"] });
      toast({ title: "Herbie is on it", description: "Generating + enriching all 9 deliverables." });
    },
    onError: (error: Error) => {
      toast({ title: "Herbie failed", description: error.message, variant: "destructive" });
    },
  });

  const askHerbieDeliverableMutation = useMutation({
    mutationFn: async (type: string) => {
      const titles: Record<string, string> = {
        trade_scope: "trade scope", bid_package: "bid package", material_list: "material list",
        cable_schedule: "cable schedule", device_schedule: "device schedule", rack_elevation: "rack elevation",
        as_built: "as-built set", owner_handoff: "owner handoff", smart_building_config: "smart building config",
      };
      const res = await apiRequest("POST", "/api/herbie/chat", {
        message: `Generate the ${titles[type] || type} deliverable for this project, enrich it with a sharp PM-facing summary, and tell me what's in it. Flag anything missing.`,
        history: [],
      });
      return res.json();
    },
    onSuccess: (_data, type) => {
      queryClient.invalidateQueries({ queryKey: ["/api/project-deliverables"] });
      toast({ title: `Herbie generated ${type}`, description: "Check the deliverable summary." });
    },
    onError: (error: Error) => {
      toast({ title: "Herbie failed", description: error.message, variant: "destructive" });
    },
  });

  const exportTakeoffCSV = () => {
    try {
      if (!takeoffQuantities || takeoffQuantities.length === 0) {
        toast({ title: "Nothing to export", description: "No takeoff items found.", variant: "destructive" });
        return;
      }
      const esc = (v: unknown) => {
        const s = v === null || v === undefined ? "" : String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      // CSV column order locked to: Item Name, Category, Trade, Quantity,
      // Unit, Unit Cost, Extended Cost, Notes, Project. "Item Name" maps to
      // the `room` field, which is what both the New Takeoff dialog and the
      // Import-from-Plans flow use as the human-readable line label.
      // Project comes last so legacy importers reading the first 8 cols still work.
      const projectById = new Map(projectsData.map(p => [p.id, p.name]));
      const headers = ["Item Name", "Category", "Trade", "Quantity", "Unit", "Unit Cost", "Extended Cost", "Notes", "Project"];
      const rows = takeoffQuantities.map(tq => {
        const cat = takeoffCategories.find(c => c.id === tq.categoryId);
        const qty = Number(tq.quantity ?? 0);
        const unitCost = Number(tq.unitCost ?? 0);
        const extended = tq.extendedCost != null ? Number(tq.extendedCost) : qty * unitCost;
        const projectName = tq.projectId ? (projectById.get(tq.projectId) || "") : "";
        return [
          tq.room || "",
          cat?.name || "Unknown",
          cat?.trade || "Unknown",
          qty.toFixed(2),
          tq.unit,
          unitCost.toFixed(2),
          extended.toFixed(2),
          tq.notes || "",
          projectName,
        ].map(esc).join(",");
      });
      const csv = "\ufeff" + [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `takeoff_export_${new Date().toISOString().split("T")[0]}.csv`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Export complete", description: `${rows.length} takeoff items exported.` });
    } catch (err) {
      console.error("CSV export failed:", err);
      toast({ title: "Export failed", description: err instanceof Error ? err.message : "Unknown error", variant: "destructive" });
    }
  };

  const downloadDeliverable = (type: string) => {
    const titles: Record<string, string> = {
      trade_scope: "Trade Scopes",
      bid_package: "Bid Packages",
      material_list: "Material Lists",
      cable_schedule: "Cable Schedules",
      device_schedule: "Device Schedules",
      rack_elevation: "Rack Elevations",
      as_built: "As-Built Sets",
      owner_handoff: "Owner Handoff",
      smart_building_config: "Smart Building Config",
    };
    const link = document.createElement("a");
    link.href = `/api/project-deliverables/download/${type}`;
    link.download = `${type}_${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: "Downloading", description: `${titles[type] || type} download started` });
  };

  const toggleDiscipline = (disciplineId: string) => {
    setVisibleDisciplines(prev => {
      const next = new Set(prev);
      if (next.has(disciplineId)) {
        next.delete(disciplineId);
      } else {
        next.add(disciplineId);
      }
      return next;
    });
  };

  const filteredSheets = drawingSheets.filter(sheet => {
    if (!visibleDisciplines.has(sheet.discipline)) return false;
    if (searchQuery && !sheet.sheetNumber.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !sheet.sheetTitle.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const sheetsByDiscipline = DISCIPLINES.reduce((acc, disc) => {
    acc[disc.id] = drawingSheets.filter(s => s.discipline === disc.id);
    return acc;
  }, {} as Record<string, DrawingSheet[]>);

  const filteredTakeoffs = (() => {
    const byCategory = takeoffFilter === "all"
      ? takeoffQuantities
      : takeoffQuantities.filter(t => t.categoryId === takeoffFilter);
    const q = takeoffSearch.trim().toLocaleLowerCase();
    if (!q) return byCategory;
    return byCategory.filter(t => {
      const cat = takeoffCategories.find(c => c.id === t.categoryId);
      return (
        (t.room ?? "").toLocaleLowerCase().includes(q) ||
        (cat?.name ?? "").toLocaleLowerCase().includes(q) ||
        (cat?.trade ?? "").toLocaleLowerCase().includes(q)
      );
    });
  })();

  // Toggle helper: same column flips direction; new column resets to asc.
  const handleSortTakeoff = (key: NonNullable<typeof takeoffSortBy>) => {
    if (takeoffSortBy === key) {
      setTakeoffSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setTakeoffSortBy(key);
      setTakeoffSortDir("asc");
    }
  };

  // Sort derivation. Default (`sortBy === null`) → Category asc, then Trade asc.
  // Otherwise sort by the chosen column then fall back to Category/Trade for
  // stable ordering within ties.
  const sortedTakeoffs = (() => {
    const cmp = (a: TakeoffQuantity, b: TakeoffQuantity, key: NonNullable<typeof takeoffSortBy>): number => {
      const catA = takeoffCategories.find(c => c.id === a.categoryId);
      const catB = takeoffCategories.find(c => c.id === b.categoryId);
      const num = (v: string | undefined | null) => {
        const n = parseFloat(v ?? "");
        return isFinite(n) ? n : -Infinity;
      };
      const str = (v: string | undefined | null) => (v ?? "").toLocaleLowerCase();
      switch (key) {
        case "category": return str(catA?.name).localeCompare(str(catB?.name));
        case "trade": return str(catA?.trade).localeCompare(str(catB?.trade));
        case "name": return str(a.room).localeCompare(str(b.room));
        case "quantity": return num(a.quantity) - num(b.quantity);
        case "unit": return str(a.unit).localeCompare(str(b.unit));
        case "unitCost": return num(a.unitCost) - num(b.unitCost);
        case "extended": {
          const extA = a.extendedCost != null && a.extendedCost !== "" ? num(a.extendedCost) : num(a.quantity) * num(a.unitCost);
          const extB = b.extendedCost != null && b.extendedCost !== "" ? num(b.extendedCost) : num(b.quantity) * num(b.unitCost);
          return extA - extB;
        }
        case "notes": return str(a.notes).localeCompare(str(b.notes));
      }
    };
    const dirMul = takeoffSortDir === "asc" ? 1 : -1;
    return [...filteredTakeoffs].sort((a, b) => {
      if (takeoffSortBy) {
        const primary = cmp(a, b, takeoffSortBy) * dirMul;
        if (primary !== 0) return primary;
      }
      // Default tiebreakers: Category asc, then Trade asc.
      const catTie = cmp(a, b, "category");
      if (catTie !== 0) return catTie;
      return cmp(a, b, "trade");
    });
  })();

  const takeoffSummary = takeoffCategories.map(cat => {
    const items = takeoffQuantities.filter(t => t.categoryId === cat.id);
    const totalQty = items.reduce((sum, i) => sum + parseFloat(i.quantity || "0"), 0);
    const totalCost = items.reduce((sum, i) => sum + parseFloat(i.extendedCost || "0"), 0);
    return { ...cat, count: items.length, totalQty, totalCost, items };
  });

  const filteredSummary = takeoffFilter === "all" 
    ? takeoffSummary 
    : takeoffSummary.filter(cat => cat.id === takeoffFilter);

  const systemsStatus = SYSTEMS.map(sys => {
    const system = buildingSystems.find(s => s.systemType === sys.id);
    return {
      ...sys,
      status: system?.status || "not_started",
      completion: system?.completionPercent || 0,
      commissioning: system?.commissioningStatus || "pending",
    };
  });

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Layers className="h-8 w-8 text-primary" />
            Design & Systems
          </h1>
          <p className="text-muted-foreground mt-1">
            Blueprint Hub, Takeoff Engine, Auto-Build & Systems Matrix
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setIsUploadOpen(true)} data-testid="button-upload-plans">
            <Upload className="h-4 w-4 mr-2" />
            Upload Plans
          </Button>
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Upload Drawing Sheets</DialogTitle>
                <DialogDescription>
                  Upload PDF, DWG, DXF, IFC, or Revit files
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                if (!uploadedStorageKey) {
                  toast({
                    title: "File required",
                    description: "Please upload a drawing file before creating the sheet record.",
                    variant: "destructive",
                  });
                  return;
                }
                uploadSheetMutation.mutate({
                  sheetNumber: formData.get("sheetNumber") as string,
                  sheetTitle: formData.get("sheetTitle") as string,
                  discipline: formData.get("discipline") as string,
                  fileType: formData.get("fileType") as string,
                  storageKey: uploadedStorageKey,
                });
              }} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sheetNumber">Sheet Number</Label>
                    <Input id="sheetNumber" name="sheetNumber" placeholder="A1.1" required data-testid="input-sheet-number" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="discipline">Discipline</Label>
                    <Select name="discipline" defaultValue="architectural">
                      <SelectTrigger data-testid="select-discipline">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DISCIPLINES.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sheetTitle">Sheet Title</Label>
                  <Input id="sheetTitle" name="sheetTitle" placeholder="First Floor Plan" required data-testid="input-sheet-title" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fileType">File Type</Label>
                  <Select name="fileType" defaultValue="pdf">
                    <SelectTrigger data-testid="select-file-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="dwg">DWG (AutoCAD)</SelectItem>
                      <SelectItem value="dxf">DXF</SelectItem>
                      <SelectItem value="ifc">IFC (BIM)</SelectItem>
                      <SelectItem value="rvt">Revit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>File</Label>
                  <ObjectUploader
                    maxNumberOfFiles={1}
                    maxFileSize={52428800}
                    onGetUploadParameters={async (file) => {
                      const res = await fetch("/api/uploads/request-url", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          name: file.name,
                          size: file.size,
                          contentType: file.type,
                        }),
                      });
                      const data = await res.json();
                      if (data.objectPath) {
                        setUploadedStorageKey(data.objectPath);
                      }
                      return {
                        method: "PUT" as const,
                        url: data.uploadURL,
                        headers: { "Content-Type": file.type },
                      };
                    }}
                    onComplete={(result) => {
                      if (result.successful?.length) {
                        toast({ title: "File uploaded", description: `${result.successful[0].name} uploaded successfully` });
                      }
                    }}
                    buttonClassName="w-full"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Select Drawing File
                  </ObjectUploader>
                  {uploadedStorageKey && (
                    <p className="text-sm text-green-600">File ready for upload</p>
                  )}
                </div>
                <input type="hidden" name="storageKey" value={uploadedStorageKey || ""} />
                <Button type="submit" className="w-full" disabled={uploadSheetMutation.isPending} data-testid="button-submit-upload">
                  {uploadSheetMutation.isPending ? "Creating Sheet..." : "Create Sheet Record"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={isAutoBuildOpen} onOpenChange={setIsAutoBuildOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-auto-build">
                <Workflow className="h-4 w-4 mr-2" />
                Auto-Build Project
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Auto-Build Project from Plans</DialogTitle>
                <DialogDescription>
                  Automatically generate phases, tasks, inspections, and material lists from uploaded drawings
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">What will be created:</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Project Phases ({AUTO_BUILD_PHASES.length})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Task Dependencies</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Required Inspections</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Material Lists</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Submittals Schedule</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Trade Scopes</span>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Phases to Generate:</Label>
                  <div className="max-h-48 overflow-auto border rounded-lg p-2 space-y-1">
                    {AUTO_BUILD_PHASES.map((phase, i) => (
                      <div key={phase.type} className="flex items-center gap-2 text-sm p-2 hover:bg-muted/50 rounded">
                        <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium">{i + 1}</span>
                        <span className="flex-1">{phase.name}</span>
                        {phase.dependencies.length > 0 && (
                          <span className="text-muted-foreground text-xs">depends on: {phase.dependencies.join(", ")}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <Button 
                  onClick={() => autoBuildMutation.mutate({ projectId: "current" })} 
                  className="w-full"
                  disabled={autoBuildMutation.isPending}
                  data-testid="button-confirm-auto-build"
                >
                  {autoBuildMutation.isPending ? "Building..." : "Generate Project Structure"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" data-testid="tab-overview">
            <Layers className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="blueprint-hub" data-testid="tab-blueprint-hub">
            <Ruler className="h-4 w-4 mr-2" />
            Blueprint Hub
          </TabsTrigger>
          <TabsTrigger value="takeoff" data-testid="tab-takeoff">
            <Calculator className="h-4 w-4 mr-2" />
            Takeoff Engine
          </TabsTrigger>
          <TabsTrigger value="systems" data-testid="tab-systems">
            <Cpu className="h-4 w-4 mr-2" />
            Systems Matrix
          </TabsTrigger>
          <TabsTrigger value="deliverables" data-testid="tab-deliverables">
            <Package className="h-4 w-4 mr-2" />
            Deliverables
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-4 gap-4">
            <Card className="hover-elevate cursor-pointer" onClick={() => setActiveTab("blueprint-hub")} data-testid="card-blueprint-hub">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-blue-500/10">
                    <Ruler className="h-5 w-5 text-blue-500" />
                  </div>
                  <CardTitle className="text-lg">Blueprint Hub</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{drawingSheets.length}</div>
                <p className="text-sm text-muted-foreground">Drawing Sheets</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {DISCIPLINES.slice(0, 4).map(d => (
                    <Badge key={d.id} variant="secondary" className="text-xs">
                      {sheetsByDiscipline[d.id]?.length || 0} {d.label}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate cursor-pointer" onClick={() => setActiveTab("takeoff")} data-testid="card-takeoff-engine">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-green-500/10">
                    <Calculator className="h-5 w-5 text-green-500" />
                  </div>
                  <CardTitle className="text-lg">Takeoff Engine</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{takeoffQuantities.length}</div>
                <p className="text-sm text-muted-foreground">Items Taken Off</p>
                <div className="text-sm mt-2">
                  <span className="text-muted-foreground">Est. Cost: </span>
                  <span className="font-medium">${takeoffSummary.reduce((s, c) => s + c.totalCost, 0).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate cursor-pointer" onClick={() => setActiveTab("systems")} data-testid="card-systems-matrix">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-purple-500/10">
                    <Cpu className="h-5 w-5 text-purple-500" />
                  </div>
                  <CardTitle className="text-lg">Systems Matrix</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{SYSTEMS.length}</div>
                <p className="text-sm text-muted-foreground">Building Systems</p>
                <div className="flex items-center gap-2 mt-2">
                  <Progress value={systemsStatus.reduce((s, sys) => s + sys.completion, 0) / SYSTEMS.length} className="flex-1" />
                  <span className="text-sm text-muted-foreground">
                    {Math.round(systemsStatus.reduce((s, sys) => s + sys.completion, 0) / SYSTEMS.length)}%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="hover-elevate cursor-pointer" onClick={() => setActiveTab("deliverables")} data-testid="card-deliverables">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-orange-500/10">
                    <Package className="h-5 w-5 text-orange-500" />
                  </div>
                  <CardTitle className="text-lg">Deliverables</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">9</div>
                <p className="text-sm text-muted-foreground">Document Types</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  <Badge variant="outline" className="text-xs">Trade Scopes</Badge>
                  <Badge variant="outline" className="text-xs">Cable Schedules</Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Drawing Sets</CardTitle>
                <CardDescription>Version-controlled plan sets</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Lock className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="font-medium">100% CD Set</p>
                      <p className="text-sm text-muted-foreground">Issued Jan 15, 2026</p>
                    </div>
                  </div>
                  <Badge variant="default">Current Set</Badge>
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Unlock className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">90% DD Set</p>
                      <p className="text-sm text-muted-foreground">Issued Dec 20, 2025</p>
                    </div>
                  </div>
                  <Badge variant="secondary">Superseded</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
                <CardDescription>Common workflows</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" onClick={() => setIsUploadOpen(true)} data-testid="button-quick-upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload New Drawings
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => setActiveTab("takeoff")} data-testid="button-quick-takeoff">
                  <Calculator className="h-4 w-4 mr-2" />
                  Start Takeoff
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => setIsAutoBuildOpen(true)} data-testid="button-quick-auto-build">
                  <Workflow className="h-4 w-4 mr-2" />
                  Auto-Build from Plans
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full justify-start" 
                  onClick={() => {
                    setActiveTab("deliverables");
                    generateAllDeliverablesMutation.mutate();
                  }}
                  disabled={generateAllDeliverablesMutation.isPending}
                  data-testid="button-generate-deliverables"
                >
                  <FileSpreadsheet className={`h-4 w-4 mr-2 ${generateAllDeliverablesMutation.isPending ? "animate-spin" : ""}`} />
                  {generateAllDeliverablesMutation.isPending ? "Generating..." : "Generate Deliverables"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="blueprint-hub" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search sheets..." 
                  className="pl-9 w-64" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-sheets"
                />
              </div>
              <Separator orientation="vertical" className="h-8" />
              <span className="text-sm text-muted-foreground">Disciplines:</span>
              {DISCIPLINES.map(d => (
                <Button
                  key={d.id}
                  variant={visibleDisciplines.has(d.id) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleDiscipline(d.id)}
                  className="gap-1"
                  data-testid={`button-toggle-${d.id}`}
                >
                  {visibleDisciplines.has(d.id) ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                  {d.label}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {DISCIPLINES.filter(d => visibleDisciplines.has(d.id)).map(discipline => (
              <Card key={discipline.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 rounded-lg ${discipline.color}/10`}>
                      <discipline.icon className={`h-4 w-4`} style={{ color: discipline.color.replace('bg-', '') }} />
                    </div>
                    <CardTitle className="text-base">{discipline.label}</CardTitle>
                    <Badge variant="secondary" className="ml-auto">
                      {sheetsByDiscipline[discipline.id]?.length || 0}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    {sheetsByDiscipline[discipline.id]?.length > 0 ? (
                      <div className="space-y-2">
                        {sheetsByDiscipline[discipline.id].map(sheet => (
                          <div key={sheet.id} className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-lg cursor-pointer" onClick={() => { setViewingSheet(sheet); setIsViewSheetOpen(true); }} data-testid={`sheet-${sheet.id}`}>
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{sheet.sheetNumber}</p>
                              <p className="text-xs text-muted-foreground truncate">{sheet.sheetTitle}</p>
                            </div>
                            {sheet.isCurrentSet && <Lock className="h-3 w-3 text-green-500" />}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        No sheets uploaded
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            ))}
          </div>

          <Dialog open={isViewSheetOpen} onOpenChange={(open) => { setIsViewSheetOpen(open); if (!open) setViewingSheet(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Drawing Sheet Details</DialogTitle>
                <DialogDescription>View and manage this drawing sheet</DialogDescription>
              </DialogHeader>
              {viewingSheet && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-sm">Sheet Number</Label>
                      <p className="font-medium">{viewingSheet.sheetNumber}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-sm">Discipline</Label>
                      <p className="font-medium">{DISCIPLINES.find(d => d.id === viewingSheet.discipline)?.label || viewingSheet.discipline}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-sm">Sheet Title</Label>
                    <p className="font-medium">{viewingSheet.sheetTitle}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-sm">Version</Label>
                      <p className="font-medium">v{viewingSheet.version}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-sm">File Type</Label>
                      <p className="font-medium uppercase">{viewingSheet.fileType}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-sm">Status</Label>
                      <Badge variant={viewingSheet.isCurrentSet ? "default" : "secondary"}>
                        {viewingSheet.isCurrentSet ? "Current" : "Superseded"}
                      </Badge>
                    </div>
                  </div>
                  {viewingSheet.scale && (
                    <div>
                      <Label className="text-muted-foreground text-sm">Scale</Label>
                      <p className="font-medium">{viewingSheet.scale}</p>
                    </div>
                  )}
                  <Separator />
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      className="flex-1" 
                      onClick={() => {
                        if (viewingSheet.storageKey) {
                          window.open(`/api/drawing-sheets/${viewingSheet.id}/download`, "_blank");
                        } else {
                          toast({ title: "No file attached", description: "Upload a file to view it", variant: "destructive" });
                        }
                      }} 
                      data-testid="button-view-sheet"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      View Sheet
                    </Button>
                    <Button 
                      variant="outline" 
                      onClick={() => downloadSheetFile(viewingSheet.id)}
                      disabled={downloadingSheet === viewingSheet.id}
                      data-testid="button-download-sheet"
                    >
                      {downloadingSheet === viewingSheet.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    </Button>
                    <Button variant="destructive" onClick={() => deleteSheetMutation.mutate(viewingSheet.id)} disabled={deleteSheetMutation.isPending} data-testid="button-delete-sheet">
                      {deleteSheetMutation.isPending ? "Deleting..." : "Delete"}
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {filteredSheets.length === 0 && drawingSheets.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Ruler className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No drawings uploaded yet</h3>
                <p className="text-muted-foreground text-center max-w-md mt-1">
                  Upload your first drawing set to start. Supports PDF, DWG, DXF, IFC, and Revit files.
                </p>
                <Button className="mt-4" onClick={() => setIsUploadOpen(true)} data-testid="button-first-upload">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Drawings
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="takeoff" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dialog open={isNewTakeoffOpen} onOpenChange={(open) => {
                setIsNewTakeoffOpen(open);
                if (!open) { setNewTakeoffForm(emptyNewTakeoff); setNewTakeoffErrors({}); }
              }}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={takeoffCategories.length === 0} data-testid="button-new-takeoff">
                    <Plus className="h-4 w-4 mr-2" />
                    {takeoffCategories.length === 0 ? "Loading Categories..." : "New Takeoff Item"}
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Takeoff Quantity</DialogTitle>
                    <DialogDescription>Record a new quantity measurement</DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      // Inline validation for required fields.
                      const errs: Record<string, string> = {};
                      if (!newTakeoffForm.room.trim()) errs.room = "Item name is required";
                      if (!newTakeoffForm.categoryId) errs.categoryId = "Category is required";
                      const qty = parseFloat(newTakeoffForm.quantity);
                      if (!newTakeoffForm.quantity.trim() || !isFinite(qty) || qty <= 0) errs.quantity = "Quantity must be greater than 0";
                      if (!newTakeoffForm.unit) errs.unit = "Unit is required";
                      if (newTakeoffForm.unitCost.trim()) {
                        const uc = parseFloat(newTakeoffForm.unitCost);
                        if (!isFinite(uc) || uc < 0) errs.unitCost = "Unit cost must be a non-negative number";
                      }
                      setNewTakeoffErrors(errs);
                      if (Object.keys(errs).length > 0) return;
                      createTakeoffQuantityMutation.mutate(
                        {
                          categoryId: newTakeoffForm.categoryId,
                          projectId: newTakeoffForm.projectId || undefined,
                          room: newTakeoffForm.room.trim(),
                          quantity: newTakeoffForm.quantity,
                          unit: newTakeoffForm.unit,
                          unitCost: newTakeoffForm.unitCost || undefined,
                          notes: newTakeoffForm.notes || undefined,
                        } as any,
                        {
                          onSuccess: () => {
                            setNewTakeoffForm(emptyNewTakeoff);
                            setNewTakeoffErrors({});
                          },
                        }
                      );
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="new-takeoff-room">
                        Item Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="new-takeoff-room"
                        value={newTakeoffForm.room}
                        onChange={(e) => setNewTakeoffForm(f => ({ ...f, room: e.target.value }))}
                        placeholder="e.g. 4-inch concrete slab"
                        aria-invalid={!!newTakeoffErrors.room}
                        data-testid="input-takeoff-name"
                      />
                      {newTakeoffErrors.room && (
                        <p className="text-sm text-destructive" data-testid="error-takeoff-name">{newTakeoffErrors.room}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-takeoff-category">
                          Category <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={newTakeoffForm.categoryId}
                          onValueChange={(v) => setNewTakeoffForm(f => ({ ...f, categoryId: v }))}
                        >
                          <SelectTrigger id="new-takeoff-category" aria-invalid={!!newTakeoffErrors.categoryId} data-testid="select-takeoff-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                          <SelectContent>
                            {takeoffCategories.map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {newTakeoffErrors.categoryId && (
                          <p className="text-sm text-destructive" data-testid="error-takeoff-category">{newTakeoffErrors.categoryId}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Trade</Label>
                        <Input
                          value={takeoffCategories.find(c => c.id === newTakeoffForm.categoryId)?.trade || ""}
                          readOnly
                          disabled
                          placeholder="Auto-filled from category"
                          data-testid="input-takeoff-trade"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-takeoff-quantity">
                          Quantity <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="new-takeoff-quantity"
                          type="number"
                          step="0.01"
                          value={newTakeoffForm.quantity}
                          onChange={(e) => setNewTakeoffForm(f => ({ ...f, quantity: e.target.value }))}
                          placeholder="0.00"
                          aria-invalid={!!newTakeoffErrors.quantity}
                          data-testid="input-takeoff-quantity"
                        />
                        {newTakeoffErrors.quantity && (
                          <p className="text-sm text-destructive" data-testid="error-takeoff-quantity">{newTakeoffErrors.quantity}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-takeoff-unit">
                          Unit <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={newTakeoffForm.unit}
                          onValueChange={(v) => setNewTakeoffForm(f => ({ ...f, unit: v }))}
                        >
                          <SelectTrigger id="new-takeoff-unit" aria-invalid={!!newTakeoffErrors.unit} data-testid="select-takeoff-unit">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EA">EA (Each)</SelectItem>
                            <SelectItem value="LF">LF (Linear Ft)</SelectItem>
                            <SelectItem value="SF">SF (Sq Ft)</SelectItem>
                            <SelectItem value="CY">CY (Cubic Yd)</SelectItem>
                            <SelectItem value="LB">LB (Pound)</SelectItem>
                            <SelectItem value="HR">HR (Hour)</SelectItem>
                            <SelectItem value="LS">LS (Lump Sum)</SelectItem>
                            <SelectItem value="TON">TON</SelectItem>
                            <SelectItem value="GAL">GAL (Gallon)</SelectItem>
                          </SelectContent>
                        </Select>
                        {newTakeoffErrors.unit && (
                          <p className="text-sm text-destructive" data-testid="error-takeoff-unit">{newTakeoffErrors.unit}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-takeoff-unit-cost">Unit Cost ($)</Label>
                        <Input
                          id="new-takeoff-unit-cost"
                          type="number"
                          step="0.01"
                          value={newTakeoffForm.unitCost}
                          onChange={(e) => setNewTakeoffForm(f => ({ ...f, unitCost: e.target.value }))}
                          placeholder="0.00"
                          aria-invalid={!!newTakeoffErrors.unitCost}
                          data-testid="input-takeoff-cost"
                        />
                        {newTakeoffErrors.unitCost && (
                          <p className="text-sm text-destructive" data-testid="error-takeoff-cost">{newTakeoffErrors.unitCost}</p>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-takeoff-project">Project</Label>
                      <Select
                        value={newTakeoffForm.projectId || "__none__"}
                        onValueChange={(v) => setNewTakeoffForm(f => ({ ...f, projectId: v === "__none__" ? "" : v }))}
                      >
                        <SelectTrigger id="new-takeoff-project" data-testid="select-takeoff-project">
                          <SelectValue placeholder="Optional — leave blank for unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Unassigned —</SelectItem>
                          {projectsData.map(p => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-takeoff-notes">Notes</Label>
                      <Textarea
                        id="new-takeoff-notes"
                        value={newTakeoffForm.notes}
                        onChange={(e) => setNewTakeoffForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional notes for this line item"
                        rows={3}
                        data-testid="input-takeoff-notes"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={createTakeoffQuantityMutation.isPending} data-testid="button-submit-takeoff">
                      {createTakeoffQuantityMutation.isPending ? "Adding..." : "Add Takeoff Item"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={() => { setSelectedBlueprintIds(new Set()); setIsImportTakeoffOpen(true); }} data-testid="button-import-takeoff">
                <Upload className="h-4 w-4 mr-2" />
                Import from Plans
              </Button>
              <Dialog open={isImportTakeoffOpen} onOpenChange={setIsImportTakeoffOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Import Takeoff from Plans</DialogTitle>
                    <DialogDescription>
                      Select one or more blueprints. Their measured takeoff items will be matched to your existing takeoff categories by name and added to this list.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const ids = Array.from(selectedBlueprintIds);
                      if (ids.length === 0) {
                        toast({ title: "No blueprints selected", description: "Pick at least one blueprint to import from.", variant: "destructive" });
                        return;
                      }
                      importTakeoffFromBlueprintsMutation.mutate(ids);
                    }}
                    className="space-y-4"
                  >
                    {/* Select-all / clear-all header for the blueprint checkbox list. */}
                    {blueprintsData.length > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span data-testid="text-blueprint-selection-count">
                          {selectedBlueprintIds.size} of {blueprintsData.length} selected
                        </span>
                        <div className="flex gap-3">
                          <button
                            type="button"
                            className="hover:text-foreground underline-offset-2 hover:underline"
                            onClick={() => setSelectedBlueprintIds(new Set(blueprintsData.map(b => b.id)))}
                            data-testid="button-select-all-blueprints"
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            className="hover:text-foreground underline-offset-2 hover:underline"
                            onClick={() => setSelectedBlueprintIds(new Set())}
                            data-testid="button-clear-blueprints"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="rounded-md border max-h-80 overflow-y-auto divide-y" data-testid="list-blueprints">
                      {blueprintsData.length === 0 ? (
                        <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                          No blueprints available — upload one in Blueprint Hub first.
                        </div>
                      ) : (
                        blueprintsData.map((b) => {
                          const checked = selectedBlueprintIds.has(b.id);
                          const uploaded = b.uploadedAt || b.createdAt;
                          const uploadedLabel = uploaded
                            ? new Date(uploaded).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
                            : "Unknown date";
                          const pages = b.pageCount ?? 1;
                          return (
                            <label
                              key={b.id}
                              htmlFor={`bp-${b.id}`}
                              className="flex items-start gap-3 px-3 py-2.5 hover-elevate cursor-pointer"
                              data-testid={`row-blueprint-${b.id}`}
                            >
                              <Checkbox
                                id={`bp-${b.id}`}
                                checked={checked}
                                onCheckedChange={(v) => {
                                  setSelectedBlueprintIds((prev) => {
                                    const next = new Set(prev);
                                    if (v) next.add(b.id); else next.delete(b.id);
                                    return next;
                                  });
                                }}
                                data-testid={`checkbox-blueprint-${b.id}`}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate" data-testid={`text-blueprint-title-${b.id}`}>{b.title}</div>
                                <div className="text-xs text-muted-foreground flex items-center gap-3 mt-0.5">
                                  <span data-testid={`text-blueprint-uploaded-${b.id}`}>Uploaded {uploadedLabel}</span>
                                  <span>·</span>
                                  <span data-testid={`text-blueprint-pages-${b.id}`}>{pages} page{pages === 1 ? "" : "s"}</span>
                                </div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={selectedBlueprintIds.size === 0 || importTakeoffFromBlueprintsMutation.isPending}
                      data-testid="button-confirm-import-takeoff"
                    >
                      {importTakeoffFromBlueprintsMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Importing...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Import from {selectedBlueprintIds.size || 0} Blueprint{selectedBlueprintIds.size === 1 ? "" : "s"}
                        </>
                      )}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <AlertDialog open={!!deletingTakeoff} onOpenChange={(open) => { if (!open) setDeletingTakeoff(null); }}>
                <AlertDialogContent data-testid="dialog-confirm-delete-takeoff">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this takeoff item?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {(() => {
                        const cat = deletingTakeoff ? takeoffCategories.find(c => c.id === deletingTakeoff.categoryId) : null;
                        const label = deletingTakeoff?.room?.trim() || cat?.name || "this item";
                        return `"${label}" will be permanently removed from the takeoff. This action cannot be undone.`;
                      })()}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete-takeoff">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (deletingTakeoff) {
                          deleteTakeoffMutation.mutate(deletingTakeoff.id);
                          setDeletingTakeoff(null);
                        }
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete-takeoff"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Dialog open={isEditTakeoffOpen} onOpenChange={(open) => { setIsEditTakeoffOpen(open); if (!open) setEditingTakeoff(null); }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Takeoff Quantity</DialogTitle>
                    <DialogDescription>Update quantity measurement</DialogDescription>
                  </DialogHeader>
                  {editingTakeoff && (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      updateTakeoffMutation.mutate({
                        id: editingTakeoff.id,
                        categoryId: formData.get("categoryId") as string,
                        room: formData.get("room") as string,
                        floor: formData.get("floor") as string,
                        quantity: formData.get("quantity") as string,
                        unit: formData.get("unit") as string,
                        unitCost: formData.get("unitCost") as string,
                        notes: (formData.get("notes") as string) || "",
                      });
                    }} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-categoryId">Category</Label>
                          <Select name="categoryId" defaultValue={editingTakeoff.categoryId} required>
                            <SelectTrigger data-testid="select-edit-takeoff-category">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              {takeoffCategories.map(cat => (
                                <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-unit">Unit</Label>
                          <Select name="unit" defaultValue={editingTakeoff.unit}>
                            <SelectTrigger data-testid="select-edit-takeoff-unit">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="EA">EA (Each)</SelectItem>
                              <SelectItem value="SF">SF (Sq Ft)</SelectItem>
                              <SelectItem value="LF">LF (Linear Ft)</SelectItem>
                              <SelectItem value="CY">CY (Cubic Yd)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-room">Room/Area</Label>
                          <Input id="edit-room" name="room" defaultValue={editingTakeoff.room || ""} placeholder="e.g. Room 101" data-testid="input-edit-takeoff-room" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-floor">Floor</Label>
                          <Input id="edit-floor" name="floor" defaultValue={editingTakeoff.floor || ""} placeholder="e.g. Floor 1" data-testid="input-edit-takeoff-floor" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-quantity">Quantity</Label>
                          <Input id="edit-quantity" name="quantity" type="number" step="0.01" defaultValue={editingTakeoff.quantity} required placeholder="0.00" data-testid="input-edit-takeoff-quantity" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-unitCost">Unit Cost ($)</Label>
                          <Input id="edit-unitCost" name="unitCost" type="number" step="0.01" defaultValue={editingTakeoff.unitCost || ""} placeholder="0.00" data-testid="input-edit-takeoff-cost" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-notes">Notes</Label>
                        <Textarea id="edit-notes" name="notes" defaultValue={editingTakeoff.notes || ""} placeholder="Optional notes for this line item" rows={2} data-testid="input-edit-takeoff-notes" />
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1" disabled={updateTakeoffMutation.isPending} data-testid="button-update-takeoff">
                          {updateTakeoffMutation.isPending ? "Updating..." : "Update Item"}
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => { deleteTakeoffMutation.mutate(editingTakeoff.id); setIsEditTakeoffOpen(false); }} data-testid="button-delete-takeoff">
                          Delete
                        </Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex items-center gap-2">
              <Select value={takeoffFilter} onValueChange={setTakeoffFilter}>
                <SelectTrigger className="w-40" data-testid="select-takeoff-filter">
                  <SelectValue placeholder="Filter by..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {takeoffCategories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportTakeoffCSV} data-testid="button-export-takeoff">
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (!takeoffQuantities || takeoffQuantities.length === 0) {
                    toast({ title: "Nothing to export", description: "No takeoff items found.", variant: "destructive" });
                    return;
                  }
                  // The PDF route is server-side; trigger a navigation so the
                  // browser handles the download via Content-Disposition.
                  window.location.href = "/api/takeoffs/export/pdf";
                }}
                data-testid="button-export-takeoff-pdf"
              >
                <Download className="h-4 w-4 mr-2" />
                Export PDF
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by item name, category, or trade..."
              className="pl-9 pr-9"
              value={takeoffSearch}
              onChange={(e) => setTakeoffSearch(e.target.value)}
              data-testid="input-takeoff-search"
            />
            {takeoffSearch && (
              <button
                type="button"
                onClick={() => setTakeoffSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground rounded-md p-1 hover-elevate active-elevate-2"
                aria-label="Clear search"
                data-testid="button-clear-takeoff-search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-5 gap-4">
            {/* Render the FULL summary so cards stay visible even when a single
                category is selected — clicking a card filters the table; clicking
                the same card again clears the filter. */}
            {(() => {
              const grandTotal = takeoffSummary.reduce((s, c) => s + c.totalCost, 0);
              return takeoffSummary.map(cat => {
                const active = takeoffFilter === cat.id;
                const pct = grandTotal > 0 ? (cat.totalCost / grandTotal) * 100 : 0;
                return (
                  <Card
                    key={cat.id}
                    className={`hover-elevate cursor-pointer transition-colors ${active ? "ring-2 ring-primary border-primary bg-primary/5" : ""}`}
                    onClick={() => setTakeoffFilter(active ? "all" : cat.id)}
                    data-testid={`card-takeoff-${cat.id}`}
                    aria-pressed={active}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className={`text-sm font-medium ${active ? "text-primary" : ""}`}>{cat.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{cat.totalQty.toLocaleString()} {cat.unit}</div>
                      <p className="text-sm text-muted-foreground">{cat.count} line items</p>
                      {cat.totalCost > 0 && (
                        <>
                          <p className="text-sm font-medium mt-1">${cat.totalCost.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground" data-testid={`text-takeoff-pct-${cat.id}`}>
                            {pct < 0.1 ? "<0.1" : pct.toFixed(pct < 10 ? 1 : 0)}% of project total
                          </p>
                        </>
                      )}
                    </CardContent>
                  </Card>
                );
              });
            })()}
            {/* Grand-total card: always shows the project-wide totals across all
                categories. Clicking it clears the active category filter. */}
            <Card
              className={`hover-elevate cursor-pointer border-primary/40 bg-primary/5 ${takeoffFilter === "all" ? "ring-2 ring-primary" : ""}`}
              onClick={() => setTakeoffFilter("all")}
              data-testid="card-takeoff-total-project"
              aria-pressed={takeoffFilter === "all"}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-primary">Total Project</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold" data-testid="text-takeoff-grand-total-cost">
                  ${takeoffSummary.reduce((s, c) => s + c.totalCost, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-sm text-muted-foreground" data-testid="text-takeoff-grand-total-count">
                  {takeoffQuantities.length.toLocaleString()} {takeoffQuantities.length === 1 ? "line item" : "line items"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  across {takeoffSummary.filter(c => c.count > 0).length} {takeoffSummary.filter(c => c.count > 0).length === 1 ? "category" : "categories"}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Takeoff Summary by Trade</CardTitle>
              <CardDescription>Material quantities ready for export to budget and procurement</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      {([
                        { key: "category", label: "Category", align: "left" },
                        { key: "trade", label: "Trade", align: "left" },
                        { key: "name", label: "Item Name", align: "left" },
                        { key: "quantity", label: "Quantity", align: "right" },
                        { key: "unit", label: "Unit", align: "left" },
                        { key: "unitCost", label: "Unit Cost", align: "right" },
                        { key: "extended", label: "Extended", align: "right" },
                        { key: "notes", label: "Notes", align: "left" },
                      ] as const).map(col => {
                        const active = takeoffSortBy === col.key;
                        const Indicator = active
                          ? (takeoffSortDir === "asc" ? ChevronUp : ChevronDown)
                          : ChevronsUpDown;
                        return (
                          <th
                            key={col.key}
                            className={`p-3 font-medium ${col.align === "right" ? "text-right" : "text-left"}`}
                          >
                            <button
                              type="button"
                              className={`inline-flex items-center gap-1 ${col.align === "right" ? "ml-auto" : ""} hover-elevate active-elevate-2 px-1.5 py-0.5 rounded select-none`}
                              onClick={() => handleSortTakeoff(col.key)}
                              aria-sort={active ? (takeoffSortDir === "asc" ? "ascending" : "descending") : "none"}
                              data-testid={`sort-takeoff-${col.key}`}
                            >
                              <span>{col.label}</span>
                              <Indicator className={`h-3.5 w-3.5 ${active ? "text-foreground" : "text-muted-foreground/60"}`} />
                            </button>
                          </th>
                        );
                      })}
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedTakeoffs.length > 0 ? sortedTakeoffs.map(item => {
                      const cat = takeoffCategories.find(c => c.id === item.categoryId);
                      return (
                        <tr key={item.id} className="border-t">
                          <td className="p-3">
                            <span
                              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${categoryBadgeClass(cat?.name)}`}
                              data-testid={`badge-category-${item.id}`}
                            >
                              {cat?.name || "Unknown"}
                            </span>
                          </td>
                          <td className="p-3">
                            <Badge variant="outline">{cat?.trade || "Unknown"}</Badge>
                          </td>
                          <td className="p-3 max-w-xs">
                            <div className="truncate" title={item.room || "—"} data-testid={`text-takeoff-name-${item.id}`}>
                              {item.room || <span className="text-muted-foreground">—</span>}
                            </div>
                          </td>
                          <td className="p-3 text-right">{parseFloat(item.quantity).toLocaleString()}</td>
                          <td className="p-3">{item.unit}</td>
                          <td className="p-3 text-right">
                            {item.unitCost && parseFloat(item.unitCost) > 0
                              ? `$${parseFloat(item.unitCost).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : "—"}
                          </td>
                          <td className="p-3 text-right font-medium">
                            {(() => {
                              const ext = item.extendedCost != null && item.extendedCost !== ""
                                ? parseFloat(item.extendedCost)
                                : (parseFloat(item.quantity || "0") * parseFloat(item.unitCost || "0"));
                              return ext > 0
                                ? `$${ext.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : "—";
                            })()}
                          </td>
                          <td className="p-3 max-w-xs">
                            <div className="truncate text-sm text-muted-foreground" title={item.notes || ""} data-testid={`text-takeoff-notes-${item.id}`}>
                              {item.notes || <span className="text-muted-foreground/60">—</span>}
                            </div>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button size="sm" variant="ghost" onClick={() => { setEditingTakeoff(item); setIsEditTakeoffOpen(true); }} data-testid={`button-edit-takeoff-${item.id}`}>
                                Edit
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-destructive hover:text-destructive"
                                onClick={() => setDeletingTakeoff(item)}
                                data-testid={`button-delete-takeoff-row-${item.id}`}
                                aria-label="Delete takeoff item"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr className="border-t">
                        <td colSpan={9} className="p-6 text-center text-muted-foreground">
                          No takeoff items yet. Click "New Takeoff Item" to add quantities.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {sortedTakeoffs.length > 0 && (
                    <tfoot className="bg-muted/50 border-t font-medium">
                      <tr className="sticky bottom-0">
                        <td colSpan={6} className="p-3 text-sm" data-testid="text-takeoff-footer-count">
                          {sortedTakeoffs.length} {sortedTakeoffs.length === 1 ? "item" : "items"}
                          {takeoffFilter !== "all" && <span className="text-muted-foreground font-normal"> · filtered</span>}
                        </td>
                        <td className="p-3 text-right text-sm" data-testid="text-takeoff-footer-total">
                          Total:&nbsp;
                          {(() => {
                            const total = sortedTakeoffs.reduce((sum, item) => {
                              const ext = item.extendedCost != null && item.extendedCost !== ""
                                ? parseFloat(item.extendedCost)
                                : (parseFloat(item.quantity || "0") * parseFloat(item.unitCost || "0"));
                              return sum + (isFinite(ext) ? ext : 0);
                            }, 0);
                            return `$${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          })()}
                        </td>
                        <td colSpan={2} className="p-3" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="systems" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setIsAddSystemOpen(true)} data-testid="button-add-system">
                <Plus className="h-4 w-4 mr-2" />
                Add System
              </Button>
              <Dialog open={isAddSystemOpen} onOpenChange={setIsAddSystemOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Building System</DialogTitle>
                    <DialogDescription>Track a new building system</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    addSystemMutation.mutate({
                      systemType: formData.get("systemType") as string,
                      systemName: formData.get("systemName") as string,
                      status: formData.get("status") as string,
                    });
                  }} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="systemType">System Type</Label>
                      <Select name="systemType" required>
                        <SelectTrigger data-testid="select-system-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {SYSTEMS.map(sys => (
                            <SelectItem key={sys.id} value={sys.id}>{sys.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="systemName">System Name</Label>
                      <Input id="systemName" name="systemName" placeholder="e.g. Main Electrical Distribution" required data-testid="input-system-name" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="status">Status</Label>
                      <Select name="status" defaultValue="not_started">
                        <SelectTrigger data-testid="select-system-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="not_started">Not Started</SelectItem>
                          <SelectItem value="in_progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full" disabled={addSystemMutation.isPending} data-testid="button-submit-system">
                      {addSystemMutation.isPending ? "Adding..." : "Add System"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => syncSystemsMutation.mutate()} disabled={syncSystemsMutation.isPending} data-testid="button-refresh-systems">
                <RefreshCw className={`h-4 w-4 mr-2 ${syncSystemsMutation.isPending ? "animate-spin" : ""}`} />
                {syncSystemsMutation.isPending ? "Syncing..." : "Sync Status"}
              </Button>
              <Dialog open={isEditSystemOpen} onOpenChange={(open) => { setIsEditSystemOpen(open); if (!open) setEditingSystem(null); }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Building System</DialogTitle>
                    <DialogDescription>Update system status and progress</DialogDescription>
                  </DialogHeader>
                  {editingSystem && (
                    <form onSubmit={(e) => {
                      e.preventDefault();
                      const formData = new FormData(e.currentTarget);
                      updateSystemMutation.mutate({
                        id: editingSystem.id,
                        systemName: formData.get("systemName") as string,
                        status: formData.get("status") as string,
                        completionPercent: parseInt(formData.get("completionPercent") as string) || 0,
                        commissioningStatus: formData.get("commissioningStatus") as string,
                        asBuiltStatus: formData.get("asBuiltStatus") as string,
                      });
                    }} className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-systemName">System Name</Label>
                        <Input id="edit-systemName" name="systemName" defaultValue={editingSystem.systemName} required data-testid="input-edit-system-name" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-status">Status</Label>
                          <Select name="status" defaultValue={editingSystem.status}>
                            <SelectTrigger data-testid="select-edit-system-status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="not_started">Not Started</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-completionPercent">Completion %</Label>
                          <Input id="edit-completionPercent" name="completionPercent" type="number" min="0" max="100" defaultValue={editingSystem.completionPercent} data-testid="input-edit-completion" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-commissioningStatus">Commissioning</Label>
                          <Select name="commissioningStatus" defaultValue={editingSystem.commissioningStatus}>
                            <SelectTrigger data-testid="select-edit-commissioning">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="complete">Complete</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-asBuiltStatus">As-Built Status</Label>
                          <Select name="asBuiltStatus" defaultValue={editingSystem.asBuiltStatus}>
                            <SelectTrigger data-testid="select-edit-asbuilt">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="complete">Complete</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1" disabled={updateSystemMutation.isPending} data-testid="button-update-system">
                          {updateSystemMutation.isPending ? "Updating..." : "Update System"}
                        </Button>
                        <Button 
                          type="button" 
                          variant="destructive" 
                          onClick={() => deleteSystemMutation.mutate(editingSystem.id)}
                          disabled={deleteSystemMutation.isPending}
                          data-testid="button-delete-system"
                        >
                          {deleteSystemMutation.isPending ? "Deleting..." : "Delete"}
                        </Button>
                      </div>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {systemsStatus.map(sys => {
              const systemData = buildingSystems.find(s => s.systemType === sys.id);
              return (
                <Card 
                  key={sys.id} 
                  className={`hover-elevate cursor-pointer ${selectedSystemId === sys.id ? "ring-2 ring-primary" : ""}`}
                  onClick={() => setSelectedSystemId(sys.id)}
                  data-testid={`card-system-${sys.id}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-lg ${sys.color}/10`}>
                        <sys.icon className="h-4 w-4" />
                      </div>
                      <CardTitle className="text-sm">{sys.label}</CardTitle>
                      {systemData && (
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="ml-auto h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); setEditingSystem(systemData); setIsEditSystemOpen(true); }}
                          data-testid={`button-edit-system-${sys.id}`}
                        >
                          <Wrench className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Progress value={sys.completion} className="flex-1" />
                      <span className="text-sm font-medium">{sys.completion}%</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant={sys.status === "completed" ? "default" : "secondary"}>
                        {sys.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Commissioning</span>
                      <Badge variant={sys.commissioning === "complete" ? "default" : "outline"}>
                        {sys.commissioning}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>System Details</CardTitle>
              <CardDescription>Scope, materials, devices, inspections, and commissioning status</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const selectedSystem = SYSTEMS.find(s => s.id === selectedSystemId);
                const selectedSystemData = buildingSystems.find(s => s.systemType === selectedSystemId);
                const systemTakeoffs = takeoffQuantities.filter(t => {
                  const cat = takeoffCategories.find(c => c.id === t.categoryId);
                  return cat?.trade === selectedSystemId;
                });
                return (
                  <Tabs defaultValue="scope">
                    <TabsList>
                      <TabsTrigger value="scope" data-testid="tab-system-scope">Scope</TabsTrigger>
                      <TabsTrigger value="materials" data-testid="tab-system-materials">Materials</TabsTrigger>
                      <TabsTrigger value="devices" data-testid="tab-system-devices">Devices</TabsTrigger>
                      <TabsTrigger value="inspections" data-testid="tab-system-inspections">Inspections</TabsTrigger>
                      <TabsTrigger value="asbuilts" data-testid="tab-system-asbuilts">As-Builts</TabsTrigger>
                      <TabsTrigger value="commissioning" data-testid="tab-system-commissioning">Commissioning</TabsTrigger>
                    </TabsList>
                    <TabsContent value="scope" className="p-4">
                      {selectedSystem ? (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <div className={`p-3 rounded-lg ${selectedSystem.color}/10`}>
                              <selectedSystem.icon className="h-6 w-6" />
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg">{selectedSystem.label}</h3>
                              <p className="text-muted-foreground">
                                {selectedSystemData?.systemName || "No system data available"}
                              </p>
                            </div>
                          </div>
                          <Separator />
                          <div className="grid grid-cols-3 gap-4">
                            <div className="p-3 bg-muted/50 rounded-lg">
                              <p className="text-sm text-muted-foreground">Status</p>
                              <p className="font-medium">{selectedSystemData?.status?.replace("_", " ") || "Not Started"}</p>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg">
                              <p className="text-sm text-muted-foreground">Completion</p>
                              <p className="font-medium">{selectedSystemData?.completionPercent || 0}%</p>
                            </div>
                            <div className="p-3 bg-muted/50 rounded-lg">
                              <p className="text-sm text-muted-foreground">Takeoff Items</p>
                              <p className="font-medium">{systemTakeoffs.length}</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Select a system card above to view its scope of work</p>
                      )}
                    </TabsContent>
                    <TabsContent value="materials" className="p-4">
                      {selectedSystem ? (
                        <div className="space-y-3">
                          <h4 className="font-medium">Materials for {selectedSystem.label}</h4>
                          {systemTakeoffs.length > 0 ? (
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="text-left p-2">Item</th>
                                    <th className="text-right p-2">Qty</th>
                                    <th className="text-left p-2">Unit</th>
                                    <th className="text-right p-2">Cost</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {systemTakeoffs.map(item => {
                                    const cat = takeoffCategories.find(c => c.id === item.categoryId);
                                    const qty = parseFloat(String(item.quantity ?? "0")) || 0;
                                    const unitCost = parseFloat(String(item.unitCost ?? "0")) || 0;
                                    const extendedNum = item.extendedCost != null && item.extendedCost !== ""
                                      ? parseFloat(String(item.extendedCost))
                                      : qty * unitCost;
                                    const display = isFinite(extendedNum) && extendedNum > 0
                                      ? `$${extendedNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                      : "—";
                                    return (
                                      <tr key={item.id} className="border-t">
                                        <td className="p-2">{cat?.name || "Unknown"}</td>
                                        <td className="p-2 text-right">{item.quantity}</td>
                                        <td className="p-2">{item.unit}</td>
                                        <td className="p-2 text-right" data-testid={`text-material-cost-${item.id}`}>{display}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="text-muted-foreground">No material takeoffs for this system yet</p>
                          )}
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Select a system to view materials</p>
                      )}
                    </TabsContent>
                    <TabsContent value="devices" className="p-4">
                      {selectedSystem ? (() => {
                        const sysRecord = buildingSystems.find(s => s.systemType === selectedSystem.id);
                        const devices = sysRecord
                          ? systemDevicesAll.filter(d => d.systemId === sysRecord.id)
                          : [];
                        return (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <h4 className="font-medium">Devices for {selectedSystem.label}</h4>
                              <Button variant="outline" size="sm" onClick={() => { generateDeliverableMutation.mutate("device_schedule"); }} disabled={generatingDeliverable === "device_schedule"} data-testid="button-generate-device-schedule">
                                {generatingDeliverable === "device_schedule" ? "Generating..." : "Generate Device Schedule"}
                              </Button>
                            </div>
                            {devices.length === 0 ? (
                              <p className="text-muted-foreground text-sm" data-testid="text-no-devices">
                                No devices yet. Click "Generate Device Schedule" to seed standard devices for {selectedSystem.label}.
                              </p>
                            ) : (
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="text-left p-2">Type</th>
                                      <th className="text-left p-2">Manufacturer</th>
                                      <th className="text-left p-2">Model</th>
                                      <th className="text-left p-2">Location</th>
                                      <th className="text-right p-2">Qty</th>
                                      <th className="text-right p-2">Installed</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {devices.map(d => (
                                      <tr key={d.id} className="border-t" data-testid={`row-device-${d.id}`}>
                                        <td className="p-2 capitalize">{d.deviceType.replace(/_/g, " ")}</td>
                                        <td className="p-2">{d.manufacturer || "—"}</td>
                                        <td className="p-2">{d.model || "—"}</td>
                                        <td className="p-2">{d.location || "—"}</td>
                                        <td className="p-2 text-right">{d.quantity}</td>
                                        <td className="p-2 text-right">{d.installedCount ?? 0}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <p className="text-muted-foreground">Select a system to view devices</p>
                      )}
                    </TabsContent>
                    <TabsContent value="inspections" className="p-4">
                      {selectedSystem ? (
                        <div className="space-y-3">
                          <h4 className="font-medium">Inspections for {selectedSystem.label}</h4>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-2 border rounded-lg">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span>Rough-in Inspection</span>
                              <Badge variant="outline" className="ml-auto">Pending</Badge>
                            </div>
                            <div className="flex items-center gap-2 p-2 border rounded-lg">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span>Final Inspection</span>
                              <Badge variant="outline" className="ml-auto">Pending</Badge>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Select a system to view required inspections</p>
                      )}
                    </TabsContent>
                    <TabsContent value="asbuilts" className="p-4">
                      {selectedSystem ? (
                        <div className="space-y-3">
                          <h4 className="font-medium">As-Built Documentation for {selectedSystem.label}</h4>
                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">As-Built Status</p>
                              <p className="text-sm text-muted-foreground">Record drawings and documentation</p>
                            </div>
                            <Badge variant={selectedSystemData?.asBuiltStatus === "complete" ? "default" : "outline"}>
                              {selectedSystemData?.asBuiltStatus || "Pending"}
                            </Badge>
                          </div>
                          <Button variant="outline" size="sm" onClick={() => { generateDeliverableMutation.mutate("as_built"); }} disabled={generatingDeliverable === "as_built"} data-testid="button-generate-asbuilt">
                            {generatingDeliverable === "as_built" ? "Generating..." : "Generate As-Built Package"}
                          </Button>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Select a system to view as-built status</p>
                      )}
                    </TabsContent>
                    <TabsContent value="commissioning" className="p-4">
                      {selectedSystem ? (
                        <div className="space-y-3">
                          <h4 className="font-medium">Commissioning for {selectedSystem.label}</h4>
                          <div className="flex items-center justify-between p-3 border rounded-lg">
                            <div>
                              <p className="font-medium">Commissioning Status</p>
                              <p className="text-sm text-muted-foreground">System verification and testing</p>
                            </div>
                            <Badge variant={selectedSystemData?.commissioningStatus === "complete" ? "default" : "outline"}>
                              {selectedSystemData?.commissioningStatus || "Pending"}
                            </Badge>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 p-2 border rounded-lg">
                              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                              <span>Pre-functional Testing</span>
                              <Badge variant="outline" className="ml-auto">Pending</Badge>
                            </div>
                            <div className="flex items-center gap-2 p-2 border rounded-lg">
                              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                              <span>Functional Performance Testing</span>
                              <Badge variant="outline" className="ml-auto">Pending</Badge>
                            </div>
                            <div className="flex items-center gap-2 p-2 border rounded-lg">
                              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                              <span>Owner Training</span>
                              <Badge variant="outline" className="ml-auto">Pending</Badge>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-muted-foreground">Select a system to view commissioning status</p>
                      )}
                    </TabsContent>
                  </Tabs>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="deliverables" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold">Generated Deliverables</h2>
              <p className="text-muted-foreground">Auto-generated documents from project data</p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => askHerbieAutoDocMutation.mutate()}
                disabled={askHerbieAutoDocMutation.isPending}
                data-testid="button-ask-herbie-autodoc"
              >
                <Bot className={`h-4 w-4 mr-2 ${askHerbieAutoDocMutation.isPending ? "animate-pulse" : ""}`} />
                {askHerbieAutoDocMutation.isPending ? "Herbie working..." : "Ask Herbie"}
              </Button>
              <Button 
                onClick={() => generateAllDeliverablesMutation.mutate()} 
                disabled={generateAllDeliverablesMutation.isPending}
                data-testid="button-generate-all"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${generateAllDeliverablesMutation.isPending ? "animate-spin" : ""}`} />
                {generateAllDeliverablesMutation.isPending ? "Generating..." : "Regenerate All"}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { type: "trade_scope", title: "Trade Scopes", icon: FileText, description: "Scope of work documents by trade" },
              { type: "bid_package", title: "Bid Packages", icon: Package, description: "Sub-contractor bid documents" },
              { type: "material_list", title: "Material Lists", icon: FileSpreadsheet, description: "Material quantity exports" },
              { type: "cable_schedule", title: "Cable Schedules", icon: Cable, description: "Low voltage cable documentation" },
              { type: "device_schedule", title: "Device Schedules", icon: Cpu, description: "Device inventory by system" },
              { type: "rack_elevation", title: "Rack Elevations", icon: Building2, description: "Data/AV rack layouts" },
              { type: "as_built", title: "As-Built Sets", icon: FileText, description: "Record drawings" },
              { type: "owner_handoff", title: "Owner Handoff", icon: FileText, description: "Closeout documentation" },
              { type: "smart_building_config", title: "Smart Building Config", icon: Brain, description: "BACnet/controls exports" },
            ].map(del => {
              const herbieBusy = askHerbieDeliverableMutation.isPending && askHerbieDeliverableMutation.variables === del.type;
              return (
                <Card key={del.type} className="hover-elevate">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <del.icon className="h-5 w-5 text-muted-foreground" />
                      <CardTitle className="text-base">{del.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">{del.description}</p>
                    <div className="flex items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="flex-1" 
                        onClick={() => generateDeliverableMutation.mutate(del.type)}
                        disabled={generatingDeliverable === del.type}
                        data-testid={`button-generate-${del.type}`}
                      >
                        {generatingDeliverable === del.type ? "Generating..." : "Generate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Ask Herbie to generate + enrich"
                        onClick={() => askHerbieDeliverableMutation.mutate(del.type)}
                        disabled={herbieBusy}
                        data-testid={`button-ask-herbie-${del.type}`}
                      >
                        <Wand2 className={`h-4 w-4 ${herbieBusy ? "animate-pulse text-primary" : ""}`} />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={() => downloadDeliverable(del.type)}
                        data-testid={`button-download-${del.type}`}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
