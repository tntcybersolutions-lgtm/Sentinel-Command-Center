import { routeAlias, nonNavigableIds, dynamicRoutePatterns } from "./route-alias";
import type { NavV2Group, NavV2Item } from "./nav-v2";

const NAV_V2_LS_KEY = "nav_v2";

export function isNavV2Enabled(): boolean {
  if (typeof window !== "undefined") {
    const lsVal = localStorage.getItem(NAV_V2_LS_KEY);
    if (lsVal === "1" || lsVal === "true") return true;
    if (lsVal === "0" || lsVal === "false") return false;
  }

  const envVal = import.meta.env.VITE_NAV_V2;
  if (envVal === "1" || envVal === "true") return true;
  if (envVal === "0" || envVal === "false") return false;

  return import.meta.env.DEV;
}

export function resolveRoute(item: NavV2Item): string | null {
  if (item.hidden) return null;
  if (nonNavigableIds.has(item.id)) return null;

  const route = routeAlias[item.routeKey];
  if (!route) return null;

  for (const pattern of dynamicRoutePatterns) {
    if (route.startsWith(pattern)) return null;
  }

  return route;
}

export function getVisibleItems(items: NavV2Item[]): (NavV2Item & { resolvedRoute: string })[] {
  const result: (NavV2Item & { resolvedRoute: string })[] = [];
  for (const item of items) {
    if (item.hidden) continue;
    const route = resolveRoute(item);
    if (route) {
      result.push({ ...item, resolvedRoute: route });
    }
  }
  return result;
}

export function filterNavGroups(
  groups: NavV2Group[],
  searchQuery: string,
): { group: NavV2Group; visibleItems: (NavV2Item & { resolvedRoute: string })[] }[] {
  const query = searchQuery.trim().toLowerCase();
  const result: { group: NavV2Group; visibleItems: (NavV2Item & { resolvedRoute: string })[] }[] = [];

  for (const group of groups) {
    let visible = getVisibleItems(group.items);
    if (query) {
      visible = visible.filter(
        (item) =>
          item.label.toLowerCase().includes(query) ||
          group.label.toLowerCase().includes(query),
      );
    }
    if (visible.length > 0) {
      result.push({ group, visibleItems: visible });
    }
  }

  return result;
}

export function setNavV2Override(enabled: boolean | null): void {
  if (enabled === null) {
    localStorage.removeItem(NAV_V2_LS_KEY);
  } else {
    localStorage.setItem(NAV_V2_LS_KEY, enabled ? "1" : "0");
  }
}
