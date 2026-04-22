import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Point {
  x: number;
  y: number;
}

interface ScaleCalibrationProps {
  isOpen: boolean;
  onClose: () => void;
  onCalibrate: (pixelsPerUnit: number, unit: string) => void;
  point1?: Point;
  point2?: Point;
}

const UNITS = [
  { value: "ft", label: "Feet" },
  { value: "in", label: "Inches" },
  { value: "m", label: "Meters" },
  { value: "cm", label: "Centimeters" },
];

export function ScaleCalibration({
  isOpen,
  onClose,
  onCalibrate,
  point1,
  point2,
}: ScaleCalibrationProps) {
  const [knownLength, setKnownLength] = useState("");
  const [unit, setUnit] = useState("ft");

  const pixelDistance = point1 && point2
    ? Math.sqrt(Math.pow(point2.x - point1.x, 2) + Math.pow(point2.y - point1.y, 2))
    : 0;

  const handleCalibrate = () => {
    const length = parseFloat(knownLength);
    if (length > 0 && pixelDistance > 0) {
      const pixelsPerUnit = pixelDistance / length;
      onCalibrate(pixelsPerUnit, unit);
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Scale Calibration</DialogTitle>
          <DialogDescription>
            Enter the real-world length of the line you drew to calibrate the scale
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          {pixelDistance > 0 ? (
            <>
              <div className="p-3 rounded-lg bg-muted text-sm">
                Measured line: {pixelDistance.toFixed(0)} pixels
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Known Length</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={knownLength}
                    onChange={e => setKnownLength(e.target.value)}
                    placeholder="e.g., 10"
                    data-testid="input-known-length"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Unit</Label>
                  <Select value={unit} onValueChange={setUnit}>
                    <SelectTrigger data-testid="select-calibration-unit">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {knownLength && parseFloat(knownLength) > 0 && (
                <div className="p-3 rounded-lg bg-primary/10 text-sm">
                  Scale: 1 {unit} = {(pixelDistance / parseFloat(knownLength)).toFixed(2)} pixels
                </div>
              )}
            </>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              Draw a line on a known dimension to begin calibration
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleCalibrate}
            disabled={!knownLength || parseFloat(knownLength) <= 0 || pixelDistance <= 0}
            data-testid="button-apply-calibration"
          >
            Apply Scale
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
