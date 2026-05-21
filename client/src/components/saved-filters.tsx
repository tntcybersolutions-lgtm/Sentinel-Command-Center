/**
 * Sprint L3-A â Saved Filters
 *
 * Reusable component for any list page with filter state. Persists named
 * filter combinations to localStorage and renders them as tap-to-apply chips
 * above the filter row.
 *
 * Usage:
 *   <SavedFilters
 *     filterKey="punch"
 *     currentState={{ severity: filterSeverity, assignee: filterAssignee, q: searchText }}
 *     onApply={(s) => { setFilterSeverity(s.severity); setFilterAssignee(s.assignee); setSearchText(s.q); }}
 *   />
 *
 * Storage key: sentinel:savedFilters:<filterKey> â Array<{ id, name, state }>
 */

import { useEffect, useState, useCallback } from "react";
import { Bookmark, BookmarkPlus, X } from "lucide-react";

export interface SavedFilter<T = Record<string, unknown>> {
  id: string;
  name: string;
  state: T;
  createdAt: number;
}

interface SavedFiltersProps<T extends Record<string, unknown>> {
  /** Storage namespace â e.g. "punch", "daily-log", "rfi". */
  filterKey: string;
  /** Current filter state from the parent. Used to seed the Save dialog. */
  currentState: T;
  /** Called when user taps a saved chip â parent applies the state to its filters. */
  onApply: (state: T) => void;
  /** Optional className for the wrapper. */
  className?: string;
}

const STORAGE_PREFIX = "sentinel:savedFilters";

function loadFilters<T>(key: string): SavedFilter<T>[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}:${key}`);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveFilters<T>(key: string, filters: SavedFilter<T>[]) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}:${key}`, JSON.stringify(filters));
  } catch {
    /* quota / private mode â ignore */
  }
}

export function SavedFilters<T extends Record<string, unknown>>({
  filterKey,
  currentState,
  onApply,
  className = "",
}: SavedFiltersProps<T>) {
  const [filters, setFilters] = useState<SavedFilter<T>[]>([]);
  const [showSave, setShowSave] = useState(false);
  const [name, setName] = useState("");

  // Load on mount
  useEffect(() => {
    setFilters(loadFilters<T>(filterKey));
  }, [filterKey]);

  const handleSave = useCallback(() => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next: SavedFilter<T> = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      state: currentState,
      createdAt: Date.now(),
    };
    const updated = [next, ...filters].slice(0, 20); // cap at 20
    setFilters(updated);
    saveFilters(filterKey, updated);
    setName("");
    setShowSave(false);
  }, [name, currentState, filters, filterKey]);

  const handleDelete = useCallback(
    (id: string) => {
      const updated = filters.filter((f) => f.id !== id);
      setFilters(updated);
      saveFilters(filterKey, updated);
    },
    [filters, filterKey],
  );

  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
      data-testid="saved-filters"
    >
      {/* Saved chips */}
      {filters.map((f) => (
        <div
          key={f.id}
          className="group inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800"
          data-testid={`saved-filter-chip-${f.id}`}
        >
          <button
            type="button"
            onClick={() => onApply(f.state)}
            className="flex items-center gap-1.5 outline-none"
            title="Apply this filter"
          >
            <Bookmark className="h-3 w-3 text-amber-400" />
            <span className="max-w-[140px] truncate">{f.name}</span>
          </button>
          <button
            type="button"
            onClick={() => handleDelete(f.id)}
            className="ml-0.5 rounded-full p-0.5 text-slate-500 opacity-60 hover:bg-slate-700 hover:text-rose-300 hover:opacity-100"
            aria-label={`Delete saved filter ${f.name}`}
            title="Delete"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {/* Save current */}
      {!showSave ? (
        <button
          type="button"
          onClick={() => setShowSave(true)}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-700 px-2.5 py-1 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200"
          data-testid="saved-filters-save-trigger"
          title="Save current filter as a chip"
        >
          <BookmarkPlus className="h-3 w-3" />
          <span>Save current</span>
        </button>
      ) : (
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 pl-2 pr-1 py-1 text-xs">
          <input
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              else if (e.key === "Escape") {
                setShowSave(false);
                setName("");
              }
            }}
            placeholder="Filter nameâ¦"
            maxLength={40}
            className="w-32 bg-transparent text-slate-100 placeholder:text-slate-500 outline-none"
            data-testid="saved-filters-name-input"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!name.trim()}
            className="ml-1 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-400"
            data-testid="saved-filters-save-confirm"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setShowSave(false);
              setName("");
            }}
            className="rounded-full p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
            aria-label="Cancel"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

export default SavedFilters;
