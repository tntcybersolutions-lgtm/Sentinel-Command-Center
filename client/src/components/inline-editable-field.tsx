import { useState, useRef, useEffect, useCallback } from "react";
import { useInlineSave } from "@/hooks/use-inline-save";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Check, X } from "lucide-react";

export type InlineFieldType = "text" | "currency" | "date" | "select" | "textarea" | "number";

interface SelectOption {
  value: string;
  label: string;
}

interface InlineEditableFieldProps {
  value: any;
  fieldType: InlineFieldType;
  endpoint: string;
  field: string;
  invalidateKeys?: string[][];
  onSuccess?: (newValue: any) => void;
  selectOptions?: SelectOption[];
  placeholder?: string;
  displayFormatter?: (value: any) => string;
  className?: string;
  "data-testid"?: string;
}

export function InlineEditableField({
  value,
  fieldType,
  endpoint,
  field,
  invalidateKeys,
  onSuccess,
  selectOptions = [],
  placeholder = "Click to edit",
  displayFormatter,
  className = "",
  ...props
}: InlineEditableFieldProps) {
  const testId = props["data-testid"] || `inline-edit-${field}`;
  const [localValue, setLocalValue] = useState(value ?? "");
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const { isEditing, isSaving, error, startEditing, cancel, save } = useInlineSave({
    endpoint,
    field,
    invalidateKeys,
    onSuccess,
  });

  useEffect(() => {
    setLocalValue(value ?? "");
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [isEditing]);

  const handleStartEdit = useCallback(() => {
    if (isSaving) return;
    setLocalValue(value ?? "");
    startEditing(value);
  }, [value, isSaving, startEditing]);

  const handleSave = useCallback(() => {
    let saveValue = localValue;
    if (fieldType === "currency") {
      saveValue = parseFloat(String(localValue).replace(/[^0-9.-]/g, "")) || 0;
    }
    if (fieldType === "number") {
      saveValue = parseFloat(String(localValue)) || 0;
    }
    save(saveValue);
  }, [localValue, fieldType, save]);

  const handleCancel = useCallback(() => {
    setLocalValue(value ?? "");
    cancel();
  }, [value, cancel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && fieldType !== "textarea") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  }, [fieldType, handleSave, handleCancel]);

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (containerRef.current?.contains(e.relatedTarget as Node)) return;
    handleSave();
  }, [handleSave]);

  const formatDisplay = useCallback((val: any): string => {
    if (displayFormatter) return displayFormatter(val);
    if (val === null || val === undefined || val === "") return placeholder;
    if (fieldType === "currency") {
      const num = typeof val === "number" ? val : parseFloat(val);
      if (isNaN(num)) return placeholder;
      return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(num);
    }
    if (fieldType === "date") {
      try {
        return new Date(val).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
      } catch { return String(val); }
    }
    if (fieldType === "select") {
      const opt = selectOptions.find(o => o.value === val);
      return opt?.label || String(val);
    }
    if (fieldType === "number") {
      return String(val);
    }
    return String(val);
  }, [displayFormatter, placeholder, fieldType, selectOptions]);

  if (!isEditing) {
    return (
      <div
        ref={containerRef}
        className={`group inline-flex items-center gap-1 cursor-pointer rounded-md px-1.5 py-0.5 -mx-1.5 hover-elevate ${className}`}
        onClick={handleStartEdit}
        data-testid={testId}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleStartEdit(); }}
      >
        <span className={`${!value && value !== 0 ? "text-muted-foreground italic" : ""}`}>
          {formatDisplay(value)}
        </span>
        <Pencil className="h-3 w-3 text-muted-foreground invisible group-hover:visible shrink-0" />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`inline-flex items-center gap-1 ${className}`} data-testid={testId}>
      {fieldType === "select" ? (
        <Select
          value={String(localValue)}
          onValueChange={(v) => {
            setLocalValue(v);
            save(v);
          }}
        >
          <SelectTrigger className="text-sm min-w-[120px]" data-testid={`${testId}-select`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {selectOptions.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : fieldType === "textarea" ? (
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); handleCancel(); }
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave(); }
          }}
          onBlur={handleBlur}
          className="text-sm min-w-[200px]"
          data-testid={`${testId}-textarea`}
        />
      ) : (
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type={fieldType === "date" ? "date" : (fieldType === "currency" || fieldType === "number") ? "number" : "text"}
          value={fieldType === "date" && localValue ? (() => { const d = new Date(localValue); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; })() : localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          step={fieldType === "currency" ? "0.01" : fieldType === "number" ? "1" : undefined}
          min={fieldType === "number" ? "0" : undefined}
          max={fieldType === "number" ? "100" : undefined}
          className="text-sm min-w-[120px]"
          data-testid={`${testId}-input`}
        />
      )}
      {isSaving ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" data-testid="inline-edit-saving" />
      ) : fieldType !== "select" ? (
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" onClick={handleSave} data-testid="inline-edit-save">
            <Check className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" onClick={handleCancel} data-testid="inline-edit-cancel">
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : null}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
