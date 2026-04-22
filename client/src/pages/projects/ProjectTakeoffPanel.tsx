import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Plus, Ruler } from "lucide-react";

async function fetchJson(url: string) {
  const res = await fetch(url, { credentials: "include" });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

export default function ProjectTakeoffPanel({ projectId, project }: { projectId: string; project: any }) {
  const bidProjectId = project?.bidProjectId;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("Each");
  const [unitCost, setUnitCost] = useState("");
  const [category, setCategory] = useState("General");

  const listQ = useQuery<any[]>({
    queryKey: ["/api/takeoffs", { bidProjectId }],
    queryFn: () => bidProjectId
      ? fetchJson(`/api/takeoffs?bidProjectId=${bidProjectId}`)
      : Promise.resolve([]),
    enabled: Boolean(bidProjectId),
  });

  const createM = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const qty = parseFloat(quantity);
      if (isNaN(qty) || qty <= 0) throw new Error("Valid quantity required");
      return apiRequest("POST", "/api/takeoffs", {
        bidProjectId,
        name: name.trim(),
        quantity: qty,
        unit: unit || "Each",
        unitCost: parseFloat(unitCost) || 0,
        category: category || "General",
      });
    },
    onSuccess: async () => {
      setOpen(false);
      setName("");
      setQuantity("");
      setUnitCost("");
      await queryClient.invalidateQueries({ queryKey: ["/api/takeoffs", { bidProjectId }] });
    },
  });

  if (!bidProjectId) {
    return (
      <div className="p-8 text-center" data-testid="takeoff-no-bid">
        <Ruler className="mx-auto h-12 w-12 text-muted-foreground/50 mb-3" />
        <p className="font-medium text-muted-foreground">No bid project linked</p>
        <p className="text-sm text-muted-foreground mt-1">
          Link a bid project to this project to manage takeoff items.
        </p>
      </div>
    );
  }

  const items = listQ.data ?? [];
  const totalCost = items.reduce((sum: number, item: any) => {
    return sum + (parseFloat(item.quantity) * parseFloat(item.unitCost || "0"));
  }, 0);

  return (
    <div className="space-y-4" data-testid="module-page-takeoff">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" data-testid="module-title">Takeoff</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} items &middot; Total: ${totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <Button onClick={() => setOpen(true)} data-testid="button-create-takeoff">
          <Plus className="h-4 w-4 mr-1" />
          Add Item
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {listQ.isLoading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium text-muted-foreground">No takeoff items yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Add takeoff line items to quantify materials and labor.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="module-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Qty</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unit</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Unit Cost</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item: any, idx: number) => {
                  const lineTotal = parseFloat(item.quantity) * parseFloat(item.unitCost || "0");
                  return (
                    <tr key={item.id ?? idx} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-${item.id ?? idx}`}>
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{item.category}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{parseFloat(item.quantity).toLocaleString()}</td>
                      <td className="px-4 py-3">{item.unit}</td>
                      <td className="px-4 py-3 text-right tabular-nums">${parseFloat(item.unitCost || "0").toFixed(2)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">${lineTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="dialog-create-takeoff">
          <DialogHeader>
            <DialogTitle>Add Takeoff Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Item name"
              data-testid="input-takeoff-name"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Quantity"
                type="number"
                data-testid="input-takeoff-qty"
              />
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="Unit (Each, SF, LF...)"
                data-testid="input-takeoff-unit"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="Unit cost"
                type="number"
                data-testid="input-takeoff-cost"
              />
              <Input
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category"
                data-testid="input-takeoff-category"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)} data-testid="button-cancel-takeoff">
                Cancel
              </Button>
              <Button
                onClick={() => createM.mutate()}
                disabled={createM.isPending || !name.trim() || !quantity}
                data-testid="button-confirm-takeoff"
              >
                {createM.isPending ? "Adding\u2026" : "Add Item"}
              </Button>
            </div>
            {createM.isError && (
              <p className="text-sm text-destructive" data-testid="takeoff-error">
                {(createM.error as any)?.message ?? "Failed to add item"}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
