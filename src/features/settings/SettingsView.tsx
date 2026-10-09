import { Select } from "@/components/ui/Select";
import { Folder, Copy, Info, Palette, Monitor, Sun, Moon, NotebookPen, ExternalLink } from "lucide-react";
import { IconButton } from "@/components/ui/IconButton";
import { TagColorPicker } from "@/features/tags/TagColorPicker";
import { deriveTags } from "@/features/tags/tags";
import { useTreeStore } from "@/stores/treeStore";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { changeRootFlow } from "@/features/settings/changeRoot";
import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import { displayPath } from "@/lib/displayPath";
import { useSettingsStore } from "@/stores/settingsStore";

const repository = "https://github.com/fyzokty/htnote";

export function SettingsView({ onShowShortcuts }: { onShowShortcuts?: () => void }) {
  const tree = useTreeStore((state) => state.tree);
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const update = useSettingsStore((state) => state.update);
  const [root, setRoot] = useState("");
  const [version, setVersion] = useState("");
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    void ipc.getRootDir().then(setRoot).catch(notifyError);
    void ipc.appInfo().then((info) => setVersion(info.version)).catch(notifyError);
  }, []);

  async function changeRoot() {
    if (changing) return;
    setChanging(true);
    try {
      if (await changeRootFlow(root)) setRoot(await ipc.getRootDir());
    } catch (error) {
      notifyError(error);
    } finally {
      setChanging(false);
    }
  }

  function external(url: string) {
    void ipc.openExternalUrl(url).catch(notifyError);
  }

  return (
    <div className="htnote-settings select-none min-h-0 w-full overflow-y-auto text-app-text">
      <div className="htnote-settings-content"><h2 className="mb-7 text-3xl font-semibold tracking-tight">{t("sidebar.settings")}</h2>
      <div className="space-y-6">
        <section aria-labelledby="settings-storage" className="htnote-settings-card">
          <div className="htnote-settings-card-header"><span className="htnote-settings-icon"><Folder className="size-5" aria-hidden /></span><div><h3 id="settings-storage" className="text-xl font-semibold">{t("settings.storage")}</h3><p className="text-xs text-app-muted">{t("settings.storageHint")}</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="htnote-settings-path"><Folder className="size-4 shrink-0 text-app-muted" aria-hidden /><p className="select-text" aria-label={t("settings.storage")}>{displayPath(root)}</p><IconButton disabled={!root} label={t("settings.copyPath")} onClick={() => void navigator.clipboard.writeText(root).catch(notifyError)}><Copy className="size-4" aria-hidden /></IconButton></div>
            <Button type="button" disabled={changing || !root} onClick={() => void changeRoot()} >{t("settings.changeRoot")}</Button>
            <Button type="button" disabled={!root} onClick={() => void ipc.revealInExplorer(root).catch(notifyError)} >{t("settings.showInFolder")}</Button>
          </div>
          <p className="mt-4 flex items-center gap-2 text-xs text-app-muted"><Info className="size-4 shrink-0 text-app-warning" aria-hidden />{t("settings.notesStay")}</p>
          <div className="htnote-settings-row"><div><span>{t("settings.autoSave")}</span><p className="text-xs text-app-muted">{t("settings.autoSaveHint")}</p></div>
            <SegmentedControl label={t("settings.autoSave")} value={settings?.autoSave === false ? "off" : "on"}
              options={(["on", "off"] as const).map((value) => ({ value, label: t(`settings.autoSaveOptions.${value}`), disabled: !settings }))}
              onChange={(value) => void update({ autoSave: value === "on" }).catch(notifyError)} />
          </div>
        </section>
        <section aria-labelledby="settings-appearance" className="htnote-settings-card">
          <div className="htnote-settings-card-header"><span className="htnote-settings-icon" data-tone="success"><Palette className="size-5" aria-hidden /></span><div><h3 id="settings-appearance" className="text-xl font-semibold">{t("settings.appearance")}</h3><p className="text-xs text-app-muted">{t("settings.appearanceHint")}</p></div></div>
          <div className="htnote-settings-row"><div><span>{t("settings.theme")}</span><p className="text-xs text-app-muted">{t("settings.themeHint")}</p></div>
            <SegmentedControl label={t("settings.theme")} value={settings?.theme ?? "system"}
              options={(["system", "light", "dark"] as const).map((value) => ({ value, label: t(`settings.${value}`), disabled: !settings, icon: value === "system" ? <Monitor className="size-4" aria-hidden /> : value === "light" ? <Sun className="size-4" aria-hidden /> : <Moon className="size-4" aria-hidden /> }))}
              onChange={(theme) => void update({ theme }).catch(notifyError)} />
          </div>
          <div className="htnote-settings-row"><div><span>{t("settings.motion")}</span><p className="text-xs text-app-muted">{t("settings.motionHint")}</p></div>
            <SegmentedControl label={t("settings.motion")} value={settings?.motion ?? "system"}
              options={(["system", "on", "off"] as const).map((value) => ({ value, label: t(`settings.motionOptions.${value}`), disabled: !settings }))}
              onChange={(motion) => void update({ motion }).catch(notifyError)} />
          </div>
          <label className="htnote-settings-row"><span><span id="settings-language-label">{t("settings.language")}</span><span className="block text-xs text-app-muted">{t("settings.languageHint")}</span></span>
            <Select aria-labelledby="settings-language-label" disabled={!settings} value={settings?.language ?? "system"}
              onChange={(value) => void update({ language: value === "system" ? null : value as "tr" | "en" }).catch(notifyError)}
              className="rounded border border-app-border bg-app-bg px-3 py-2"
              options={[{ value: "system", label: t("settings.system") }, { value: "tr", label: t("settings.turkish") }, { value: "en", label: t("settings.english") }]} />
          </label>
          <div className="htnote-settings-row">
            <div><span id="settings-tab-sizing">{t("settings.tabSizing")}</span><p className="text-xs text-app-muted">{t("settings.tabSizingHint")}</p></div>
            <SegmentedControl label={t("settings.tabSizing")} value={settings?.tabSizing ?? "fixed"}
              options={(["fixed", "fit"] as const).map((value) => ({ value, label: t(`settings.tabSizingOptions.${value}`), testId: `tab-sizing-${value}`, disabled: !settings }))}
              onChange={(tabSizing) => void update({ tabSizing }).catch(notifyError)} />
          </div>
          <div className="htnote-settings-row">
            <div><span id="settings-content-width">{t("settings.contentWidth")}</span><p className="text-xs text-app-muted">{t("settings.contentWidthHint")}</p></div>
            <SegmentedControl label={t("settings.contentWidth")} value={settings?.contentWidth ?? "comfortable"}
              options={(["narrow", "comfortable", "wide", "full"] as const).map((value) => ({ value, label: t(`settings.contentWidthOptions.${value}`), disabled: !settings }))}
              onChange={(contentWidth) => void update({ contentWidth }).catch(notifyError)} />
          </div>

          <div aria-labelledby="settings-tag-colors" className="mt-5 space-y-3 border-t border-app-card-border pt-4">
          <h3 id="settings-tag-colors" className="font-semibold">{t("tags.colors")}</h3>
          <p className="text-sm text-app-muted">{t("tags.colorsHint")}</p>
          {deriveTags(tree).map(({ tag }) => <div key={tag} className="flex items-center justify-between gap-3"><span className="truncate">{tag}</span><TagColorPicker tag={tag} /></div>)}
          </div>
        </section>
        <section aria-labelledby="settings-about" className="htnote-settings-card">
          <div className="htnote-settings-card-header"><span className="htnote-settings-icon"><Info className="size-5" aria-hidden /></span><div><h3 id="settings-about" className="text-xl font-semibold">{t("settings.about")}</h3><p className="text-xs text-app-muted">{t("settings.aboutHint")}</p></div></div>
          <div className="mb-4 flex items-center gap-3"><span className="htnote-settings-icon"><NotebookPen className="size-5" aria-hidden /></span><span className="text-xl font-semibold">{t("settings.appName")}</span><span className="htnote-search-pill">{t("settings.version", { version })}</span></div>
          <div className="flex flex-wrap gap-4">
            <Button type="button" onClick={onShowShortcuts} variant="ghost" className="text-app-accent">{t("shortcuts.title")}</Button>
            <Button type="button" onClick={() => external(repository)} variant="ghost" className="text-app-accent">{t("settings.license")}<ExternalLink className="size-3" aria-hidden /></Button>
            <Button type="button" onClick={() => external(`${repository}/tree/main/docs`)} variant="ghost" className="text-app-accent">{t("settings.docs")}<ExternalLink className="size-3" aria-hidden /></Button>
          </div>
        </section>
      </div></div>
    </div>
  );
}
