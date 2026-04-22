import { db } from "../db";
import { 
  inventoryItems, inventoryLevels, inventoryTransactions,
  equipment, maintenanceRecords, purchaseOrders, purchaseOrderLines,
  invoices, warehouses
} from "@shared/schema";
import { eq, and, lt, sql, desc, gte, lte } from "drizzle-orm";
import { auditService } from "./audit.service";
import { approvalService } from "./approval.service";

interface ShortageAlert {
  itemId: string;
  itemName: string;
  currentLevel: number;
  reorderPoint: number;
  warehouseId: string;
  warehouseName: string;
  recommendedOrderQty: number;
}

interface ReconciliationResult {
  itemId: string;
  systemQty: number;
  physicalQty: number;
  variance: number;
  variancePercentage: number;
  status: "matched" | "discrepancy";
}

class InventoryService {
  async listItems(tenantId: string, filters?: {
    warehouseId?: string;
    category?: string;
    status?: string;
    lowStock?: boolean;
  }) {
    let conditions = [eq(inventoryItems.tenantId, tenantId)];
    
    if (filters?.category) {
      conditions.push(eq(inventoryItems.category, filters.category));
    }
    if (filters?.status) {
      conditions.push(eq(inventoryItems.status, filters.status));
    }

    const items = await db.select()
      .from(inventoryItems)
      .where(and(...conditions))
      .orderBy(desc(inventoryItems.updatedAt));

    return items;
  }

  async getItem(tenantId: string, itemId: string) {
    const [item] = await db.select()
      .from(inventoryItems)
      .where(and(
        eq(inventoryItems.tenantId, tenantId),
        eq(inventoryItems.id, itemId)
      ));
    return item;
  }

