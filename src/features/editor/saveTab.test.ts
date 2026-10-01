import { mockIPC } from "@tauri-apps/api/mocks";
import { beforeEach, expect, it } from "vitest";

import { saveTab } from "@/features/editor/saveTab";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

beforeEach(resetTabsStoreForTests);

it("deletes the recovery draft after a successful direct save", async () => {
  const commands: string[] = [];
  mockIPC((command, args) => {
    commands.push(command);
    if (command === "save_note") {
      expect(args).toMatchObject({ id: "a", payload: { html: "new", expectedHash: "disk-hash" } });
      return { contentHash: "saved-hash" };
    }
  });
  const tabs = useTabsStore.getState();
  tabs.openNote("a");
  tabs.enterEdit("a", { html: "old", css: "", js: "", contentHash: "disk-hash" }, "code");
  tabs.updateDraft("a", { html: "new" });

  expect(await saveTab("a")).toBe(true);
  expect(commands).toEqual(["save_note", "delete_draft"]);
  expect(useTabsStore.getState().isDirty("a")).toBe(false);
});
