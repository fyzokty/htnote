import { useTranslation } from "react-i18next";
import { COLOR_NAMES } from "@/lib/colors";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { setTagColor, tagColor } from "./tagColors";
import { notifyError } from "@/lib/errors";
import { useSettingsStore } from "@/stores/settingsStore";

export function TagColorPicker({ tag }: { tag: string }) {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const color = tagColor(settings?.tagColors, tag);
  return <ColorPicker label={t("tags.color", { tag })} value={color ?? ""} disabled={!settings}
    icon={<span className="htnote-tag-dot" style={{ background: color ? `var(--app-color-${color})` : "var(--app-color-gray)" }} aria-hidden />}
    options={COLOR_NAMES.map((name) => ({ value: name, label: t(`colors.${name}`), color: `var(--app-color-${name})` }))}
    onChange={(next) => void setTagColor(tag, next).catch(notifyError)} />;
}
