import { useState, useEffect } from "react";
import { useEntityDrawerStore } from "./drawerStore";
import { routes } from "@/features/row-actions/routes";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Save, X, Upload, Download, Trash2, Paperclip, Loader2 } from "lucide-react";
import type { EntityType } from "@/features/row-actions/types";

function titleFor(type: EntityType) {
  switch (type) {
    case "purchaseOrder": return "Purchase Order";
    case "changeOrder": return "Change Order";
    case "bidProject": return "Bid Project";
    default: return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

type FieldConfig = {
  key: string;
  label: string;
  type: "text" | "textarea" | "number" | "date" | "select" | "readonly" | "badge";
  options?: { value: string; label: string }[];
};

const entityFields: Record<EntityType, FieldConfig[]> = {
  task: [
    { key: "name", label: "Name", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "open", label: "Open" }, { value: "in_progress", label: "In Progress" },
      { value: "completed", label: "Completed" }, { value: "closed", label: "Closed" },
    ]},
    { key: "priority", label: "Priority", type: "select", options: [
      { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
      { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
    ]},
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "createdAt", label: "Created", type: "readonly" },
  ],
  submittal: [
    { key: "submittalNumber", label: "Submittal #", type: "readonly" },
    { key: "name", label: "Name", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "draft", label: "Draft" }, { value: "submitted", label: "Submitted" },
      { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" },
      { value: "closed", label: "Closed" },
    ]},
    { key: "priority", label: "Priority", type: "select", options: [
      { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
      { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
    ]},
    { key: "reference", label: "Reference", type: "text" },
    { key: "createdAt", label: "Created", type: "readonly" },
  ],
  rfi: [
    { key: "rfiNumber", label: "RFI #", type: "readonly" },
    { key: "subject", label: "Subject", type: "text" },
    { key: "question", label: "Question", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "draft", label: "Draft" }, { value: "open", label: "Open" },
      { value: "answered", label: "Answered" }, { value: "closed", label: "Closed" },
    ]},
    { key: "priority", label: "Priority", type: "select", options: [
      { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
      { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
    ]},
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "createdAt", label: "Created", type: "readonly" },
  ],
  purchaseOrder: [
    { key: "poNumber", label: "PO #", type: "readonly" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "draft", label: "Draft" }, { value: "issued", label: "Issued" },
      { value: "approved", label: "Approved" }, { value: "closed", label: "Closed" },
    ]},
    { key: "totalAmount", label: "Total Amount", type: "number" },
    { key: "orderDate", label: "Order Date", type: "date" },
    { key: "createdAt", label: "Created", type: "readonly" },
  ],
  changeOrder: [
    { key: "coNumber", label: "CO #", type: "readonly" },
    { key: "title", label: "Title", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "changeType", label: "Change Type", type: "select", options: [
      { value: "addition", label: "Addition" }, { value: "deduction", label: "Deduction" },
      { value: "substitution", label: "Substitution" },
    ]},
    { key: "status", label: "Status", type: "select", options: [
      { value: "draft", label: "Draft" }, { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" },
      { value: "closed", label: "Closed" },
    ]},
    { key: "amount", label: "Amount", type: "number" },
    { key: "daysImpact", label: "Days Impact", type: "number" },
    { key: "createdAt", label: "Created", type: "readonly" },
  ],
  invoice: [
    { key: "invoiceNumber", label: "Invoice #", type: "readonly" },
    { key: "invoiceType", label: "Type", type: "readonly" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "draft", label: "Draft" }, { value: "submitted", label: "Submitted" },
      { value: "approved", label: "Approved" }, { value: "paid", label: "Paid" },
      { value: "closed", label: "Closed" },
    ]},
    { key: "totalAmount", label: "Total Amount", type: "number" },
    { key: "paidAmount", label: "Paid Amount", type: "number" },
    { key: "invoiceDate", label: "Invoice Date", type: "date" },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "createdAt", label: "Created", type: "readonly" },
  ],
  project: [
    { key: "projectNumber", label: "Project #", type: "readonly" },
    { key: "name", label: "Name", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "planning", label: "Planning" }, { value: "active", label: "Active" },
      { value: "on_hold", label: "On Hold" }, { value: "completed", label: "Completed" },
      { value: "closed", label: "Closed" },
    ]},
    { key: "type", label: "Type", type: "text" },
    { key: "contractType", label: "Contract Type", type: "text" },
    { key: "startDate", label: "Start Date", type: "date" },
    { key: "expectedEndDate", label: "Expected End Date", type: "date" },
    { key: "createdAt", label: "Created", type: "readonly" },
  ],
  bidProject: [
    { key: "id", label: "ID", type: "readonly" },
    { key: "status", label: "Status", type: "select", options: [
      { value: "initiated", label: "Initiated" }, { value: "draft", label: "Draft" },
      { value: "published", label: "Published" }, { value: "quoting", label: "Quoting" },
      { value: "submitted", label: "Submitted" }, { value: "awarded", label: "Awarded" },
      { value: "declined", label: "Declined" }, { value: "closed", label: "Closed" },
    ]},
    { key: "opportunityId", label: "Opportunity", type: "readonly" },
    { key: "createdAt", label: "Created", type: "readonly" },
  ],
};

