import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  Package,
  AlertTriangle,
  Truck,
  FileText,
  Warehouse,
  Plus,
  Filter,
  RefreshCw,
  MapPin,
  DollarSign,
  Clock,
  Wrench,
  ChevronDown,
  Eye,
  MoreHorizontal,
  CheckCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface InventoryStats {
  totalItems: number;
  lowStockAlerts: number;
  equipmentUnits: number;
  pendingPOs: number;
}

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  unit: string;
  unitCost: number | null;
  reorderPoint: number;
  quantity: number;
  status: string;
}

interface Equipment {
  id: string;
  assetTag: string;
  name: string;
  category: string | null;
  make: string | null;
  model: string | null;
  status: string;
  currentLocation: string | null;
  operatingHours: number;
  nextMaintenanceAt: string | null;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  vendorName: string;
  vendorId: string;
  status: string;
  totalAmount: number;
  orderDate: string | null;
  expectedDeliveryDate: string | null;
}

interface WarehouseLocation {
  id: string;
  name: string;
  type: string;
  address: string | null;
  status: string;
}

export default function Inventory() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTab, setSelectedTab] = useState("inventory");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [newItem, setNewItem] = useState({
    itemNumber: "",
    name: "",
    description: "",
    category: "",
    unit: "ea",
    quantityOnHand: "0",
    reorderPoint: "10",
    unitCost: "",
    warehouseId: "",
  });
  const { toast } = useToast();

  const createItemMutation = useMutation({
    mutationFn: (data: typeof newItem) =>
      apiRequest("POST", "/api/inventory/items", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/stats"] });
      toast({ title: "Item Created", description: "New inventory item added successfully." });
      setAddItemOpen(false);
      setNewItem({ itemNumber: "", name: "", description: "", category: "", unit: "ea", quantityOnHand: "0", reorderPoint: "10", unitCost: "", warehouseId: "" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create inventory item.", variant: "destructive" });
    },
  });

  const handleRefreshInventory = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
    queryClient.invalidateQueries({ queryKey: ["/api/inventory/stats"] });
    toast({ title: "Synced", description: "Inventory data refreshed." });
  };

  const handleNewItem = () => {
    setAddItemOpen(true);
  };

  const handleSubmitItem = () => {
    if (!newItem.itemNumber || !newItem.name) {
      toast({ title: "Validation Error", description: "Please fill required fields.", variant: "destructive" });
      return;
    }
    createItemMutation.mutate({
      ...newItem,
      quantityOnHand: parseInt(newItem.quantityOnHand) || 0,
      reorderPoint: parseInt(newItem.reorderPoint) || 10,
      unitCost: newItem.unitCost ? parseFloat(newItem.unitCost).toString() : undefined,
    } as any);
  };

  const { data: stats, isLoading: statsLoading } = useQuery<InventoryStats>({
    queryKey: ["/api/inventory/stats"],
  });

  const { data: inventoryItems, isLoading: inventoryLoading } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory/items"],
  });

  const { data: equipmentData, isLoading: equipmentLoading } = useQuery<Equipment[]>({
    queryKey: ["/api/inventory/equipment"],
  });

  const { data: purchaseOrders, isLoading: posLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["/api/inventory/purchase-orders"],
  });

  const { data: warehouses, isLoading: warehousesLoading } = useQuery<WarehouseLocation[]>({
    queryKey: ["/api/inventory/warehouses"],
  });

  const displayStats = stats || { totalItems: 0, lowStockAlerts: 0, equipmentUnits: 0, pendingPOs: 0 };
  const displayInventory = inventoryItems || [];
  const displayEquipment = equipmentData || [];
  const displayPOs = purchaseOrders || [];
  const displayWarehouses = warehouses || [];

  const filteredInventory = displayInventory.filter((item) =>
    (item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (categoryFilter === "all" || item.category === categoryFilter)
  );

  const filteredEquipment = displayEquipment.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.assetTag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredPOs = displayPOs.filter((po) =>
    po.poNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    po.vendorName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredWarehouses = displayWarehouses.filter((wh) =>
    wh.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
      case "available":
      case "delivered":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">{status.replace("_", " ")}</Badge>;
      case "low_stock":
        return <Badge variant="destructive">{status.replace("_", " ")}</Badge>;
      case "deployed":
      case "approved":
      case "shipped":
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">{status.replace("_", " ")}</Badge>;
      case "maintenance":
      case "pending":
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">{status.replace("_", " ")}</Badge>;
      case "inactive":
        return <Badge variant="secondary">{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return "-";
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getMaintenanceDays = (dateStr: string | null) => {
    if (!dateStr) return null;
    const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days <= 7) return <span className="text-red-500 font-medium">{days}d</span>;
    if (days <= 14) return <span className="text-yellow-500">{days}d</span>;
    return <span className="text-muted-foreground">{days}d</span>;
  };

  const categories = Array.from(new Set(displayInventory.map(item => item.category).filter(Boolean)));

  return (
    <div className="flex-1 space-y-4 md:space-y-6 p-4 md:p-6 overflow-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inventory & Materials</h1>
          <p className="text-muted-foreground">Manage inventory, equipment, and purchase orders</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshInventory} data-testid="button-refresh-inventory">
            <RefreshCw className="mr-2 h-4 w-4" />
            Sync
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" onClick={handleNewItem} data-testid="button-new-dropdown">
                <Plus className="mr-2 h-4 w-4" />
                New
                <ChevronDown className="ml-2 h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="menu-new-item">
                <Package className="mr-2 h-4 w-4" />
                New Item
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="menu-new-equipment">
                <Truck className="mr-2 h-4 w-4" />
                Add Equipment
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="menu-new-po">
                <FileText className="mr-2 h-4 w-4" />
                New PO
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="menu-new-warehouse">
                <Warehouse className="mr-2 h-4 w-4" />
                Add Warehouse
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card data-testid="stat-card-total-items">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.totalItems}</div>
                <p className="text-xs text-muted-foreground">Active inventory SKUs</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-low-stock">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alerts</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold text-red-500">{displayStats.lowStockAlerts}</div>
                <p className="text-xs text-muted-foreground">Items below reorder point</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-equipment">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Equipment Units</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.equipmentUnits}</div>
                <p className="text-xs text-muted-foreground">Tracked assets</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="stat-card-pending-pos">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending POs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <>
                <div className="text-2xl font-bold">{displayStats.pendingPOs}</div>
                <p className="text-xs text-muted-foreground">Awaiting delivery</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <TabsList data-testid="inventory-tabs">
            <TabsTrigger value="inventory" data-testid="tab-inventory">
              <Package className="mr-2 h-4 w-4" />
              Inventory
            </TabsTrigger>
            <TabsTrigger value="equipment" data-testid="tab-equipment">
              <Truck className="mr-2 h-4 w-4" />
              Equipment
            </TabsTrigger>
            <TabsTrigger value="purchase-orders" data-testid="tab-purchase-orders">
              <FileText className="mr-2 h-4 w-4" />
              Purchase Orders
            </TabsTrigger>
            <TabsTrigger value="warehouses" data-testid="tab-warehouses">
              <Warehouse className="mr-2 h-4 w-4" />
              Warehouses
            </TabsTrigger>
          </TabsList>

          <div className="flex-1" />

          <div className="relative min-w-[280px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Search ${selectedTab}...`}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>

          {selectedTab === "inventory" && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {inventoryLoading ? (
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit Cost</TableHead>
                      <TableHead className="text-right">Reorder Point</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.map((item) => (
                      <TableRow key={item.id} data-testid={`row-inventory-${item.id}`}>
                        <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.category || "-"}</TableCell>
                        <TableCell className="text-right">
                          <span className={item.quantity <= item.reorderPoint ? "text-red-500 font-medium" : ""}>
                            {item.quantity} {item.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unitCost)}</TableCell>
                        <TableCell className="text-right">{item.reorderPoint}</TableCell>
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-actions-${item.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem><Eye className="mr-2 h-4 w-4" />View Details</DropdownMenuItem>
                              <DropdownMenuItem><Plus className="mr-2 h-4 w-4" />Add Stock</DropdownMenuItem>
                              <DropdownMenuItem><FileText className="mr-2 h-4 w-4" />Create PO</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="equipment" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {equipmentLoading ? (
              [...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              filteredEquipment.map((item) => (
                <Card key={item.id} className="hover-elevate" data-testid={`card-equipment-${item.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div>
                      <p className="text-xs font-mono text-muted-foreground">{item.assetTag}</p>
                      <CardTitle className="text-base">{item.name}</CardTitle>
                    </div>
                    {getStatusBadge(item.status)}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Truck className="h-4 w-4" />
                      <span>{item.make} {item.model}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span>{item.currentLocation || "Unknown"}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        <span>{item.operatingHours.toLocaleString()} hrs</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        <span>Next: {getMaintenanceDays(item.nextMaintenanceAt)}</span>
                      </div>
                    </div>
                    <div className="pt-2 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" data-testid={`button-view-equipment-${item.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1" data-testid={`button-maintenance-${item.id}`}>
                        <Wrench className="mr-2 h-4 w-4" />
                        Maintenance
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="purchase-orders" className="space-y-4">
          <Card>
            <CardContent className="p-0">
              {posLoading ? (
                <div className="p-6 space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead>Order Date</TableHead>
                      <TableHead>Expected Delivery</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPOs.map((po) => (
                      <TableRow key={po.id} data-testid={`row-po-${po.id}`}>
                        <TableCell className="font-mono font-medium">{po.poNumber}</TableCell>
                        <TableCell>{po.vendorName}</TableCell>
                        <TableCell>{getStatusBadge(po.status)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(po.totalAmount)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(po.orderDate)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(po.expectedDeliveryDate)}</TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-actions-po-${po.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem><Eye className="mr-2 h-4 w-4" />View Details</DropdownMenuItem>
                              <DropdownMenuItem><CheckCircle className="mr-2 h-4 w-4" />Mark Received</DropdownMenuItem>
                              <DropdownMenuItem><FileText className="mr-2 h-4 w-4" />Print PO</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="warehouses" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {warehousesLoading ? (
              [...Array(4)].map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-6">
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              filteredWarehouses.map((wh) => (
                <Card key={wh.id} className="hover-elevate" data-testid={`card-warehouse-${wh.id}`}>
                  <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                    <div>
                      <CardTitle className="text-base">{wh.name}</CardTitle>
                      <Badge variant="outline" className="mt-1">{wh.type.replace("_", " ")}</Badge>
                    </div>
                    {getStatusBadge(wh.status)}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{wh.address || "No address"}</span>
                    </div>
                    <div className="pt-2 flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" data-testid={`button-view-warehouse-${wh.id}`}>
                        <Eye className="mr-2 h-4 w-4" />
                        View Inventory
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Inventory Item</DialogTitle>
            <DialogDescription>
              Add a new item to the inventory system.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="itemNumber" className="text-right">Item # *</Label>
              <Input
                id="itemNumber"
                value={newItem.itemNumber}
                onChange={(e) => setNewItem({ ...newItem, itemNumber: e.target.value })}
                className="col-span-3"
                placeholder="e.g., INV-001"
                data-testid="input-item-number"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">Name *</Label>
              <Input
                id="name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="col-span-3"
                data-testid="input-item-name"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="description" className="text-right">Description</Label>
              <Input
                id="description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                className="col-span-3"
                data-testid="input-item-description"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">Category</Label>
              <Select
                value={newItem.category}
                onValueChange={(v) => setNewItem({ ...newItem, category: v })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-item-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lumber">Lumber</SelectItem>
                  <SelectItem value="concrete">Concrete</SelectItem>
                  <SelectItem value="steel">Steel</SelectItem>
                  <SelectItem value="electrical">Electrical</SelectItem>
                  <SelectItem value="plumbing">Plumbing</SelectItem>
                  <SelectItem value="fasteners">Fasteners</SelectItem>
                  <SelectItem value="tools">Tools</SelectItem>
                  <SelectItem value="safety">Safety</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="unit" className="text-right">Unit</Label>
              <Select
                value={newItem.unit}
                onValueChange={(v) => setNewItem({ ...newItem, unit: v })}
              >
                <SelectTrigger className="col-span-3" data-testid="select-item-unit">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ea">Each</SelectItem>
                  <SelectItem value="lf">Linear Feet</SelectItem>
                  <SelectItem value="sf">Square Feet</SelectItem>
                  <SelectItem value="cy">Cubic Yards</SelectItem>
                  <SelectItem value="lb">Pounds</SelectItem>
                  <SelectItem value="box">Box</SelectItem>
                  <SelectItem value="roll">Roll</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="quantityOnHand" className="text-right">Qty</Label>
              <Input
                id="quantityOnHand"
                type="number"
                value={newItem.quantityOnHand}
                onChange={(e) => setNewItem({ ...newItem, quantityOnHand: e.target.value })}
                className="col-span-3"
                data-testid="input-item-qty"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="unitCost" className="text-right">Unit Cost</Label>
              <Input
                id="unitCost"
                value={newItem.unitCost}
                onChange={(e) => setNewItem({ ...newItem, unitCost: e.target.value })}
                className="col-span-3"
                placeholder="e.g., 25.50"
                data-testid="input-item-cost"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddItemOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmitItem} 
              disabled={createItemMutation.isPending}
              data-testid="button-submit-item"
            >
              {createItemMutation.isPending ? "Creating..." : "Create Item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
