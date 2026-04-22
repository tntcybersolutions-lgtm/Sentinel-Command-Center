import type * as React from "react";

export type EntityId = string | number;

export type EntityType =
  | "task"
  | "submittal"
  | "rfi"
  | "purchaseOrder"
  | "changeOrder"
  | "invoice"
  | "bidProject"
  | "project";

export type ActionId =
  | "edit"
  | "view"
  | "preview"
  | "send"
  | "duplicate"
  | "close"
  | "reopen"
  | "createRevision"
  | "response"
  | "approve"
  | "reject"
  | "upload"
  | "download"
  | "downloadAll"
  | "watchers"
  | "delete";

export type ActionGroup = "primary" | "workflow" | "collaboration" | "files" | "danger";

export type RowEntityBase = {
  id: EntityId;
  status?: string | null;
  projectId?: EntityId | null;
  title?: string | null;
  name?: string | null;
  createdById?: EntityId | null;
  managerId?: EntityId | null;
  assigneeId?: EntityId | null;
  _perm?: Partial<Record<ActionId, boolean>>;
  attachmentCount?: number | null;
};

export type RowActionContext<E extends RowEntityBase = RowEntityBase> = {
  entityType: EntityType;
  entity: E;
  role: "admin" | "manager" | "user";
  listQueryKey?: unknown[];
  openDrawer: (mode: string) => void;
  invalidateList: () => Promise<void> | void;
};

export type RowAction<E extends RowEntityBase = RowEntityBase> = {
  id: ActionId;
  label: string;
  order: number;
  group?: ActionGroup;
  icon?: React.ReactNode;
  destructive?: boolean;
  isVisible?: (ctx: RowActionContext<E>) => boolean;
  disabled?: ((ctx: RowActionContext<E>) => boolean) | boolean;
  run: (ctx: RowActionContext<E>) => Promise<void> | void;
};

export type BoundRowAction = {
  id: ActionId;
  label: string;
  order: number;
  group?: ActionGroup;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  run: () => Promise<void> | void;
};