function AttachmentsSection({ entityType, entityId }: { entityType: EntityType; entityId: string | number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const base = routes[entityType];

  const attachmentsQuery = useQuery<{ attachments: any[] }>({
    queryKey: ["attachments", entityType, entityId],
    queryFn: () => api.get(`${base}/${entityId}/attachments`),
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      for (const file of Array.from(files)) {
        const urlRes = await fetch("/api/uploads/request-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || "application/octet-stream" }),
        });
        if (!urlRes.ok) throw new Error("Failed to get upload URL");
        const { uploadURL, objectPath } = await urlRes.json();

        const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream" } });
        if (!putRes.ok) throw new Error("Failed to upload file to storage");

        await api.post(`${base}/${entityId}/attachments`, {
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          objectPath,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
      toast({ title: "Uploaded", description: "Files uploaded successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string | number) => {
      return api.del(`${base}/${entityId}/attachments/${attachmentId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attachments", entityType, entityId] });
      toast({ title: "Deleted", description: "Attachment removed." });
    },
  });

  const attachments = attachmentsQuery.data?.attachments ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h4 className="text-sm font-medium flex items-center gap-1">
          <Paperclip className="h-4 w-4" /> Attachments ({attachments.length})
        </h4>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = true;
              input.onchange = () => {
                if (input.files && input.files.length > 0) {
                  uploadMutation.mutate(input.files);
                }
              };
              input.click();
            }}
            disabled={uploadMutation.isPending}
            data-testid="button-upload-attachment"
          >
            {uploadMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
            Upload
          </Button>
          {attachments.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                window.open(`${base}/${entityId}/attachments/download-all`, "_blank");
              }}
              data-testid="button-download-all"
            >
              <Download className="h-3 w-3 mr-1" /> Download All
            </Button>
          )}
        </div>
      </div>

      {attachmentsQuery.isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-2">No attachments</p>
      ) : (
        <div className="space-y-1">
          {attachments.map((att: any) => (
            <div key={att.id} className="flex items-center justify-between gap-2 p-2 border rounded-md text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{att.filename}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {att.size ? `${(att.size / 1024).toFixed(1)}KB` : ""}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => window.open(`${base}/${entityId}/attachments/${att.id}/download`, "_blank")}
                  data-testid={`button-download-${att.id}`}
                >
                  <Download className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => deleteMutation.mutate(att.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`button-delete-attachment-${att.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EntityDrawer() {
  const { isOpen, entityType, entityId, mode, close } = useEntityDrawerStore();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [isDirty, setIsDirty] = useState(false);

  const enabled = isOpen && !!entityType && entityId !== null && entityId !== undefined;

  const detailQuery = useQuery({
    queryKey: ["entity", entityType, entityId],
    enabled,
    queryFn: async () => api.get<any>(`${routes[entityType!]}/${entityId}`),
  });

  useEffect(() => {
    if (detailQuery.data) {
      setFormData({ ...detailQuery.data });
      setIsDirty(false);
    }
  }, [detailQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (patch: Record<string, any>) =>
      api.patch<any>(`${routes[entityType!]}/${entityId}`, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["entity", entityType, entityId] });
      await qc.invalidateQueries({ queryKey: [routes[entityType!]] });
      setIsDirty(false);
      toast({ title: "Saved", description: "Changes saved successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const handleFieldChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    if (!entityType) return;
    const fields = entityFields[entityType] || [];
    const editableKeys = fields.filter((f) => f.type !== "readonly" && f.type !== "badge").map((f) => f.key);
    const patch: Record<string, any> = {};
    for (const key of editableKeys) {
      if (formData[key] !== detailQuery.data?.[key]) {
        patch[key] = formData[key];
      }
    }
    if (Object.keys(patch).length > 0) {
      saveMutation.mutate(patch);
    }
  };

  const handleClose = () => {
    setFormData({});
    setIsDirty(false);
    close();
  };

  const fields = entityType ? entityFields[entityType] || [] : [];
  const isEditable = mode === "edit";

  return (
    <Sheet open={isOpen} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <SheetContent side="right" className="w-[520px] sm:w-[640px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between gap-2 pr-8">
            <span>
              {entityType ? titleFor(entityType) : "Detail"}
              {isEditable ? " (Edit)" : ""}
            </span>
            {isEditable && (
              <Badge variant={isDirty ? "default" : "secondary"}>
                {isDirty ? "Unsaved" : "Saved"}
              </Badge>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {detailQuery.isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : detailQuery.isError ? (
            <div className="text-destructive text-sm p-4 border rounded-md">
              {String(detailQuery.error)}
            </div>
          ) : detailQuery.data ? (
            <>
              <div className="space-y-4">
                {fields.map((field) => {
                  const value = formData[field.key];
                  const displayValue = value ?? "";

                  if (field.type === "readonly") {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                        <p className="text-sm" data-testid={`field-${field.key}`}>
                          {field.key === "createdAt" && value
                            ? new Date(value).toLocaleString()
                            : String(displayValue || "—")}
                        </p>
                      </div>
                    );
                  }

                  if (field.type === "badge") {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                        <div><Badge variant="secondary">{String(displayValue || "—")}</Badge></div>
                      </div>
                    );
                  }

                  if (!isEditable) {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                        <p className="text-sm" data-testid={`field-${field.key}`}>
                          {field.type === "select"
                            ? field.options?.find((o) => o.value === displayValue)?.label || String(displayValue || "—")
                            : field.type === "date" && displayValue
                              ? new Date(displayValue).toLocaleDateString()
                              : String(displayValue || "—")}
                        </p>
                      </div>
                    );
                  }

                  if (field.type === "select" && field.options) {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                        <Select
                          value={String(displayValue)}
                          onValueChange={(v) => handleFieldChange(field.key, v)}
                        >
                          <SelectTrigger data-testid={`select-${field.key}`}>
                            <SelectValue />
                          </SelectTrigger>
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
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                        <Textarea
                          value={String(displayValue)}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          data-testid={`textarea-${field.key}`}
                        />
                      </div>
                    );
                  }

                  if (field.type === "number") {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                        <Input
                          type="number"
                          value={displayValue}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          data-testid={`input-${field.key}`}
                        />
                      </div>
                    );
                  }

                  if (field.type === "date") {
                    return (
                      <div key={field.key} className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                        <Input
                          type="date"
                          value={displayValue ? String(displayValue).split("T")[0] : ""}
                          onChange={(e) => handleFieldChange(field.key, e.target.value)}
                          data-testid={`input-${field.key}`}
                        />
                      </div>
                    );
                  }

                  return (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">{field.label}</label>
                      <Input
                        value={String(displayValue)}
                        onChange={(e) => handleFieldChange(field.key, e.target.value)}
                        data-testid={`input-${field.key}`}
                      />
                    </div>
                  );
                })}
              </div>

              {isEditable && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={handleSave}
                    disabled={!isDirty || saveMutation.isPending}
                    data-testid="button-save-entity"
                  >
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save
                  </Button>
                  <Button variant="outline" onClick={handleClose} data-testid="button-cancel-edit">
                    <X className="h-4 w-4 mr-1" /> Cancel
                  </Button>
                </div>
              )}

              <Separator />

              {entityType && entityId != null && (
                <AttachmentsSection entityType={entityType} entityId={entityId} />
              )}
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
