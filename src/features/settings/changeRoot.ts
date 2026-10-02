import { resolveUnsaved } from "@/features/editor/unsavedGuard";
import { refreshTrashCount } from "@/features/trash/deleteCoordinator";
import { ipc } from "@/lib/ipc";
import { useSettingsStore } from "@/stores/settingsStore";
import { useTabsStore } from "@/stores/tabsStore";
import { useTreeStore } from "@/stores/treeStore";
import { useUiStore } from "@/stores/uiStore";

export async function changeRootFlow(currentRoot: string): Promise<boolean> {
  const selected = await ipc.pickDirectory(currentRoot);
  if (!selected || selected === currentRoot) return false;
  await ipc.validateRootDir(selected);
  if (!await useUiStore.getState().confirm("settings.changeRootTitle", "settings.changeRootWarning", { path: selected })) return false;

  const ids = useTabsStore.getState().tabs.map((tab) => tab.noteId);
  const resolution = await resolveUnsaved(ids);
  if (resolution.cancelled || ids.some((id) => !resolution.resolved.has(id) || useTabsStore.getState().isDirty(id))) return false;
  for (const id of ids) {
    if (!await useTabsStore.getState().close(id)) return false;
  }
  const settings = await ipc.setRootDir(selected);
  useSettingsStore.setState({ settings });
  useTreeStore.setState({ selected: null, expanded: new Set<string>() });
  await useTreeStore.getState().refresh();
  await refreshTrashCount();
  return true;
}
