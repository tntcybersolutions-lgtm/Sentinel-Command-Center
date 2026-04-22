import {
  Eye,
  Pencil,
  Copy,
  Send,
  Download,
  Trash2,
  XCircle,
  CheckCircle2,
  FileText,
  PlusCircle,
} from "lucide-react";
import { createElement } from "react";

import type { EntityType, RowAction, RowActionContext, RowEntityBase } from "./types";
import { canAction, getEffectiveRole } from "@/lib/permissions";
import { routes, listQueryKeys } from "./routes";
import { api } from "@/lib/api";
import { confirm } from "@/lib/confirm";
import { downloadBlob } from "@/lib/downloads";
import { toast } from "@/hooks/use-toast";

type ActionGroup = "primary" | "workflow" | "collaboration" | "files" | "danger";
type RowActionWithGroup<E extends RowEntityBase> = RowAction<E> & { group?: ActionGroup };

function allowByDefault(ctx: RowActionContext<RowEntityBase>, actionId: string) {
  const ent: any = ctx.entity;
  const hasPerm = ent && typeof ent === "object" && ent._perm;
  if (hasPerm) return canAction(ctx as any, actionId as any);

  const role = getEffectiveRole?.() ?? "admin";
  if (role === "admin") return true;
  return true;
}

function statusLower(entity: any) {
  return String(entity?.status ?? "").toLowerCase();
}

function isClosedStatus(entity: any) {
  const s = statusLower(entity);
  return s === "closed" || s === "complete" || s === "completed" || s === "approved";
}

function basePath(entityType: EntityType) {
  return routes[entityType];
}

function idStr(entity: RowEntityBase) {
  return String(entity.id);
}

const capabilities: Record<EntityType, { duplicate: boolean; close: boolean; reopen: boolean; delete: boolean; downloadAll: boolean }> = {
  task: { duplicate: true, close: true, reopen: true, delete: true, downloadAll: true },
  submittal: { duplicate: true, close: true, reopen: true, delete: true, downloadAll: true },
  rfi: { duplicate: true, close: true, reopen: true, delete: true, downloadAll: true },
  purchaseOrder: { duplicate: true, close: true, reopen: true, delete: true, downloadAll: true },
  changeOrder: { duplicate: true, close: true, reopen: true, delete: true, downloadAll: true },
  invoice: { duplicate: true, close: false, reopen: false, delete: true, downloadAll: true },
  bidProject: { duplicate: true, close: false, reopen: false, delete: true, downloadAll: true },
  project: { duplicate: true, close: false, reopen: false, delete: true, downloadAll: true },
};

async function doDuplicate(ctx: RowActionContext<RowEntityBase>) {
  try {
    const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}/duplicate`;
    await api.post(url, {});
    ctx.invalidateList?.();
    toast({ title: "Duplicated", description: `${ctx.entityType} duplicated successfully.` });
  } catch (err: any) {
    toast({ title: "Duplicate failed", description: err.message, variant: "destructive" });
  }
}

async function doClose(ctx: RowActionContext<RowEntityBase>) {
  try {
    const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}/close`;
    await api.post(url, {});
    ctx.invalidateList?.();
    toast({ title: "Closed", description: `${ctx.entityType} has been closed.` });
  } catch (err: any) {
    toast({ title: "Close failed", description: err.message, variant: "destructive" });
  }
}

async function doReopen(ctx: RowActionContext<RowEntityBase>) {
  try {
    const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}/reopen`;
    await api.post(url, {});
    ctx.invalidateList?.();
    toast({ title: "Reopened", description: `${ctx.entityType} has been reopened.` });
  } catch (err: any) {
    toast({ title: "Reopen failed", description: err.message, variant: "destructive" });
  }
}

async function doDelete(ctx: RowActionContext<RowEntityBase>) {
  const ok = await confirm({
    title: "Delete this item?",
    description: "This will permanently delete the record. This action cannot be undone.",
    confirmText: "Delete",
    variant: "destructive",
  });
  if (!ok) return;

  try {
    const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}`;
    await api.del(url);
    ctx.invalidateList?.();
    toast({ title: "Deleted", description: `${ctx.entityType} has been deleted.` });
  } catch (err: any) {
    toast({ title: "Delete failed", description: err.message, variant: "destructive" });
  }
}

