import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TagInput } from "./TagInput";
import { TagColorPicker } from "./TagColorPicker";
import { reconcileTagColors, setTagColor, tagColor } from "./tagColors";
import { ipc } from "@/lib/ipc";
import type { Settings } from "@/lib/types";
import { resetSettingsQueueForTests, useSettingsStore } from "@/stores/settingsStore";
import { useTreeStore } from "@/stores/treeStore";
import { TagsSection } from "./TagsSection";

const defaults: Settings = {
  rootDir: null, lastExportDir: null, theme: "system", language: null, sidebarWidth: 260, sidebarVisible: true,
  tabSizing: "fixed", contentWidth: "comfortable", editorSplitRatio: 50, editorLivePreview: true,
  backlinksExpanded: true, openTabs: [], activeTab: null, expandedFolders: [], onboardingDone: false, tagColors: {},
};

afterEach(() => { useSettingsStore.setState({ settings: null }); resetSettingsQueueForTests(); vi.restoreAllMocks(); });

describe("global tag colors", () => {
  it("persists and reloads normalized global names with the settings pipeline", async () => {
    const settings = { ...defaults };
    useSettingsStore.setState({ settings });
    const update = vi.spyOn(ipc, "updateSettings").mockImplementation(async (patch) => ({ ...settings, ...patch }));
    await setTagColor("İş", "blue");
    expect(update).toHaveBeenCalledWith({ tagColors: { is: "blue" } });
    const saved = useSettingsStore.getState().settings!;
    useSettingsStore.setState({ settings: null, status: "idle" });
    vi.spyOn(ipc, "getSettings").mockResolvedValue(saved);
    await useSettingsStore.getState().load();
    expect(tagColor(useSettingsStore.getState().settings?.tagColors, "İŞ")).toBe("blue");
    await setTagColor("iş", "");
    expect(useSettingsStore.getState().settings?.tagColors).toEqual({});
  });

  it("keeps shared colors and migrates the last renamed tag, then cleans deletion", () => {
    expect(reconcileTagColors({ is: "blue" }, ["İş"], ["Yeni"], ["Yeni"])) .toEqual({ yeni: "blue" });
    expect(reconcileTagColors({ is: "blue" }, ["İş"], [], ["iş"])) .toEqual({ is: "blue" });
    expect(reconcileTagColors({ is: "blue" }, ["İş"], [], [])) .toEqual({});
  });

  it("renders themed chips and opens a global tag palette", () => {
    useSettingsStore.setState({ settings: { ...defaults, tagColors: { is: "blue" } } });
    render(<><TagInput tags={["İş"]} suggestions={[]} onChange={vi.fn()} /><TagColorPicker tag="İş" /></>);
    const chip = screen.getByText("İş");
    expect(chip.style.color).toBe("var(--app-color-blue)");
    expect(chip.querySelector(".htnote-tag-dot")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "İş etiketinin rengi" }));
    expect(screen.getByRole("button", { name: "Mavi" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders sidebar colors and keeps color selection separate from filtering", () => {
    useSettingsStore.setState({ settings: { ...defaults, tagColors: { work: "red" } } });
    useTreeStore.setState({ tree: [{ type: "note", id: "a", title: "A", relPath: "A", isFavorite: false, tags: ["Work"], updatedAt: "" }], filterTag: null });
    render(<TagsSection />);
    const tag = screen.getByRole("button", { name: /^Work\s*1$/ });
    expect(tag.style.color).toBe("var(--app-color-red)");
    fireEvent.click(screen.getByRole("button", { name: "Work etiketinin rengi" }));
    expect(useTreeStore.getState().filterTag).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.click(tag);
    expect(useTreeStore.getState().filterTag).toBe("Work");
  });
});
