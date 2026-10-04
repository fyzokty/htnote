import { useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { resolveCustomColor, hexToHsv, hsvToHex, readRecentColors, rememberColor, validHex, type HSV } from "@/lib/colors";
import { Button } from "./Button";

export function CustomColorPanel({ value, getComputedColor, onApply, onCancel }: { value: string; getComputedColor?: () => string; onApply: (color: string) => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [initialColor] = useState(() => resolveCustomColor(value, getComputedColor?.() ?? "",
    getComputedStyle(document.documentElement).getPropertyValue("--app-accent")));
  const [hsv, setHsv] = useState(() => hexToHsv(initialColor));
  const [hex, setHex] = useState(initialColor);
  const [recent] = useState(readRecentColors);
  const update = (next: HSV) => { setHsv(next); setHex(hsvToHex(next)); };
  const apply = () => { if (validHex(hex)) { rememberColor(hex.toLowerCase()); onApply(hex.toLowerCase()); } };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    update({ ...hsv, s: Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)),
      v: Math.max(0, Math.min(100, 100 - (event.clientY - rect.top) / rect.height * 100)) });
  };
  return <div className="htnote-custom-color" onKeyDown={(event) => {
    if (event.key === "Enter" && (event.target as HTMLElement).tagName !== "BUTTON") { event.preventDefault(); apply(); }
  }}>
    <div role="slider" tabIndex={0} aria-label={t("colors.saturationBrightness")} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={Math.round(hsv.s)} aria-valuetext={t("colors.svValue", { s: Math.round(hsv.s), v: Math.round(hsv.v) })}
      className="htnote-color-sv" style={{ backgroundColor: hsvToHex({ h: hsv.h, s: 100, v: 100 }) }}
      onPointerDown={(event) => { event.currentTarget.focus(); event.currentTarget.setPointerCapture?.(event.pointerId); move(event); }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture?.(event.pointerId)) move(event); }}
      onPointerUp={(event) => event.currentTarget.releasePointerCapture?.(event.pointerId)}
      onKeyDown={(event) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const step = event.shiftKey ? 10 : 1;
        update({ ...hsv, s: Math.max(0, Math.min(100, hsv.s + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0))),
          v: Math.max(0, Math.min(100, hsv.v + (event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0))) });
      }}>
      <span className="htnote-color-cursor" style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }} aria-hidden />
    </div>
    <input className="htnote-color-hue" type="range" role="slider" min={0} max={359} value={hsv.h}
      aria-label={t("colors.hue")} aria-valuetext={t("colors.hueValue", { h: Math.round(hsv.h) })}
      onChange={(event) => update({ ...hsv, h: Number(event.target.value) })} />
    <div className="flex items-center gap-2">
      <span className="htnote-color-preview" style={{ background: hsvToHex(hsv) }} aria-label={t("colors.preview")} />
      <input aria-label={t("colors.hex")} aria-invalid={!validHex(hex)} value={hex} maxLength={7}
        onChange={(event) => { setHex(event.target.value); if (validHex(event.target.value)) setHsv(hexToHsv(event.target.value)); }} />
    </div>
    {!validHex(hex) && <p role="alert">{t("colors.invalidHex")}</p>}
    {recent.length > 0 && <div aria-label={t("colors.recent")} className="htnote-color-grid">{recent.map((color) =>
      <Button key={color} variant="ghost" size="sm" aria-label={color} onClick={() => { setHex(color); setHsv(hexToHsv(color)); }}>
        <span className="htnote-color-swatch" style={{ background: color }} aria-hidden />
      </Button>)}</div>}
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="ghost" onClick={onCancel}>{t("editor.cancel")}</Button>
      <Button size="sm" variant="primary" disabled={!validHex(hex)} onClick={apply}>{t("colors.apply")}</Button>
    </div>
  </div>;
}