async function doSend(ctx: RowActionContext<RowEntityBase>) {
  try {
    const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}`;
    await api.patch(url, { status: "submitted" });
    ctx.invalidateList?.();
    toast({ title: "Sent", description: `${ctx.entityType} status changed to submitted.` });
  } catch (err: any) {
    toast({ title: "Send failed", description: err.message, variant: "destructive" });
  }
}

async function doReject(ctx: RowActionContext<RowEntityBase>) {
  const ok = await confirm({
    title: "Reject this item?",
    description: "This will change the status to rejected.",
    confirmText: "Reject",
    variant: "destructive",
  });
  if (!ok) return;

  try {
    const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}`;
    await api.patch(url, { status: "rejected" });
    ctx.invalidateList?.();
    toast({ title: "Rejected", description: `${ctx.entityType} has been rejected.` });
  } catch (err: any) {
    toast({ title: "Reject failed", description: err.message, variant: "destructive" });
  }
}

async function doResponse(ctx: RowActionContext<RowEntityBase>) {
  try {
    const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}`;
    await api.patch(url, { status: "approved" });
    ctx.invalidateList?.();
    toast({ title: "Approved", description: `${ctx.entityType} has been approved.` });
  } catch (err: any) {
    toast({ title: "Response failed", description: err.message, variant: "destructive" });
  }
}

async function doDownloadAll(ctx: RowActionContext<RowEntityBase>) {
  try {
    const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}/attachments/download-all`;
    toast({ title: "Downloading...", description: "Preparing files for download." });
    await downloadBlob(url);
  } catch (err: any) {
    const msg = err.message || "";
    if (msg.includes("404") || msg.includes("No attachments") || msg.includes("not yet uploaded")) {
      toast({ title: "No files", description: "No downloadable attachments found for this item.", variant: "destructive" });
    } else {
      toast({ title: "Download failed", description: msg, variant: "destructive" });
    }
  }
}

