import { create } from "zustand";

import { useSettingsStore } from "@/stores/settingsStore";
import type { UnsavedDecision } from "@/features/editor/unsavedGuard";

export interface ToastAction {
  labelKey: string;
  onClick: () => void;
}

export interface ToastInput {
  kind: "info" | "success" | "error";
  messageKey: string;
  params?: Record<string, string | number>;
  action?: ToastAction;
}

export interface Toast extends ToastInput {
  id: number;
}

const toastTimers = new Map<number, ReturnType<typeof setTimeout>>();
let nextToastId = 0;

interface ConfirmOptions {
  variant: "primary" | "danger";
  labelKey: string;
}

interface UiState {
  searchOpen: boolean;
  lastSearchQuery: string;
  openSearch: () => void;
  closeSearch: () => void;
  setLastSearchQuery: (query: string) => void;
  unsavedDialog: { noteIds: string[]; resolve: (decision: UnsavedDecision) => void; purpose?: "export" } | null;
  openUnsavedDialog: (noteIds: string[], resolve: (decision: UnsavedDecision) => void, purpose?: "export") => void;
  closeUnsavedDialog: () => void;
  trashCount: number;
  trashRevision: number;
  setTrashCount: (count: number) => void;
  confirmDialog: { titleKey: string; messageKey: string; params?: Record<string, string | number>; options?: ConfirmOptions; resolve: (confirmed: boolean) => void } | null;
  confirm: (titleKey: string, messageKey: string, params?: Record<string, string | number>, options?: ConfirmOptions) => Promise<boolean>;
  closeConfirmDialog: () => void;
  sidebarVisible: boolean;
  exportBusy: boolean;
  setExportBusy: (busy: boolean) => void;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  toasts: Toast[];
  pushToast: (toast: ToastInput) => number;
  dismissToast: (id: number) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  searchOpen: false,
  lastSearchQuery: "",
  openSearch: () => set({ searchOpen: true }),
  closeSearch: () => set({ searchOpen: false }),
  setLastSearchQuery: (lastSearchQuery) => set({ lastSearchQuery }),
  unsavedDialog: null,
  openUnsavedDialog: (noteIds, resolve, purpose) => set({ unsavedDialog: { noteIds, resolve, purpose } }),
  closeUnsavedDialog: () => set({ unsavedDialog: null }),
  trashCount: 0,
  trashRevision: 0,
  setTrashCount: (trashCount) => set((state) => ({ trashCount, trashRevision: state.trashRevision + 1 })),
  confirmDialog: null,
  confirm: (titleKey, messageKey, params, options) => new Promise<boolean>((resolve) => {
    set({ confirmDialog: { titleKey, messageKey, params, options, resolve } });
  }),
  closeConfirmDialog: () => set({ confirmDialog: null }),
  sidebarVisible: true,
  exportBusy: false,
  setExportBusy: (exportBusy) => set({ exportBusy }),
  toasts: [],
  pushToast: (input) => {
    const id = ++nextToastId;
    const toast = { ...input, id };
    const toasts = [...get().toasts, toast];
    if (toasts.length > 3) {
      const oldest = toasts.shift();
      if (oldest) {
        clearTimeout(toastTimers.get(oldest.id));
        toastTimers.delete(oldest.id);
      }
    }
    set({ toasts });
    toastTimers.set(id, setTimeout(() => get().dismissToast(id), input.kind === "error" ? 8000 : 4000));
    return id;
  },
  dismissToast: (id) => {
    clearTimeout(toastTimers.get(id));
    toastTimers.delete(id);
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  toggleSidebar: () => {
    const visible = !get().sidebarVisible;
    set({ sidebarVisible: visible });
    void useSettingsStore.getState().update({ sidebarVisible: visible }).catch(() => {
      set({ sidebarVisible: useSettingsStore.getState().settings?.sidebarVisible ?? !visible });
    });
  },
}));
