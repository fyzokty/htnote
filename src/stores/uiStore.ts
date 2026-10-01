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

interface UiState {
  unsavedDialog: { noteIds: string[]; resolve: (decision: UnsavedDecision) => void } | null;
  openUnsavedDialog: (noteIds: string[], resolve: (decision: UnsavedDecision) => void) => void;
  closeUnsavedDialog: () => void;
  sidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
  toasts: Toast[];
  pushToast: (toast: ToastInput) => number;
  dismissToast: (id: number) => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  unsavedDialog: null,
  openUnsavedDialog: (noteIds, resolve) => set({ unsavedDialog: { noteIds, resolve } }),
  closeUnsavedDialog: () => set({ unsavedDialog: null }),
  sidebarVisible: true,
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
