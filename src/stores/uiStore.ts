import { create } from "zustand";

import { useSettingsStore } from "@/stores/settingsStore";

interface UiState {
  sidebarVisible: boolean;
  setSidebarVisible: (visible: boolean) => void;
  toggleSidebar: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  sidebarVisible: true,
  setSidebarVisible: (visible) => set({ sidebarVisible: visible }),
  toggleSidebar: () => {
    const visible = !get().sidebarVisible;
    set({ sidebarVisible: visible });
    void useSettingsStore.getState().update({ sidebarVisible: visible }).catch(() => {
      set({ sidebarVisible: useSettingsStore.getState().settings?.sidebarVisible ?? !visible });
    });
  },
}));
