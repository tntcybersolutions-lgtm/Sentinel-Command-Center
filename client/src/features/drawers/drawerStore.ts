import { create } from "zustand";
import type { EntityId, EntityType } from "@/features/row-actions/types";

type DrawerState = {
  isOpen: boolean;
  entityType: EntityType | null;
  entityId: EntityId | null;
  mode: "view" | "edit";
  open: (args: { entityType: EntityType; entityId: EntityId; mode: "view" | "edit" }) => void;
  close: () => void;
};

export const useEntityDrawerStore = create<DrawerState>((set) => ({
  isOpen: false,
  entityType: null,
  entityId: null,
  mode: "view",
  open: ({ entityType, entityId, mode }) => set({ isOpen: true, entityType, entityId, mode }),
  close: () => set({ isOpen: false }),
}));
