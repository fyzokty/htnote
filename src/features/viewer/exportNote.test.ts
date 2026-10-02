import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/viewer/bridgeHost", () => ({ requestPrint: vi.fn() }));

import { requestPrint } from "@/features/viewer/bridgeHost";
import { exportFileName, exportNote, shouldExport } from "@/features/viewer/exportNote";
import { ipc } from "@/lib/ipc";
import { resetTabsStoreForTests } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

beforeEach(() => {
  resetTabsStoreForTests();
  useUiStore.setState({ exportBusy: false, toasts: [] });
  vi.mocked(requestPrint).mockReset();
});

describe("exportFileName", () => {
  it("preserves Turkish characters", () => {
    expect(exportFileName("İş görüşmesi", "pdf")).toBe("İş görüşmesi.pdf");
  });

  it("replaces illegal characters and guards reserved names", () => {
    expect(exportFileName(" A/B:*? ", "html")).toBe("A-B---.html");
    expect(exportFileName("CON", "zip")).toBe("CON_.zip");
  });

  it("uses a fallback for an empty title", () => {
    expect(exportFileName(" ... ", "zip")).toBe("Adsız Not.zip");
  });
});

describe("shouldExport", () => {
  it("continues for a clean note or an explicit export choice", () => {
    expect(shouldExport(false, "cancel", false)).toBe(true);
    expect(shouldExport(true, "discard", false)).toBe(true);
    expect(shouldExport(true, "save", true)).toBe(true);
  });

  it("stops after cancel or failed save", () => {
    expect(shouldExport(true, "cancel", false)).toBe(false);
    expect(shouldExport(true, "save", false)).toBe(false);
  });
});

describe("print PDF fallback", () => {
  it.each([true, false])("%s ready frame skips save and export IPC", async (ready) => {
    const platform = Object.getOwnPropertyDescriptor(navigator, "platform");
    Object.defineProperty(navigator, "platform", { configurable: true, value: "Linux" });
    vi.mocked(requestPrint).mockReturnValue(ready);
    const save = vi.spyOn(ipc, "saveExportFile");
    const exportPdf = vi.spyOn(ipc, "exportPdf");
    try {
      await exportNote("note-id", "Note", "pdf");
      expect(requestPrint).toHaveBeenCalledWith("note-id");
      expect(save).not.toHaveBeenCalled();
      expect(exportPdf).not.toHaveBeenCalled();
      expect(useUiStore.getState().toasts.map((toast) => toast.messageKey)).toEqual(ready ? [] : ["errors.UNKNOWN"]);
      expect(useUiStore.getState().exportBusy).toBe(false);
    } finally {
      save.mockRestore();
      exportPdf.mockRestore();
      if (platform) Object.defineProperty(navigator, "platform", platform);
    }
  });
});
