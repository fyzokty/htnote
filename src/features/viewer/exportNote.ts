import { flushEditor, saveTab } from "@/features/editor/saveTab";
import type { UnsavedDecision } from "@/features/editor/unsavedGuard";
import { requestPrint } from "@/features/viewer/bridgeHost";
import { ipc } from "@/lib/ipc";
import { getPlatform } from "@/lib/platform";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";

export type ExportFormat = "pdf" | "html" | "zip";

export function exportFileName(title: string, format: ExportFormat): string {
  let name = Array.from(title, (character) => /[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? "-" : character).join("").trim().replace(/^[. ]+|[. ]+$/g, "");
  name = Array.from(name).slice(0, 120).join("").replace(/[. ]+$/g, "");
  if (!name) name = "Adsız Not";
  const stem = name.split(".")[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem)) name = `${name}_`;
  return `${name}.${format}`;
}

export function shouldExport(dirty: boolean, decision: UnsavedDecision, saved: boolean): boolean {
  return !dirty || decision === "discard" || (decision === "save" && saved);
}

export function canExportPdf(): boolean {
  return true;
}

export function pdfMode(): "webview2" | "print" {
  return getPlatform() === "windows" ? "webview2" : "print";
}

async function checkUnsaved(id: string): Promise<boolean> {
  flushEditor(id);
  if (!useTabsStore.getState().isDirty(id)) return true;
  const decision = await new Promise<UnsavedDecision>((resolve) => {
    useUiStore.getState().openUnsavedDialog([id], (choice) => {
      useUiStore.getState().closeUnsavedDialog();
      resolve(choice);
    }, "export");
  });
  const saved = decision === "save" ? await saveTab(id) && !useTabsStore.getState().isDirty(id) : false;
  return shouldExport(true, decision, saved);
}

export async function exportNote(id: string, title: string, format: ExportFormat): Promise<void> {
  const ui = useUiStore.getState();
  if (ui.exportBusy) return;
  ui.setExportBusy(true);
  try {
    if (!await checkUnsaved(id)) return;
    if (format === "pdf" && pdfMode() === "print") {
      if (!requestPrint(id)) useUiStore.getState().pushToast({ kind: "error", messageKey: "errors.UNKNOWN" });
      return;
    }
    const folder = useSettingsStore.getState().settings?.lastExportDir;
    const name = exportFileName(title, format);
    const defaultPath = folder ? `${folder.replace(/[\\/]$/, "")}${folder.includes("\\") ? "\\" : "/"}${name}` : name;
    const target = await ipc.saveExportFile(defaultPath, format);
    if (!target) return;
    const separator = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
    const dir = separator === 0 ? target.slice(0, 1) : target.slice(0, separator);
    const result = format === "pdf" ? await ipc.exportPdf(id, target)
      : format === "html" ? await ipc.exportSingleHtml(id, target) : await ipc.exportZip(id, target);
    if (dir && dir !== folder && useSettingsStore.getState().settings) {
      void useSettingsStore.getState().update({ lastExportDir: dir }).catch(() => {});
    }
    useUiStore.getState().pushToast({ kind: "success", messageKey: "export.exported", action: {
      labelKey: "export.showInFolder", onClick: () => { void ipc.revealExportFile(target).catch((error: unknown) => {
        const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "UNKNOWN";
        useUiStore.getState().pushToast({ kind: "error", messageKey: `errors.${code}` });
      }); },
    } });
    if (result.warnings.includes("LARGE_OUTPUT")) useUiStore.getState().pushToast({ kind: "info", messageKey: "export.largeOutput" });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "UNKNOWN";
    useUiStore.getState().pushToast({ kind: "error", messageKey: `errors.${code}` });
  } finally {
    useUiStore.getState().setExportBusy(false);
  }
}
