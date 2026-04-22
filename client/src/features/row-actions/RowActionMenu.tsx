import { Fragment, useState, useCallback } from "react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { EntityType, RowEntityBase, BoundRowAction } from "./types";
import { useBoundRowActions } from "./useBoundRowActions";

export function RowActionMenu<E extends RowEntityBase>(props: {
  entityType: EntityType;
  entity: E;
  listQueryKey?: unknown[];
}) {
  const { entityType, entity, listQueryKey } = props;
  const [open, setOpen] = useState(false);

  const actions = useBoundRowActions(entityType, entity, listQueryKey);
  const hasActions = actions && actions.length > 0;

  const grouped = hasActions ? groupActions(actions) : [];

  const handleSelect = useCallback((action: BoundRowAction) => {
    setOpen(false);
    requestAnimationFrame(() => action.run());
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Row actions"
          data-testid={`button-row-actions-${entityType}-${String(entity.id)}`}
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="z-[9999] min-w-[220px]"
      >
        {!hasActions ? (
          <DropdownMenuItem disabled className="text-xs text-muted-foreground">
            No actions available
          </DropdownMenuItem>
        ) : (
          grouped.map((group, idx) => (
            <Fragment key={`${group.key}-${idx}`}>
              {idx > 0 ? <DropdownMenuSeparator /> : null}

              {group.items.map((a) => (
                <DropdownMenuItem
                  key={`${String(a.id)}-${String(entity.id)}`}
                  data-testid={`menu-action-${String(a.id)}-${entityType}-${String(entity.id)}`}
                  disabled={Boolean(a.disabled)}
                  onSelect={() => handleSelect(a)}
                >
                  {a.icon ? (
                    <span className="mr-2">{a.icon}</span>
                  ) : null}
                  <span className="flex-1">{a.label}</span>
                </DropdownMenuItem>
              ))}
            </Fragment>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function deriveGroupId(actionId: string) {
  const id = actionId.toLowerCase();

  if (["edit", "view"].includes(id)) return "primary";

  if (
    ["preview", "send", "duplicate", "close", "reopen", "createrevision", "response", "reject"].includes(id)
  )
    return "workflow";

  if (["watchers"].includes(id)) return "collaboration";
  if (["download", "downloadall"].includes(id)) return "files";
  if (["delete"].includes(id)) return "danger";

  return "other";
}

function groupActions(actions: BoundRowAction[]) {
  const out: Array<{ key: string; items: BoundRowAction[] }> = [];
  const idxByKey = new Map<string, number>();

  for (const a of actions) {
    const groupKey = a.group || deriveGroupId(String(a.id));

    const existingIdx = idxByKey.get(groupKey);
    if (existingIdx === undefined) {
      idxByKey.set(groupKey, out.length);
      out.push({ key: groupKey, items: [a] });
    } else {
      out[existingIdx].items.push(a);
    }
  }

  return out;
}
