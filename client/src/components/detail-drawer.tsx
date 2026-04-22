import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Save, X, Download, Upload, Loader2, Link2, Activity } from "lucide-react";

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "select" | "date" | "number" | "readonly" | "badge";
  options?: { value: string; label: string }[];
  badgeVariant?: (val: string) => "default" | "secondary" | "destructive" | "outline";
}

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  record: Record<string, any> | null;
  fields: FieldDef[];
  patchEndpoint: string;
  queryKey: string[];
  entityType?: string;
}

export function DetailDrawer({
  open,
  onOpenChange,
  title,
  record,
  fields,
  patchEndpoint,
  queryKey,
  entityType,
}: DetailDrawerProps) {
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const patchMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const res = await apiRequest("PATCH", patchEndpoint, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast({ title: "Saved", description: "Record updated successfully." });
      setEditing(false);
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to save.", variant: "destructive" });
    },
  });

  const startEditing = () => {
    if (!record) return;
    const initial: Record<string, any> = {};
    fields.forEach((f) => {
      if (f.type !== "readonly" && f.type !== "badge") {
        initial[f.key] = record[f.key] ?? "";
      }
    });
    setFormData(initial);
    setEditing(true);
  };

  const handleSave = () => {
    patchMutation.mutate(formData);
  };

  const handleCancel = () => {
    setEditing(false);
    setFormData({});
  };

  const renderField = (field: FieldDef) => {
    const value = editing ? formData[field.key] : record?.[field.key];

    if (field.type === "readonly") {
      return (
        <div key={field.key} className="space-y-1" data-testid={`field-${field.key}`}>
          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
          <p className="text-sm">{value ?? "-"}</p>
        </div>
      );
    }

    if (field.type === "badge") {
      const variant = field.badgeVariant ? field.badgeVariant(String(value || "")) : "secondary";
      return (
        <div key={field.key} className="space-y-1" data-testid={`field-${field.key}`}>
          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
          <div><Badge variant={variant}>{String(value || "-")}</Badge></div>
        </div>
      );
    }

    if (!editing) {
      return (
        <div key={field.key} className="space-y-1" data-testid={`field-${field.key}`}>
          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
          <p className="text-sm">{field.type === "date" && value ? new Date(value).toLocaleDateString() : (value ?? "-")}</p>
        </div>
      );
    }

    if (field.type === "select" && field.options) {
      return (
        <div key={field.key} className="space-y-1" data-testid={`field-${field.key}`}>
          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
          <Select
            value={String(formData[field.key] || "")}
            onValueChange={(v) => setFormData({ ...formData, [field.key]: v })}
          >
            <SelectTrigger data-testid={`select-${field.key}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              {field.options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <div key={field.key} className="space-y-1" data-testid={`field-${field.key}`}>
          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
          <Textarea
            value={String(formData[field.key] || "")}
            onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
            data-testid={`input-${field.key}`}
          />
        </div>
      );
    }

    if (field.type === "date") {
      return (
        <div key={field.key} className="space-y-1" data-testid={`field-${field.key}`}>
          <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
          <Input
            type="date"
            value={formData[field.key] ? String(formData[field.key]).split("T")[0] : ""}
            onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
            data-testid={`input-${field.key}`}
          />
        </div>
      );
    }

    return (
      <div key={field.key} className="space-y-1" data-testid={`field-${field.key}`}>
        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
        <Input
          type={field.type === "number" ? "number" : "text"}
          value={String(formData[field.key] ?? "")}
          onChange={(e) => setFormData({ ...formData, [field.key]: field.type === "number" ? e.target.value : e.target.value })}
          data-testid={`input-${field.key}`}
        />
      </div>
    );
  };

  if (!record) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="detail-drawer">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2 flex-wrap pr-8">
            <span data-testid="drawer-title">{title}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {!editing ? (
              <Button size="sm" variant="outline" onClick={startEditing} data-testid="button-edit">
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            ) : (
              <>
                <Button size="sm" onClick={handleSave} disabled={patchMutation.isPending} data-testid="button-save">
                  {patchMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />}
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} data-testid="button-cancel">
                  <X className="h-3 w-3 mr-1" /> Cancel
                </Button>
              </>
            )}
          </div>
          <Separator />
          <div className="space-y-3">
            {fields.map(renderField)}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
