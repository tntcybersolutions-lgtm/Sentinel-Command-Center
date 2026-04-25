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
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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

const IMPORT_TEMPLATES: Record<string, Array<{ name: string; categoryName: string; quantity: number; unit: string; unitCost: number }>> = {
  architectural: [
    { name: "Drywall", categoryName: "Drywall", quantity: 8500, unit: "SF", unitCost: 2.50 },
    { name: "Doors & Hardware", categoryName: "Doors & Hardware", quantity: 24, unit: "EA", unitCost: 425.00 },
    { name: "Flooring", categoryName: "Flooring", quantity: 6200, unit: "SF", unitCost: 4.75 },
  ],
  structural: [
    { name: "Concrete", categoryName: "Concrete", quantity: 150, unit: "CY", unitCost: 180.00 },
    { name: "Framing", categoryName: "Framing", quantity: 2500, unit: "LF", unitCost: 8.00 },
  ],
  electrical: [
    { name: "Electrical Devices", categoryName: "Electrical Devices", quantity: 85, unit: "EA", unitCost: 45.00 },
    { name: "Cabling", categoryName: "Cabling", quantity: 1800, unit: "LF", unitCost: 3.25 },
  ],
  mep: [
    { name: "Electrical Devices", categoryName: "Electrical Devices", quantity: 60, unit: "EA", unitCost: 45.00 },
    { name: "Plumbing Fixtures", categoryName: "Plumbing Fixtures", quantity: 18, unit: "EA", unitCost: 380.00 },
  ],
  low_voltage: [
    { name: "Low-Voltage Devices", categoryName: "Low-Voltage Devices", quantity: 42, unit: "EA", unitCost: 95.00 },
    { name: "Cabling", categoryName: "Cabling", quantity: 3200, unit: "LF", unitCost: 1.85 },
  ],
  fire_life_safety: [
    { name: "Fire Devices", categoryName: "Fire Devices", quantity: 36, unit: "EA", unitCost: 125.00 },
  ],
  default: [
    { name: "Generic Item", categoryName: "Concrete", quantity: 100, unit: "EA", unitCost: 25.00 },
  ],
};

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

