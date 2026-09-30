import { create } from "zustand";

import { ipc } from "@/lib/ipc";
import type { Settings, SettingsPatch } from "@/lib/types";

interface SettingsState {
  settings: Settings | null;
  status: "idle" | "loading" | "ready" | "error";
  load: () => Promise<void>;
  update: (patch: SettingsPatch) => Promise<Settings>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: null,
  status: "idle",
  async load() {
    if (get().status === "loading" || get().status === "ready") return;
    set({ status: "loading" });
    try {
      const settings = await ipc.getSettings();
      set({ settings, status: "ready" });
    } catch (error) {
      set({ status: "error" });
      throw error;
    }
  },
  async update(patch) {
    const previous = get().settings;
    if (!previous) throw new Error("Settings are not loaded");
    set({ settings: { ...previous, ...patch } });
    try {
      const settings = await ipc.updateSettings(patch);
      set({ settings });
      return settings;
    } catch (error) {
      set({ settings: previous });
      throw error;
    }
  },
}));
