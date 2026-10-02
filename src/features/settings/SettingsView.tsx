import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { openUrl } from "@tauri-apps/plugin-opener";

import { changeRootFlow } from "@/features/settings/changeRoot";
import { notifyError } from "@/lib/errors";
import { ipc } from "@/lib/ipc";
import { useSettingsStore } from "@/stores/settingsStore";

const repository = "https://github.com/fyzokty/htnote";

export function SettingsView() {
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
    void openUrl(url).catch(notifyError);
  }

  return (
    <div className="min-h-0 w-full overflow-y-auto p-6 text-app-text">
      <h2 className="mb-6 text-xl font-semibold">{t("sidebar.settings")}</h2>
      <div className="max-w-2xl space-y-8">
        <section aria-labelledby="settings-storage" className="space-y-3">
          <h3 id="settings-storage" className="font-semibold">{t("settings.storage")}</h3>
          <p className="break-all rounded border border-app-border bg-app-subtle p-3 text-sm">{root}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={changing || !root} onClick={() => void changeRoot()} className="rounded border border-app-border px-3 py-2 disabled:opacity-50">{t("settings.changeRoot")}</button>
            <button type="button" disabled={!root} onClick={() => void ipc.revealInExplorer(root).catch(notifyError)} className="rounded border border-app-border px-3 py-2 disabled:opacity-50">{t("settings.showInFolder")}</button>
          </div>
          <p className="text-sm text-app-muted">{t("settings.notesStay")}</p>
        </section>
        <section aria-labelledby="settings-appearance" className="space-y-3">
          <h3 id="settings-appearance" className="font-semibold">{t("settings.appearance")}</h3>
          <label className="flex items-center justify-between gap-3">{t("settings.theme")}
            <select value={settings?.theme ?? "system"} onChange={(event) => void update({ theme: event.target.value as "system" | "light" | "dark" }).catch(notifyError)} className="rounded border border-app-border bg-app-bg px-3 py-2">
              <option value="system">{t("settings.system")}</option>
              <option value="light">{t("settings.light")}</option>
              <option value="dark">{t("settings.dark")}</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3">{t("settings.language")}
            <select value={settings?.language ?? "system"} onChange={(event) => void update({ language: event.target.value === "system" ? null : event.target.value as "tr" | "en" }).catch(notifyError)} className="rounded border border-app-border bg-app-bg px-3 py-2">
              <option value="system">{t("settings.system")}</option>
              <option value="tr">{t("settings.turkish")}</option>
              <option value="en">{t("settings.english")}</option>
            </select>
          </label>
        </section>
        <section aria-labelledby="settings-about" className="space-y-3">
          <h3 id="settings-about" className="font-semibold">{t("settings.about")}</h3>
          <p>{t("settings.version", { version })}</p>
          <div className="flex gap-4">
            <button type="button" onClick={() => external(repository)} className="text-app-accent underline">{t("settings.license")}</button>
            <button type="button" onClick={() => external(`${repository}/tree/main/docs`)} className="text-app-accent underline">{t("settings.docs")}</button>
          </div>
        </section>
      </div>
    </div>
  );
}
