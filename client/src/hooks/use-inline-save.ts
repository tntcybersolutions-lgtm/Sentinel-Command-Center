import { useState, useCallback, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface UseInlineSaveOptions {
  endpoint: string;
  field: string;
  invalidateKeys?: string[][];
  onSuccess?: (newValue: any) => void;
}

export function useInlineSave(options: UseInlineSaveOptions) {
  const { endpoint, field, invalidateKeys, onSuccess } = options;
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previousValueRef = useRef<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const startEditing = useCallback((currentValue: any) => {
    previousValueRef.current = currentValue;
    setIsEditing(true);
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    setIsEditing(false);
    setError(null);
  }, []);

  const save = useCallback(async (newValue: any) => {
    if (newValue === previousValueRef.current) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await apiRequest("PATCH", endpoint, {
        [field]: newValue,
      });

      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }

      onSuccess?.(newValue);
      setIsEditing(false);
      const label = field.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
      toast({ title: "Saved", description: `${label} updated successfully.` });
    } catch (err: any) {
      const msg = err.message || "Save failed";
      setError(msg);
      toast({ title: "Save Failed", description: msg, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [endpoint, field, invalidateKeys, onSuccess, queryClient, toast]);

  return {
    isEditing,
    isSaving,
    error,
    previousValue: previousValueRef.current,
    startEditing,
    cancel,
    save,
  };
}
