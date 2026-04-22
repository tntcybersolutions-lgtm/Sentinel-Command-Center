import { useState, useEffect, useMemo } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RotateCcw, Save, Wand2 } from "lucide-react";
import type { WidgetSize } from "@/dashboard/widgetRegistry";

export interface LayoutWidget {
  widgetKey: string;
  name: string;
  description: string;
  category?: string;
  allowedSizes: WidgetSize[];
  isVisible: boolean;
  orderIndex: number;
  size: string;
}

export interface PresetInfo {
  key: string;
  name: string;
  description: string;
}

interface CustomizeDashboardDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: LayoutWidget[];
  presets: PresetInfo[];
  onSave: (widgets: LayoutWidget[]) => void;
  onApplyPreset: (presetKey: string) => void;
  onReset: () => void;
  isSaving: boolean;
}

const SIZE_LABELS: Record<string, string> = {
  sm: "Small",
  md: "Medium",
  lg: "Full Width",
};

export function CustomizeDashboardDrawer({
  open,
  onOpenChange,
  layout,
  presets,
  onSave,
  onApplyPreset,
  onReset,
  isSaving,
}: CustomizeDashboardDrawerProps) {
  const [localLayout, setLocalLayout] = useState<LayoutWidget[]>(layout);

  useEffect(() => {
    if (open) {
      setLocalLayout(layout);
    }
  }, [open, layout]);

  const grouped = useMemo(() => {
    const map = new Map<string, LayoutWidget[]>();
    for (const w of localLayout) {
      const cat = w.category || "Other";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(w);
    }
    return map;
  }, [localLayout]);

  const toggleVisibility = (widgetKey: string) => {
    setLocalLayout((prev) =>
      prev.map((w) =>
        w.widgetKey === widgetKey ? { ...w, isVisible: !w.isVisible } : w
      )
    );
  };

  const changeSize = (widgetKey: string, size: string) => {
    setLocalLayout((prev) =>
      prev.map((w) =>
        w.widgetKey === widgetKey ? { ...w, size } : w
      )
    );
  };

  const handleSave = () => {
    onSave(localLayout);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Customize Dashboard</SheetTitle>
          <SheetDescription>
            Choose which widgets to display, their sizes, and apply presets.
          </SheetDescription>
        </SheetHeader>

        {presets.length > 0 && (
          <div className="py-3 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Quick Presets</p>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <Button
                  key={p.key}
                  variant="outline"
                  size="sm"
                  onClick={() => onApplyPreset(p.key)}
                  disabled={isSaving}
                  data-testid={`button-preset-${p.key}`}
                >
                  <Wand2 className="h-3.5 w-3.5 mr-1" />
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-5 py-4">
          {Array.from(grouped.entries()).map(([category, widgets]) => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{category}</Badge>
                <div className="flex-1 border-t border-border" />
              </div>
              <div className="space-y-2">
                {widgets.map((widget) => (
                  <div
                    key={widget.widgetKey}
                    className="flex items-start justify-between gap-3 rounded-md border p-3"
                    data-testid={`widget-config-${widget.widgetKey}`}
                  >
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <Checkbox
                        checked={widget.isVisible}
                        onCheckedChange={() => toggleVisibility(widget.widgetKey)}
                        className="mt-0.5"
                        data-testid={`checkbox-widget-${widget.widgetKey}`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{widget.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {widget.description}
                        </p>
                      </div>
                    </div>

                    {widget.allowedSizes.length > 1 && (
                      <Select
                        value={widget.size}
                        onValueChange={(val) => changeSize(widget.widgetKey, val)}
                      >
                        <SelectTrigger
                          className="w-24 shrink-0"
                          data-testid={`select-size-${widget.widgetKey}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {widget.allowedSizes.map((s) => (
                            <SelectItem key={s} value={s}>
                              {SIZE_LABELS[s] || s.toUpperCase()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <SheetFooter className="flex flex-row items-center justify-between gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onReset}
            data-testid="button-reset-layout"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Reset
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            data-testid="button-save-layout"
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
