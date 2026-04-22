import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Ruler, Square, Circle, Hash } from "lucide-react";

interface Measurement {
  id: string;
  type: "distance" | "area" | "perimeter" | "count";
  value: number;
  unit: string;
  label?: string;
}

interface MeasurementPanelProps {
  measurements: Measurement[];
  onDelete: (id: string) => void;
  onClear: () => void;
  scale?: string;
}

const TYPE_ICONS = {
  distance: Ruler,
  area: Square,
  perimeter: Circle,
  count: Hash,
};

const TYPE_LABELS = {
  distance: "Distance",
  area: "Area",
  perimeter: "Perimeter",
  count: "Count",
};

export function MeasurementPanel({
  measurements,
  onDelete,
  onClear,
  scale,
}: MeasurementPanelProps) {
  const totals = measurements.reduce((acc, m) => {
    const key = `${m.type}_${m.unit}`;
    acc[key] = (acc[key] || 0) + m.value;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card className="w-72">
      <CardHeader className="py-3 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">Measurements</CardTitle>
        {measurements.length > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClear}
            className="h-7 text-xs"
            data-testid="button-clear-measurements"
          >
            Clear All
          </Button>
        )}
      </CardHeader>
      <CardContent className="py-0 pb-3 space-y-2">
        {scale && (
          <div className="text-xs text-muted-foreground mb-2">
            Scale: {scale}
          </div>
        )}
        
        {measurements.length === 0 ? (
          <div className="text-center text-muted-foreground py-4 text-sm">
            No measurements yet. Use the measure tools to add.
          </div>
        ) : (
          <>
            <div className="space-y-1 max-h-48 overflow-auto">
              {measurements.map(m => {
                const Icon = TYPE_ICONS[m.type];
                return (
                  <div 
                    key={m.id}
                    className="flex items-center justify-between p-2 rounded bg-muted/50 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="w-3 h-3 text-muted-foreground" />
                      <span>{m.label || TYPE_LABELS[m.type]}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {m.value.toFixed(2)} {m.unit}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => onDelete(m.id)}
                        data-testid={`button-delete-measurement-${m.id}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {Object.keys(totals).length > 0 && (
              <div className="pt-2 border-t">
                <div className="text-xs font-medium mb-1">Totals</div>
                <div className="space-y-1">
                  {Object.entries(totals).map(([key, value]) => {
                    const [type, unit] = key.split("_");
                    return (
                      <div key={key} className="flex justify-between text-sm">
                        <span className="text-muted-foreground capitalize">{type}</span>
                        <span className="font-mono">{value.toFixed(2)} {unit}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