async function doCreateRevision(ctx: RowActionContext<RowEntityBase>) {
  try {
    const dupUrl = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}/duplicate`;
    const dup: any = await api.post(dupUrl, {});
    if (dup && dup.id) {
      await api.patch(`${basePath(ctx.entityType)}/${dup.id}`, { status: "draft" });
    }
    ctx.invalidateList?.();
    toast({ title: "Revision created", description: "A new revision has been created in draft status." });
  } catch (err: any) {
    toast({ title: "Create revision failed", description: err.message, variant: "destructive" });
  }
}

const icon = (Icon: any) => createElement(Icon, { className: "h-4 w-4" });

function baseActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return [
    {
      id: "edit",
      label: "Edit",
      order: 10,
      group: "primary",
      icon: icon(Pencil),
      isVisible: (ctx) => allowByDefault(ctx as any, "edit"),
      run: async (ctx) => ctx.openDrawer?.("edit"),
    },
    {
      id: "view",
      label: "View",
      order: 20,
      group: "primary",
      icon: icon(Eye),
      isVisible: () => true,
      run: async (ctx) => ctx.openDrawer?.("view"),
    },
    {
      id: "duplicate",
      label: "Duplicate",
      order: 50,
      group: "workflow",
      icon: icon(Copy),
      isVisible: (ctx) => allowByDefault(ctx as any, "edit") && capabilities[ctx.entityType].duplicate,
      run: doDuplicate,
    },
    {
      id: "send",
      label: "Send",
      order: 40,
      group: "workflow",
      icon: icon(Send),
      isVisible: (ctx) => {
        const s = statusLower(ctx.entity);
        return s === "draft" || s === "open";
      },
      run: doSend,
    },
    {
      id: "close",
      label: "Close",
      order: 60,
      group: "workflow",
      icon: icon(CheckCircle2),
      isVisible: (ctx) => !isClosedStatus(ctx.entity) && capabilities[ctx.entityType].close && allowByDefault(ctx as any, "close"),
      run: doClose,
    },
    {
      id: "reopen",
      label: "Reopen",
      order: 70,
      group: "workflow",
      icon: icon(XCircle),
      isVisible: (ctx) => isClosedStatus(ctx.entity) && capabilities[ctx.entityType].reopen && allowByDefault(ctx as any, "reopen"),
      run: doReopen,
    },
    {
      id: "downloadAll",
      label: "Download",
      order: 80,
      group: "files",
      icon: icon(Download),
      isVisible: (ctx) => capabilities[ctx.entityType].downloadAll,
      run: doDownloadAll,
    },
    {
      id: "delete",
      label: "Delete",
      order: 100,
      group: "danger",
      destructive: true,
      icon: icon(Trash2),
      isVisible: (ctx) => capabilities[ctx.entityType].delete && allowByDefault(ctx as any, "delete"),
      run: doDelete,
    },
  ];
}

function submittalActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return [
    ...baseActions<E>(),
    {
      id: "preview",
      label: "Preview",
      order: 25,
      group: "primary",
      icon: icon(FileText),
      isVisible: () => true,
      run: async (ctx) => ctx.openDrawer?.("view"),
    },
    {
      id: "createRevision",
      label: "Create Revision",
      order: 55,
      group: "workflow",
      icon: icon(PlusCircle),
      isVisible: () => true,
      run: doCreateRevision,
    },
    {
      id: "response",
      label: "Approve",
      order: 56,
      group: "workflow",
      icon: icon(CheckCircle2),
      isVisible: (ctx) => {
        const s = statusLower(ctx.entity);
        return s === "submitted" || s === "open" || s === "in_progress";
      },
      run: doResponse,
    },
    {
      id: "reject",
      label: "Reject",
      order: 57,
      group: "workflow",
      icon: icon(XCircle),
      isVisible: (ctx) => {
        const s = statusLower(ctx.entity);
        return s === "submitted" || s === "open" || s === "in_progress";
      },
      run: doReject,
    },
  ];
}

function taskActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return baseActions<E>();
}

function rfiActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return [
    ...baseActions<E>(),
    {
      id: "response",
      label: "Mark Answered",
      order: 56,
      group: "workflow",
      icon: icon(CheckCircle2),
      isVisible: (ctx) => {
        const s = statusLower(ctx.entity);
        return s === "open" || s === "draft";
      },
      run: async (ctx) => {
        try {
          const url = `${basePath(ctx.entityType)}/${idStr(ctx.entity)}`;
          await api.patch(url, { status: "answered" });
          ctx.invalidateList?.();
          toast({ title: "Answered", description: "RFI marked as answered." });
        } catch (err: any) {
          toast({ title: "Failed", description: err.message, variant: "destructive" });
        }
      },
    },
  ];
}

function purchaseOrderActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return [
    ...baseActions<E>(),
    {
      id: "response",
      label: "Approve",
      order: 56,
      group: "workflow",
      icon: icon(CheckCircle2),
      isVisible: (ctx) => {
        const s = statusLower(ctx.entity);
        return s === "draft" || s === "issued";
      },
      run: doResponse,
    },
  ];
}

function changeOrderActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return [
    ...baseActions<E>(),
    {
      id: "response",
      label: "Approve",
      order: 56,
      group: "workflow",
      icon: icon(CheckCircle2),
      isVisible: (ctx) => {
        const s = statusLower(ctx.entity);
        return s === "draft" || s === "pending";
      },
      run: doResponse,
    },
    {
      id: "reject",
      label: "Reject",
      order: 57,
      group: "workflow",
      icon: icon(XCircle),
      isVisible: (ctx) => {
        const s = statusLower(ctx.entity);
        return s === "draft" || s === "pending";
      },
      run: doReject,
    },
  ];
}

function invoiceActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return [
    ...baseActions<E>().filter((a) => !["close", "reopen"].includes(String(a.id))),
    {
      id: "response",
      label: "Approve",
      order: 56,
      group: "workflow",
      icon: icon(CheckCircle2),
      isVisible: (ctx) => {
        const s = statusLower(ctx.entity);
        return s === "draft" || s === "submitted";
      },
      run: doResponse,
    },
  ];
}

function bidProjectActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return baseActions<E>().filter((a) => !["close", "reopen"].includes(String(a.id)));
}

function projectActions<E extends RowEntityBase>(): RowActionWithGroup<E>[] {
  return baseActions<E>().filter((a) => !["close", "reopen"].includes(String(a.id)));
}

export const actionRegistry: Record<EntityType, RowActionWithGroup<any>[]> = {
  task: taskActions(),
  submittal: submittalActions(),
  rfi: rfiActions(),
  purchaseOrder: purchaseOrderActions(),
  changeOrder: changeOrderActions(),
  invoice: invoiceActions(),
  bidProject: bidProjectActions(),
  project: projectActions(),
};

export const defaultListQueryKey = (entityType: EntityType) => listQueryKeys[entityType];
