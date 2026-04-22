import type { ActionId, RowActionContext } from "@/features/row-actions/types";

export function getEffectiveRole(): "admin" | "manager" | "user" {
  return "admin";
}

export function canAction(ctx: RowActionContext, action: ActionId): boolean {
  const serverFlag = ctx.entity._perm?.[action];
  if (typeof serverFlag === "boolean") return serverFlag;

  const status = (ctx.entity.status ?? "").toLowerCase();
  if (action === "reopen") return status === "closed";
  if (action === "close") return status !== "closed";

  if (ctx.role === "admin") return true;

  if (action === "delete") return false;
  return true;
}
