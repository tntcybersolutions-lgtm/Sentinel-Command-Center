import { create } from "zustand";

type ConfirmState = {
  isOpen: boolean;
  message: string;
  resolve: ((value: boolean) => void) | null;
  open: (message: string) => Promise<boolean>;
  confirm: () => void;
  cancel: () => void;
};

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  isOpen: false,
  message: "",
  resolve: null,
  open: (message: string) =>
    new Promise<boolean>((resolve) => {
      set({ isOpen: true, message, resolve });
    }),
  confirm: () => {
    get().resolve?.(true);
    set({ isOpen: false, message: "", resolve: null });
  },
  cancel: () => {
    get().resolve?.(false);
    set({ isOpen: false, message: "", resolve: null });
  },
}));

export async function confirmDestructive(message: string): Promise<boolean> {
  return useConfirmStore.getState().open(message);
}

export async function confirm(opts: {
  title?: string;
  description?: string;
  confirmText?: string;
  variant?: string;
}): Promise<boolean> {
  const msg = opts.description || opts.title || "Are you sure?";
  return useConfirmStore.getState().open(msg);
}
