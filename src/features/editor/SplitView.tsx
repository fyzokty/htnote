import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useSettingsStore } from "@/stores/settingsStore";

interface SplitViewProps {
  editor: ReactNode;
  children?: ReactNode;
}

function clampSplitRatio(ratio: number): number {
  return Math.max(20, Math.min(80, Math.round(ratio)));
}

export function SplitView({ editor, children }: SplitViewProps) {
  const { t } = useTranslation();
  const settings = useSettingsStore((state) => state.settings);
  const load = useSettingsStore((state) => state.load);
  const update = useSettingsStore((state) => state.update);
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const ratio = dragRatio ?? clampSplitRatio(settings?.editorSplitRatio ?? 50);
  const preview = settings?.editorLivePreview ?? true;
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const ratioRef = useRef(ratio);

  useEffect(() => {
    if (!settings) void load().catch(() => {});
  }, [settings, load]);

  const saveRatio = () => {
    draggingRef.current = false;
    if (settings && ratioRef.current !== settings.editorSplitRatio) {
      void update({ editorSplitRatio: ratioRef.current }).catch(() => {});
    }
    setDragRatio(null);
  };

  const moveDivider = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect?.width) return;
    const next = clampSplitRatio(((clientX - rect.left) / rect.width) * 100);
    ratioRef.current = next;
    setDragRatio(next);
  };

  return (
    <section className="htnote-split-view" aria-label={t("editor.split.label")}
      style={{ display: "flex", flexDirection: "column", minWidth: 0, height: "100%" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "0.5rem", borderBottom: "1px solid var(--app-border)" }}>
        <button type="button" disabled={!settings} aria-pressed={preview} onClick={() => {
          const next = !preview;
          if (settings) void update({ editorLivePreview: next }).catch(() => {});
        }}>{t("editor.split.livePreview")}</button>
      </div>
      <div ref={containerRef} style={{ display: "flex", flex: 1, minHeight: 0, minWidth: 0 }}>
        <div style={{ width: preview ? `${ratio}%` : "100%", minWidth: 0, overflow: "auto" }}>{editor}</div>
        {preview && <>
          <div role="separator" aria-label={t("editor.split.resize")} aria-orientation="vertical"
            aria-valuemin={20} aria-valuemax={80} aria-valuenow={ratio} tabIndex={0}
            style={{ width: 6, flexShrink: 0, cursor: "col-resize", background: "var(--app-border)", touchAction: "none" }}
            onPointerDown={(event) => {
              draggingRef.current = true;
              ratioRef.current = ratio;
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => { if (draggingRef.current) moveDivider(event.clientX); }}
            onPointerUp={saveRatio}
            onPointerCancel={saveRatio}
            onKeyDown={(event) => {
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
              event.preventDefault();
              const next = clampSplitRatio(ratio + (event.key === "ArrowRight" ? 1 : -1));
              ratioRef.current = next;
              setDragRatio(next);
              if (settings) void update({ editorSplitRatio: next }).catch(() => {});
            }} />
          <div aria-label={t("editor.split.preview")} style={{ flex: 1, minWidth: 0, overflow: "auto" }}>{children}</div>
        </>}
      </div>
    </section>
  );
}
