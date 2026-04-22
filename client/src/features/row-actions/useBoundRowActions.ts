import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEntityDrawerStore } from "@/features/drawers/drawerStore";
import type { BoundRowAction, EntityType, RowEntityBase, RowActionContext } from "./types";
import { actionRegistry, defaultListQueryKey } from "./registry";
import { getEffectiveRole } from "@/lib/permissions";

export function useBoundRowActions<E extends RowEntityBase>(
  entityType: EntityType,
  entity: E,
  listQueryKey?: unknown[]
): BoundRowAction[] {
  const queryClient = useQueryClient();
  const drawerOpen = useEntityDrawerStore((s) => s.open);

  return useMemo(() => {
    const defs = actionRegistry[entityType];
    if (!defs) return [];

    const effectiveListKey = listQueryKey ?? [defaultListQueryKey(entityType)];

    const ctx: RowActionContext<E> = {
      entityType,
      entity,
      role: getEffectiveRole(),
      listQueryKey: effectiveListKey,
      openDrawer: (mode: string) => {
        const drawerMode = (mode === "edit" ? "edit" : "view") as "view" | "edit";
        drawerOpen({ entityType, entityId: entity.id, mode: drawerMode });
      },
      invalidateList: () => {
        queryClient.invalidateQueries({ queryKey: effectiveListKey });
      },
    };

    const bound: BoundRowAction[] = [];

    for (const def of defs as any[]) {
      let visible = true;
      if (typeof def.isVisible === "function") {
        try {
          visible = Boolean(def.isVisible(ctx));
        } catch {
          visible = true;
        }
      }
      if (!visible) continue;

      let disabled = false;
      if (typeof def.disabled === "function") {
        try {
          disabled = Boolean(def.disabled(ctx));
        } catch {
          disabled = false;
        }
      } else if (typeof def.disabled === "boolean") {
        disabled = def.disabled;
      }

      const run = async () => {
        if (disabled) return;
        await def.run(ctx);
      };

      bound.push({
        id: def.id,
        label: def.label,
        order: def.order ?? 999,
        group: def.group,
        icon: def.icon,
        destructive: def.destructive,
        disabled,
        run,
      });
    }

    bound.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));

    return bound;
  }, [entityType, entity, listQueryKey, queryClient, drawerOpen]);
}
