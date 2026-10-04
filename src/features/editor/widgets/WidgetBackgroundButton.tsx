import { useTranslation } from "react-i18next";
import { ColorPicker } from "@/components/ui/ColorPicker";
import { WIDGET_BACKGROUNDS, type WidgetBackground } from "./widgetBackground";

export function WidgetBackgroundButton({ value, onChange }: { value: WidgetBackground; onChange: (value: WidgetBackground) => void }) {
  const { t } = useTranslation();
  return <ColorPicker label={t("editor.widgets.background")} value={value}
    icon={<span className="htnote-widget-background-swatch" aria-hidden style={{ background: value ? `var(--app-note-${value})` : "transparent" }} />}
    options={WIDGET_BACKGROUNDS.map((preset) => ({ value: preset, label: t(`colors.backgrounds.${preset}`), color: `var(--app-note-${preset})` }))}
    onChange={(next) => onChange(next as WidgetBackground)} />;
}
