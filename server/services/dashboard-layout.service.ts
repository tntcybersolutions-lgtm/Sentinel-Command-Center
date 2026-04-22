import { db } from "../db";
import { userDashboardWidgets } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import {
  DASHBOARD_WIDGETS,
  WIDGET_REGISTRY_BY_KEY,
  DEFAULT_LAYOUT,
  DASHBOARD_PRESETS,
  isValidWidgetKey,
  isAllowedSize,
  getPreset,
} from "../../client/src/dashboard/widgetRegistry";
import type { WidgetSize, DashboardPresetKey } from "../../client/src/dashboard/widgetRegistry";

export interface LayoutWidgetRow {
  widgetKey: string;
  name: string;
  description: string;
  category: string;
  allowedSizes: WidgetSize[];
  isVisible: boolean;
  orderIndex: number;
  size: string;
}

export interface DashboardLayoutResponse {
  widgets: LayoutWidgetRow[];
  presets: Array<{ key: string; name: string; description: string }>;
}

function buildMergedLayout(
  dbRows: Array<{
    widgetKey: string;
    isVisible: boolean;
    orderIndex: number;
    size: string;
  }>
): LayoutWidgetRow[] {
  const overrideMap = new Map(dbRows.map((r) => [r.widgetKey, r]));

  return DASHBOARD_WIDGETS.map((def) => {
    const ov = overrideMap.get(def.widgetKey);
    return {
      widgetKey: def.widgetKey,
      name: def.name,
      description: def.description,
      category: def.category,
      allowedSizes: def.allowedSizes,
      isVisible: ov ? ov.isVisible : def.defaultVisible,
      orderIndex: ov ? ov.orderIndex : def.defaultOrderIndex,
      size: ov ? ov.size : def.defaultSize,
    };
  }).sort((a, b) => a.orderIndex - b.orderIndex);
}

const presetsForResponse = DASHBOARD_PRESETS.map((p) => ({
  key: p.key,
  name: p.name,
  description: p.description,
}));

export async function getDashboardLayout(
  tenantId: string,
  userId: string
): Promise<DashboardLayoutResponse> {
  const rows = await db
    .select()
    .from(userDashboardWidgets)
    .where(
      and(
        eq(userDashboardWidgets.tenantId, tenantId),
        eq(userDashboardWidgets.userId, userId)
      )
    );

  return {
    widgets: buildMergedLayout(rows),
    presets: presetsForResponse,
  };
}

export async function patchDashboardLayout(
  tenantId: string,
  userId: string,
  body: {
    updates?: Array<{
      widgetKey: string;
      isVisible?: boolean;
      size?: string;
      orderIndex?: number;
    }>;
    preset?: string;
  }
): Promise<DashboardLayoutResponse> {
  let updates = body.updates;

  if (body.preset) {
    const preset = getPreset(body.preset as DashboardPresetKey);
    if (!preset) {
      throw new Error(`Unknown preset: ${body.preset}`);
    }
    updates = preset.updates.map((u) => ({
      widgetKey: u.widgetKey,
      isVisible: u.isVisible,
      size: u.size,
      orderIndex: u.orderIndex,
    }));
  }

  if (!updates || !Array.isArray(updates)) {
    throw new Error("Either updates[] or preset must be provided");
  }

  for (const u of updates) {
    if (!isValidWidgetKey(u.widgetKey)) continue;
    const def = WIDGET_REGISTRY_BY_KEY[u.widgetKey];
    const size = (u.size ?? def.defaultSize) as WidgetSize;
    const finalSize = isAllowedSize(u.widgetKey, size) ? size : def.defaultSize;

    await db
      .insert(userDashboardWidgets)
      .values({
        tenantId,
        userId,
        widgetKey: u.widgetKey,
        isVisible: u.isVisible ?? def.defaultVisible,
        orderIndex: u.orderIndex ?? def.defaultOrderIndex,
        size: finalSize,
      })
      .onConflictDoUpdate({
        target: [
          userDashboardWidgets.tenantId,
          userDashboardWidgets.userId,
          userDashboardWidgets.widgetKey,
        ],
        set: {
          isVisible: u.isVisible ?? def.defaultVisible,
          orderIndex: u.orderIndex ?? def.defaultOrderIndex,
          size: finalSize,
          updatedAt: new Date(),
        },
      });
  }

  return getDashboardLayout(tenantId, userId);
}

export async function resetDashboardLayout(
  tenantId: string,
  userId: string
): Promise<DashboardLayoutResponse> {
  await db
    .delete(userDashboardWidgets)
    .where(
      and(
        eq(userDashboardWidgets.tenantId, tenantId),
        eq(userDashboardWidgets.userId, userId)
      )
    );

  return getDashboardLayout(tenantId, userId);
}