  async createItem(tenantId: string, data: {
    sku: string;
    name: string;
    description?: string;
    category?: string;
    unit: string;
    unitCost?: string;
    reorderPoint?: number;
  }, actorId?: string) {
    const [item] = await db.insert(inventoryItems)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "inventory.item.created",
      actor: actorId || "system",
      entityType: "inventory_item",
      entityId: item.id,
      afterJson: item as Record<string, unknown>,
    });

    return item;
  }

  async updateItem(tenantId: string, itemId: string, data: Partial<{
    name: string;
    description: string;
    category: string;
    unit: string;
    unitCost: string;
    reorderPoint: number;
    status: string;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.id, itemId)));

    const [item] = await db.update(inventoryItems)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.id, itemId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "inventory.item.updated",
      actor: actorId || "system",
      entityType: "inventory_item",
      entityId: itemId,
      beforeJson: before as Record<string, unknown>,
      afterJson: item as Record<string, unknown>,
    });

    return item;
  }

  async deleteItem(tenantId: string, itemId: string, actorId?: string) {
    const [before] = await db.select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.id, itemId)));

    await db.delete(inventoryItems)
      .where(and(eq(inventoryItems.tenantId, tenantId), eq(inventoryItems.id, itemId)));

    await auditService.logEvent({
      tenantId,
      eventType: "inventory.item.deleted",
      actor: actorId || "system",
      entityType: "inventory_item",
      entityId: itemId,
      beforeJson: before as Record<string, unknown>,
    });

    return { success: true };
  }

  async getInventoryLevels(tenantId: string, warehouseId?: string) {
    let conditions = [eq(inventoryLevels.tenantId, tenantId)];
    if (warehouseId) {
      conditions.push(eq(inventoryLevels.warehouseId, warehouseId));
    }

    const levels = await db.select({
      level: inventoryLevels,
      item: inventoryItems,
      warehouse: warehouses,
    })
      .from(inventoryLevels)
      .innerJoin(inventoryItems, eq(inventoryLevels.itemId, inventoryItems.id))
      .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
      .where(and(...conditions));

    return levels;
  }

  async recordTransaction(tenantId: string, data: {
    itemId: string;
    warehouseId: string;
    transactionType: string;
    quantity: string;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
  }, actorId?: string) {
    const [transaction] = await db.insert(inventoryTransactions)
      .values({
        tenantId,
        itemId: data.itemId,
        warehouseId: data.warehouseId,
        transactionType: data.transactionType,
        quantity: data.quantity,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        notes: data.notes,
        createdByUserId: actorId,
      })
      .returning();

    const qty = parseFloat(data.quantity);
    const isAddition = ["receipt", "return", "adjustment_add", "transfer_in"].includes(data.transactionType);
    const quantityChange = isAddition ? qty : -qty;

    await db.update(inventoryLevels)
      .set({
        quantity: sql`CAST(${inventoryLevels.quantity} AS numeric) + ${quantityChange}`,
        lastCountedAt: new Date(),
      })
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        eq(inventoryLevels.itemId, data.itemId),
        eq(inventoryLevels.warehouseId, data.warehouseId)
      ));

    await auditService.logEvent({
      tenantId,
      eventType: "inventory.transaction.recorded",
      actor: actorId || "system",
      entityType: "inventory_transaction",
      entityId: transaction.id,
      afterJson: transaction as Record<string, unknown>,
    });

    return transaction;
  }

  async detectShortages(tenantId: string): Promise<ShortageAlert[]> {
    const shortages = await db.select({
      itemId: inventoryItems.id,
      itemName: inventoryItems.name,
      currentLevel: inventoryLevels.quantity,
      reorderPoint: inventoryItems.reorderPoint,
      warehouseId: warehouses.id,
      warehouseName: warehouses.name,
    })
      .from(inventoryLevels)
      .innerJoin(inventoryItems, eq(inventoryLevels.itemId, inventoryItems.id))
      .innerJoin(warehouses, eq(inventoryLevels.warehouseId, warehouses.id))
      .where(and(
        eq(inventoryLevels.tenantId, tenantId),
        sql`CAST(${inventoryLevels.quantity} AS numeric) <= COALESCE(${inventoryItems.reorderPoint}, 0)`
      ));

    return shortages.map(s => ({
      itemId: s.itemId,
      itemName: s.itemName,
      currentLevel: parseFloat(s.currentLevel || "0"),
      reorderPoint: s.reorderPoint || 0,
      warehouseId: s.warehouseId,
      warehouseName: s.warehouseName,
      recommendedOrderQty: 10,
    }));
  }

  async reconcileInventory(tenantId: string, warehouseId: string, physicalCounts: {
    itemId: string;
    physicalQty: number;
  }[], actorId?: string): Promise<ReconciliationResult[]> {
    const results: ReconciliationResult[] = [];

    for (const count of physicalCounts) {
      const [level] = await db.select()
        .from(inventoryLevels)
        .where(and(
          eq(inventoryLevels.tenantId, tenantId),
          eq(inventoryLevels.warehouseId, warehouseId),
          eq(inventoryLevels.itemId, count.itemId)
        ));

      if (level) {
        const systemQty = parseFloat(level.quantity || "0");
        const variance = count.physicalQty - systemQty;
        const variancePercentage = systemQty > 0 ? (variance / systemQty) * 100 : 0;

        results.push({
          itemId: count.itemId,
          systemQty,
          physicalQty: count.physicalQty,
          variance,
          variancePercentage,
          status: Math.abs(variance) < 0.01 ? "matched" : "discrepancy",
        });

        if (Math.abs(variance) >= 0.01) {
          await db.update(inventoryLevels)
            .set({
              quantity: count.physicalQty.toString(),
              lastCountedAt: new Date(),
            })
            .where(eq(inventoryLevels.id, level.id));

          await this.recordTransaction(tenantId, {
            itemId: count.itemId,
            warehouseId,
            transactionType: variance > 0 ? "adjustment_add" : "adjustment_remove",
            quantity: Math.abs(variance).toString(),
            notes: `Inventory reconciliation adjustment`,
          }, actorId);
        }
      }
    }

    await auditService.logEvent({
      tenantId,
      eventType: "inventory.reconciliation.completed",
      actor: actorId || "system",
      entityType: "warehouse",
      entityId: warehouseId,
      afterJson: { results, physicalCounts },
    });

    return results;
  }

  async listEquipment(tenantId: string, filters?: {
    status?: string;
    category?: string;
    locationId?: string;
  }) {
    let conditions = [eq(equipment.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(equipment.status, filters.status));
    }
    if (filters?.category) {
      conditions.push(eq(equipment.category, filters.category));
    }

    const items = await db.select()
      .from(equipment)
      .where(and(...conditions))
      .orderBy(desc(equipment.updatedAt));

    return items;
  }

  async getEquipment(tenantId: string, equipmentId: string) {
    const [item] = await db.select()
      .from(equipment)
      .where(and(
        eq(equipment.tenantId, tenantId),
        eq(equipment.id, equipmentId)
      ));
    return item;
  }

  async createEquipment(tenantId: string, data: {
    assetTag: string;
    name: string;
    category?: string;
    manufacturer?: string;
    model?: string;
    serialNumber?: string;
    purchaseDate?: Date;
    purchaseCost?: string;
    currentValue?: string;
    status?: string;
  }, actorId?: string) {
    const [item] = await db.insert(equipment)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "equipment.created",
      actor: actorId || "system",
      entityType: "equipment",
      entityId: item.id,
      afterJson: item as Record<string, unknown>,
    });

    return item;
  }

  async updateEquipment(tenantId: string, equipmentId: string, data: Partial<{
    name: string;
    category: string;
    status: string;
    currentLocationId: string;
    operatingHours: number;
    nextMaintenanceAt: Date;
  }>, actorId?: string) {
    const [before] = await db.select()
      .from(equipment)
      .where(and(eq(equipment.tenantId, tenantId), eq(equipment.id, equipmentId)));

    const [item] = await db.update(equipment)
      .set({ ...data, updatedAt: new Date() } as any)
      .where(and(eq(equipment.tenantId, tenantId), eq(equipment.id, equipmentId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "equipment.updated",
      actor: actorId || "system",
      entityType: "equipment",
      entityId: equipmentId,
      beforeJson: before as Record<string, unknown>,
      afterJson: item as Record<string, unknown>,
    });

    return item;
  }

  async scheduleMaintenance(tenantId: string, data: {
    equipmentId: string;
    maintenanceType: string;
    description?: string;
    scheduledDate: Date;
    estimatedCost?: string;
    performedByUserId?: string;
  }, actorId?: string) {
    const [record] = await db.insert(maintenanceRecords)
      .values({
        tenantId,
        equipmentId: data.equipmentId,
        maintenanceType: data.maintenanceType,
        description: data.description,
        cost: data.estimatedCost,
        performedByUserId: data.performedByUserId,
        nextMaintenanceAt: data.scheduledDate,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "maintenance.scheduled",
      actor: actorId || "system",
      entityType: "maintenance_record",
      entityId: record.id,
      afterJson: record as Record<string, unknown>,
    });

    return record;
  }

  async completeMaintenance(tenantId: string, recordId: string, data: {
    completedDate: Date;
    actualCost?: string;
    notes?: string;
    nextScheduledDate?: Date;
  }, actorId?: string) {
    const [before] = await db.select()
      .from(maintenanceRecords)
      .where(and(eq(maintenanceRecords.tenantId, tenantId), eq(maintenanceRecords.id, recordId)));

    const [record] = await db.update(maintenanceRecords)
      .set({
        performedAt: data.completedDate,
        cost: data.actualCost,
        notesJson: data.notes ? { note: data.notes } : undefined,
      })
      .where(and(eq(maintenanceRecords.tenantId, tenantId), eq(maintenanceRecords.id, recordId)))
      .returning();

    if (data.nextScheduledDate && before.equipmentId) {
      await db.update(equipment)
        .set({
          nextMaintenanceAt: data.nextScheduledDate,
          updatedAt: new Date(),
        })
        .where(eq(equipment.id, before.equipmentId));
    }

    await auditService.logEvent({
      tenantId,
      eventType: "maintenance.completed",
      actor: actorId || "system",
      entityType: "maintenance_record",
      entityId: recordId,
      beforeJson: before as Record<string, unknown>,
      afterJson: record as Record<string, unknown>,
    });

    return record;
  }

  async createPurchaseOrder(tenantId: string, data: {
    poNumber: string;
    vendorId: string;
    projectId?: string;
    notes?: string;
    lines: Array<{
      itemId?: string;
      description: string;
      quantity: string;
      unitPrice: string;
      costCodeId?: string;
    }>;
  }, actorId?: string) {
    const totalAmount = data.lines.reduce((sum, line) => {
      return sum + (parseFloat(line.quantity) * parseFloat(line.unitPrice));
    }, 0);

    const [po] = await db.insert(purchaseOrders)
      .values({
        tenantId,
        poNumber: data.poNumber,
        vendorId: data.vendorId,
        projectId: data.projectId,
        notesJson: data.notes ? { note: data.notes } : undefined,
        totalAmount: totalAmount.toFixed(2),
        status: "draft",
      })
      .returning();

    for (let i = 0; i < data.lines.length; i++) {
      const line = data.lines[i];
      const lineTotal = parseFloat(line.quantity) * parseFloat(line.unitPrice);
      
      await db.insert(purchaseOrderLines)
        .values({
          tenantId,
          purchaseOrderId: po.id,
          itemId: line.itemId,
          description: line.description,
          quantity: line.quantity,
          unitCost: line.unitPrice,
          totalCost: lineTotal.toFixed(2),
          costCodeId: line.costCodeId,
        });
    }

    await auditService.logEvent({
      tenantId,
      eventType: "purchase_order.created",
      actor: actorId || "system",
      entityType: "purchase_order",
      entityId: po.id,
      afterJson: { po, lines: data.lines },
    });

    return po;
  }

  async approvePurchaseOrder(tenantId: string, poId: string, actorId: string) {
    const approval = await approvalService.createRequest({
      tenantId,
      entityType: "purchase_order",
      entityId: poId,
      actionType: "external_commitment",
      requestedBy: actorId,
    });

    return approval;
  }

  async submitPurchaseOrder(tenantId: string, poId: string, actorId: string) {
    const result = await approvalService.checkApproval(tenantId, "purchase_order", poId, "external_commitment");
    
    if (!result.approved) {
      return { success: false, message: "Purchase order requires approval before submission" };
    }

    const [po] = await db.update(purchaseOrders)
      .set({
        status: "submitted",
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.id, poId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "purchase_order.submitted",
      actor: actorId,
      entityType: "purchase_order",
      entityId: poId,
      afterJson: po as Record<string, unknown>,
    });

    return { success: true, po };
  }

  async listPurchaseOrders(tenantId: string, filters?: {
    status?: string;
    vendorId?: string;
    projectId?: string;
  }) {
    let conditions = [eq(purchaseOrders.tenantId, tenantId)];
    
    if (filters?.status) {
      conditions.push(eq(purchaseOrders.status, filters.status));
    }
    if (filters?.vendorId) {
      conditions.push(eq(purchaseOrders.vendorId, filters.vendorId));
    }
    if (filters?.projectId) {
      conditions.push(eq(purchaseOrders.projectId, filters.projectId));
    }

    return db.select()
      .from(purchaseOrders)
      .where(and(...conditions))
      .orderBy(desc(purchaseOrders.createdAt));
  }

  async getPurchaseOrder(tenantId: string, poId: string) {
    const [po] = await db.select()
      .from(purchaseOrders)
      .where(and(
        eq(purchaseOrders.tenantId, tenantId),
        eq(purchaseOrders.id, poId)
      ));
    return po;
  }

  async updatePOStatus(tenantId: string, poId: string, status: string, actorId?: string) {
    const [before] = await db.select()
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.id, poId)));

    const [po] = await db.update(purchaseOrders)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(purchaseOrders.tenantId, tenantId), eq(purchaseOrders.id, poId)))
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: `purchase_order.${status}`,
      actor: actorId || "system",
      entityType: "purchase_order",
      entityId: poId,
      beforeJson: before as Record<string, unknown>,
      afterJson: po as Record<string, unknown>,
    });

    return po;
  }

  async listWarehouses(tenantId: string) {
    return db.select()
      .from(warehouses)
      .where(eq(warehouses.tenantId, tenantId))
      .orderBy(warehouses.name);
  }

  async createWarehouse(tenantId: string, data: {
    name: string;
    warehouseCode: string;
    addressJson?: unknown;
    gpsLat?: string;
    gpsLng?: string;
    managerId?: string;
  }, actorId?: string) {
    const [warehouse] = await db.insert(warehouses)
      .values({
        tenantId,
        ...data,
      })
      .returning();

    await auditService.logEvent({
      tenantId,
      eventType: "warehouse.created",
      actor: actorId || "system",
      entityType: "warehouse",
      entityId: warehouse.id,
      afterJson: warehouse as Record<string, unknown>,
    });

    return warehouse;
  }
}

export const inventoryService = new InventoryService();
