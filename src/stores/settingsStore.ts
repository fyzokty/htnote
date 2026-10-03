import { create } from "zustand";

import { ipc } from "@/lib/ipc";
import type { Settings, SettingsPatch } from "@/lib/types";

interface SettingsState {
  settings: Settings | null;
  status: "idle" | "loading" | "ready" | "error";
  load: () => Promise<void>;
  update: (patch: SettingsPatch) => Promise<Settings>;
}

let inFlight: Promise<unknown> | null = null;
const pendingPatches: SettingsPatch[] = [];

export function resetSettingsQueueForTests() {
  inFlight = null;
  pendingPatches.length = 0;
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
  update(patch) {
    const current = get().settings;
    if (!current) throw new Error("Settings are not loaded");
    const previous = current;
    set({ settings: { ...previous, ...patch } });
    pendingPatches.push(patch);

    const execute = async (): Promise<Settings> => {
      try {
        const serverResult = await ipc.updateSettings(patch);
        const index = pendingPatches.indexOf(patch);
        if (index !== -1) pendingPatches.splice(index, 1);
        let merged = serverResult;
        for (const pending of pendingPatches) {
          merged = { ...merged, ...pending };
        }
        set({ settings: merged });
        return serverResult;
      } catch (error) {
        const index = pendingPatches.indexOf(patch);
        if (index !== -1) pendingPatches.splice(index, 1);
        let reverted = previous;
        for (const pending of pendingPatches) {
          reverted = { ...reverted, ...pending };
        }
        set({ settings: reverted });
        throw error;
      }
    };

    const queuedPromise = inFlight ? inFlight.then(execute, execute) : execute();
    const tail = queuedPromise.catch(() => {}).finally(() => {
      if (inFlight === tail) inFlight = null;
    });
    inFlight = tail;
    return queuedPromise;
  },
}));
