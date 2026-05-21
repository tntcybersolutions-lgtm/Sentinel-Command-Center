/**
 * Sprint L3-B â useProjectFavorites
 *
 * Pin/unpin a project to your favorites. Favorites are stored in
 * localStorage so they persist across sessions and work offline.
 *
 * The favorite set is just an array of project IDs in pinned-order
 * (most-recently-pinned first). Pages render favorites in their own
 * section above the rest of the list.
 *
 * Usage:
 *   const { favorites, isFavorite, toggle, sortFavoritesFirst } =
 *     useProjectFavorites();
 *   const ordered = sortFavoritesFirst(allProjects, (p) => p.id);
 *
 * Storage key: sentinel:projectFavorites
 */

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sentinel:projectFavorites";
const MAX_FAVORITES = 20;

function loadFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveFavorites(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* quota / private mode â ignore */
  }
  // Broadcast so other tabs/components stay in sync
  try {
    window.dispatchEvent(new CustomEvent("sentinel:favoritesChanged"));
  } catch {
    /* SSR â ignore */
  }
}

export function useProjectFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(loadFavorites());

    const handler = () => setFavorites(loadFavorites());
    window.addEventListener("sentinel:favoritesChanged", handler);
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) handler();
    });
    return () => {
      window.removeEventListener("sentinel:favoritesChanged", handler);
    };
  }, []);

  const isFavorite = useCallback(
    (id: string) => favorites.includes(id),
    [favorites],
  );

  const toggle = useCallback(
    (id: string) => {
      const next = favorites.includes(id)
        ? favorites.filter((f) => f !== id)
        : [id, ...favorites].slice(0, MAX_FAVORITES);
      setFavorites(next);
      saveFavorites(next);
      // Haptic ping on toggle
      try {
        if ("vibrate" in navigator) (navigator as any).vibrate(10);
      } catch {
        /* ignore */
      }
    },
    [favorites],
  );

  /**
   * Returns a new array where favorited items are first (in pinned order),
   * followed by the rest of the input list in its original order.
   */
  const sortFavoritesFirst = useCallback(
    <T>(items: T[], getId: (item: T) => string): T[] => {
      const favSet = new Set(favorites);
      const favIdx = new Map<string, number>();
      favorites.forEach((id, i) => favIdx.set(id, i));

      const favs: T[] = [];
      const rest: T[] = [];
      for (const item of items) {
        if (favSet.has(getId(item))) favs.push(item);
        else rest.push(item);
      }
      favs.sort(
        (a, b) =>
          (favIdx.get(getId(a)) ?? Infinity) -
          (favIdx.get(getId(b)) ?? Infinity),
      );
      return [...favs, ...rest];
    },
    [favorites],
  );

  /**
   * Returns just the favorited items in pinned order. Use for rendering a
   * dedicated "Pinned" section.
   */
  const onlyFavorites = useCallback(
    <T>(items: T[], getId: (item: T) => string): T[] => {
      const favIdx = new Map<string, number>();
      favorites.forEach((id, i) => favIdx.set(id, i));
      return items
        .filter((it) => favIdx.has(getId(it)))
        .sort(
          (a, b) =>
            (favIdx.get(getId(a)) ?? Infinity) -
            (favIdx.get(getId(b)) ?? Infinity),
        );
    },
    [favorites],
  );

  return {
    favorites,
    count: favorites.length,
    isFavorite,
    toggle,
    sortFavoritesFirst,
    onlyFavorites,
  };
}

export default useProjectFavorites;