export default function DesignSystems() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [location] = useLocation();
  
  const getTabFromPath = (path: string): string => {
    if (path === "/blueprint-hub") return "blueprint-hub";
    if (path === "/takeoff-engine") return "takeoff";
    if (path === "/systems-matrix") return "systems";
    if (path === "/auto-build") return "overview";
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
  const [importSheetId, setImportSheetId] = useState<string>("");
  const [isAddSystemOpen, setIsAddSystemOpen] = useState(false);
  const [isEditTakeoffOpen, setIsEditTakeoffOpen] = useState(false);
  const [isEditSystemOpen, setIsEditSystemOpen] = useState(false);
  const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
  const [editingTakeoff, setEditingTakeoff] = useState<TakeoffQuantity | null>(null);
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
      toast({ title: "Systems synced", description: "All system statuses refreshed" });
    },
  });

  const updateTakeoffMutation = useMutation({
    mutationFn: async (data: { id: string; categoryId: string; room: string; floor: string; quantity: string; unit: string; unitCost: string }) => {
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

  const importTakeoffFromSheetMutation = useMutation({
    mutationFn: async (sheetId: string) => {
      const sheet = drawingSheets.find(s => s.id === sheetId);
      if (!sheet) throw new Error("Drawing sheet not found");
      const templates = IMPORT_TEMPLATES[sheet.discipline] || IMPORT_TEMPLATES.default;

      const skipped: string[] = [];
      const failed: Array<{ name: string; error: string }> = [];
      let created = 0;

      for (const t of templates) {
        const cat = takeoffCategoriesData.find(c => c.name === t.categoryName);
        if (!cat) {
          skipped.push(t.categoryName);
          continue;
        }
        try {
          await apiRequest("POST", "/api/takeoff-quantities", {
            categoryId: cat.id,
            sheetId: sheet.id,
            room: `${sheet.sheetNumber} — ${sheet.sheetTitle}`,
            floor: "",
            quantity: t.quantity.toString(),
            unit: t.unit,
            unitCost: t.unitCost.toFixed(2),
            extendedCost: (t.quantity * t.unitCost).toFixed(2),
          });
          created++;
        } catch (err) {
          failed.push({ name: t.name, error: err instanceof Error ? err.message : String(err) });
        }
      }

      // Refresh the list whenever ANY rows were written, even on partial failure
      if (created > 0) {
        await queryClient.invalidateQueries({ queryKey: ["/api/takeoff-quantities"] });
      }
      return { created, skipped, failed, sheet };
    },
    onSuccess: ({ created, skipped, failed, sheet }) => {
      // Treat zero-created as an error so the user knows nothing actually happened
      if (created === 0) {
        const reason = skipped.length > 0
          ? `No matching takeoff categories found for ${sheet.discipline}. Missing: ${skipped.join(", ")}.`
          : failed.length > 0
            ? `All ${failed.length} item(s) failed: ${failed[0].error}`
            : "No items to import.";
        toast({ title: "Nothing imported", description: reason, variant: "destructive" });
        return;
      }

      const parts: string[] = [`Created ${created} takeoff item${created === 1 ? "" : "s"} from ${sheet.sheetNumber}`];
      if (skipped.length > 0) parts.push(`skipped ${skipped.length} (no matching category)`);
      if (failed.length > 0) parts.push(`${failed.length} failed`);

      const isPartial = skipped.length > 0 || failed.length > 0;
      toast({
        title: isPartial ? "Import partially complete" : "Import complete",
        description: parts.join(", ") + ".",
        variant: isPartial ? "destructive" : "default",
      });
      setIsImportTakeoffOpen(false);
      setImportSheetId("");
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
      const titles: Record<string, string> = {
        trade_scope: "Trade Scopes",
        bid_package: "Bid Packages",
        material_list: "Material Lists",
        cable_schedule: "Cable Schedules",
        device_schedule: "Device Schedules",
        rack_elevation: "Rack Elevations",
        as_built: "As-Built Sets",
        owner_handoff: "Owner Handoff",
        smart_config: "Smart Building Config",
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
      const types = ["trade_scope", "bid_package", "material_list", "cable_schedule", "device_schedule", "rack_elevation", "as_built", "owner_handoff", "smart_config"];
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
      const headers = ["Category", "Trade", "Room", "Floor", "Quantity", "Unit", "Unit Cost", "Extended Cost"];
      const rows = takeoffQuantities.map(tq => {
        const cat = takeoffCategories.find(c => c.id === tq.categoryId);
        const qty = Number(tq.quantity ?? 0);
        const unitCost = Number(tq.unitCost ?? 0);
        const extended = tq.extendedCost != null ? Number(tq.extendedCost) : qty * unitCost;
        return [
          cat?.name || "Unknown",
          cat?.trade || "Unknown",
          tq.room || "",
          tq.floor || "",
          qty.toFixed(2),
          tq.unit,
          unitCost.toFixed(2),
          extended.toFixed(2),
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
      smart_config: "Smart Building Config",
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

  const filteredTakeoffs = takeoffFilter === "all" 
    ? takeoffQuantities 
    : takeoffQuantities.filter(t => t.categoryId === takeoffFilter);

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
          <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-upload-plans">
                <Upload className="h-4 w-4 mr-2" />
                Upload Plans
              </Button>
            </DialogTrigger>
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
                uploadSheetMutation.mutate({
                  sheetNumber: formData.get("sheetNumber") as string,
                  sheetTitle: formData.get("sheetTitle") as string,
                  discipline: formData.get("discipline") as string,
                  fileType: formData.get("fileType") as string,
                  storageKey: uploadedStorageKey || undefined,
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
                <Button variant="outline" className="w-full justify-start" onClick={() => navigate("/takeoff-engine")} data-testid="button-quick-takeoff">
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
              <Dialog open={isNewTakeoffOpen} onOpenChange={setIsNewTakeoffOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={takeoffCategories.length === 0} data-testid="button-new-takeoff">
                    <Plus className="h-4 w-4 mr-2" />
                    {takeoffCategories.length === 0 ? "Loading Categories..." : "New Takeoff Item"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Takeoff Quantity</DialogTitle>
                    <DialogDescription>Record a new quantity measurement</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const formData = new FormData(e.currentTarget);
                    createTakeoffQuantityMutation.mutate({
                      categoryId: formData.get("categoryId") as string,
                      room: formData.get("room") as string,
                      floor: formData.get("floor") as string,
                      quantity: formData.get("quantity") as string,
                      unit: formData.get("unit") as string,
                      unitCost: formData.get("unitCost") as string,
                    });
                  }} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="categoryId">Category</Label>
                        <Select name="categoryId" required>
                          <SelectTrigger data-testid="select-takeoff-category">
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
                        <Label htmlFor="unit">Unit</Label>
                        <Select name="unit" defaultValue="EA">
                          <SelectTrigger data-testid="select-takeoff-unit">
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
                        <Label htmlFor="room">Room/Area</Label>
                        <Input id="room" name="room" placeholder="e.g. Room 101" data-testid="input-takeoff-room" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="floor">Floor</Label>
                        <Input id="floor" name="floor" placeholder="e.g. Floor 1" data-testid="input-takeoff-floor" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="quantity">Quantity</Label>
                        <Input id="quantity" name="quantity" type="number" step="0.01" required placeholder="0.00" data-testid="input-takeoff-quantity" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="unitCost">Unit Cost ($)</Label>
                        <Input id="unitCost" name="unitCost" type="number" step="0.01" placeholder="0.00" data-testid="input-takeoff-cost" />
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={createTakeoffQuantityMutation.isPending} data-testid="button-submit-takeoff">
                      {createTakeoffQuantityMutation.isPending ? "Adding..." : "Add Takeoff Item"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
              <Button variant="outline" onClick={() => { setImportSheetId(""); setIsImportTakeoffOpen(true); }} data-testid="button-import-takeoff">
                <Upload className="h-4 w-4 mr-2" />
                Import from Plans
              </Button>
              <Dialog open={isImportTakeoffOpen} onOpenChange={setIsImportTakeoffOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import Takeoff from Plans</DialogTitle>
                    <DialogDescription>
                      Select a drawing sheet to auto-populate takeoff quantities based on its discipline.
                    </DialogDescription>
                  </DialogHeader>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!importSheetId) {
                        toast({ title: "No sheet selected", description: "Choose a drawing sheet to import from.", variant: "destructive" });
                        return;
                      }
                      importTakeoffFromSheetMutation.mutate(importSheetId);
                    }}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="import-sheet">Drawing Sheet</Label>
                      <Select value={importSheetId} onValueChange={setImportSheetId}>
                        <SelectTrigger id="import-sheet" data-testid="select-import-sheet">
                          <SelectValue placeholder="Select a drawing sheet..." />
                        </SelectTrigger>
                        <SelectContent>
                          {drawingSheets.length === 0 && (
                            <div className="px-2 py-1.5 text-sm text-muted-foreground">
                              No sheets available — upload some first.
                            </div>
                          )}
                          {drawingSheets.map((s) => (
                            <SelectItem key={s.id} value={s.id} data-testid={`option-import-sheet-${s.id}`}>
                              {s.sheetNumber} — {s.sheetTitle} ({s.discipline})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {importSheetId && (() => {
                      const selected = drawingSheets.find(s => s.id === importSheetId);
                      const preview = selected ? IMPORT_TEMPLATES[selected.discipline] || IMPORT_TEMPLATES.default : [];
                      return (
                        <div className="rounded-md border bg-muted/30 p-3 space-y-1.5" data-testid="import-preview">
                          <div className="text-sm font-medium">Will create {preview.length} takeoff item{preview.length === 1 ? "" : "s"}:</div>
                          {preview.map((p, i) => (
                            <div key={i} className="text-xs text-muted-foreground">
                              • {p.name} — {p.quantity} {p.unit} @ ${p.unitCost.toFixed(2)} = ${(p.quantity * p.unitCost).toLocaleString()}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={!importSheetId || importTakeoffFromSheetMutation.isPending}
                      data-testid="button-confirm-import-takeoff"
                    >
                      {importTakeoffFromSheetMutation.isPending ? "Importing..." : "Auto-Populate Quantities"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
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
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            {filteredSummary.map(cat => (
              <Card key={cat.id} className="hover-elevate cursor-pointer" onClick={() => setTakeoffFilter(cat.id)} data-testid={`card-takeoff-${cat.id}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">{cat.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{cat.totalQty.toLocaleString()} {cat.unit}</div>
                  <p className="text-sm text-muted-foreground">{cat.count} line items</p>
                  {cat.totalCost > 0 && (
                    <p className="text-sm font-medium mt-1">${cat.totalCost.toLocaleString()}</p>
                  )}
                </CardContent>
              </Card>
            ))}
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
                      <th className="text-left p-3 font-medium">Category</th>
                      <th className="text-left p-3 font-medium">Trade</th>
                      <th className="text-right p-3 font-medium">Quantity</th>
                      <th className="text-left p-3 font-medium">Unit</th>
                      <th className="text-right p-3 font-medium">Unit Cost</th>
                      <th className="text-right p-3 font-medium">Extended</th>
                      <th className="text-right p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTakeoffs.length > 0 ? filteredTakeoffs.map(item => {
                      const cat = takeoffCategories.find(c => c.id === item.categoryId);
                      return (
                        <tr key={item.id} className="border-t">
                          <td className="p-3 font-medium">{cat?.name || "Unknown"}</td>
                          <td className="p-3">
                            <Badge variant="outline">{cat?.trade || "Unknown"}</Badge>
                          </td>
                          <td className="p-3 text-right">{parseFloat(item.quantity).toLocaleString()}</td>
                          <td className="p-3">{item.unit}</td>
                          <td className="p-3 text-right">{item.unitCost ? `$${item.unitCost}` : "-"}</td>
                          <td className="p-3 text-right font-medium">
                            {item.extendedCost ? `$${parseFloat(item.extendedCost).toLocaleString()}` : "-"}
                          </td>
                          <td className="p-3 text-right">
                            <Button size="sm" variant="ghost" onClick={() => { setEditingTakeoff(item); setIsEditTakeoffOpen(true); }} data-testid={`button-edit-takeoff-${item.id}`}>
                              Edit
                            </Button>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr className="border-t">
                        <td colSpan={7} className="p-6 text-center text-muted-foreground">
                          No takeoff items yet. Click "New Takeoff Item" to add quantities.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="systems" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Dialog open={isAddSystemOpen} onOpenChange={setIsAddSystemOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="button-add-system">
                    <Plus className="h-4 w-4 mr-2" />
                    Add System
                  </Button>
                </DialogTrigger>
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
                                    return (
                                      <tr key={item.id} className="border-t">
                                        <td className="p-2">{cat?.name || "Unknown"}</td>
                                        <td className="p-2 text-right">{item.quantity}</td>
                                        <td className="p-2">{item.unit}</td>
                                        <td className="p-2 text-right">{item.extendedCost ? `$${item.extendedCost}` : "-"}</td>
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
                      {selectedSystem ? (
                        <div className="space-y-3">
                          <h4 className="font-medium">Devices for {selectedSystem.label}</h4>
                          <p className="text-muted-foreground text-sm">Device inventory and installation tracking for {selectedSystem.label} system</p>
                          <Button variant="outline" size="sm" onClick={() => { generateDeliverableMutation.mutate("device_schedule"); }} disabled={generatingDeliverable === "device_schedule"} data-testid="button-generate-device-schedule">
                            {generatingDeliverable === "device_schedule" ? "Generating..." : "Generate Device Schedule"}
                          </Button>
                        </div>
                      ) : (
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
            <Button 
              onClick={() => generateAllDeliverablesMutation.mutate()} 
              disabled={generateAllDeliverablesMutation.isPending}
              data-testid="button-generate-all"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${generateAllDeliverablesMutation.isPending ? "animate-spin" : ""}`} />
              {generateAllDeliverablesMutation.isPending ? "Generating..." : "Regenerate All"}
            </Button>
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
              { type: "smart_config", title: "Smart Building Config", icon: Brain, description: "BACnet/controls exports" },
            ].map(del => (
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
                      onClick={() => downloadDeliverable(del.type)}
                      data-testid={`button-download-${del.type}`}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
