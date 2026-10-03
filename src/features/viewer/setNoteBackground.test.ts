import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, expect, it } from "vitest";
import { setNoteBackground } from "./setNoteBackground";
import { readNoteBackground } from "./noteAppearance";
import { decideExternalChange } from "@/features/editor/externalChange";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

const base = { html: '<html><head></head><body><main id="htnote-content"><p>Text</p></main></body></html>', css: "author", js: "run()", contentHash: "old" };

beforeEach(resetTabsStoreForTests);

it("saves read-mode appearance through save_note with a hash and ignores its watcher event", async () => {
  const calls: string[] = [];
  mockIPC((command, args) => {
    calls.push(command);
    if (command === "read_note") return base;
    if (command === "save_note") {
      const payload = (args as Record<string, unknown>).payload as { html: string; css: string; js: string; expectedHash: string };
      expect(readNoteBackground(payload.html)).toBe("sepia");
      expect(payload).toMatchObject({ css: "author", js: "run()", expectedHash: "old" });
      return { contentHash: "new" };
    }
  });
  useTabsStore.getState().openNote("a");
  expect(await setNoteBackground("a", "sepia")).toBe(true);
  const doc = useTabsStore.getState().tabs[0].doc;
  expect(doc.mode).toBe("view");
  expect(doc.dirty).toBe(false);
  expect(doc.base?.contentHash).toBe("new");
  expect(decideExternalChange(doc, "new", false)).toBe("ignore");
  expect(calls).toEqual(["read_note", "save_note", "delete_draft"]);
});

it("updates only the edit draft and cancel restores the old background", async () => {
  const calls: string[] = [];
  mockIPC((command) => { calls.push(command); });
  const store = useTabsStore.getState();
  store.openNote("a");
  store.enterEdit("a", base);
  expect(await setNoteBackground("a", "mint")).toBe(true);
  expect(readNoteBackground(useTabsStore.getState().tabs[0].doc.draft!.html)).toBe("mint");
  expect(useTabsStore.getState().tabs[0].doc.dirty).toBe(true);
  expect(calls).toEqual([]);
  store.cancelEdit("a");
  expect(readNoteBackground(useTabsStore.getState().tabs[0].doc.base!.html)).toBe("");
});

it("retains a failed save as a draft and refuses conflicted edits", async () => {
  mockIPC((command) => {
    if (command === "read_note") return base;
    if (command === "save_note") throw { code: "IO_ERROR" };
  });
  const store = useTabsStore.getState();
  store.openNote("a");
  expect(await setNoteBackground("a", "rose")).toBe(false);
  expect(useTabsStore.getState().tabs[0].doc.dirty).toBe(true);
  store.markConflict("a", "external");
  expect(await setNoteBackground("a", "sky")).toBe(false);
  expect(readNoteBackground(useTabsStore.getState().tabs[0].doc.draft!.html)).toBe("rose");
});
