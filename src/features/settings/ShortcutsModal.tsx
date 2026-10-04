import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { getPlatform } from "@/lib/platform";
import { formatShortcut, listShortcuts } from "@/lib/shortcuts/registry";
import type { ShortcutCategory } from "@/lib/shortcuts/registry";

const categories: readonly ShortcutCategory[] = ["general", "tabs", "editing", "editor"];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const closeButton = useRef<HTMLButtonElement>(null);
  const platform = getPlatform();
  const shortcuts = listShortcuts();

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") { event.preventDefault(); closeButton.current?.focus(); }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => { window.removeEventListener("keydown", onKeyDown, true); previous?.focus(); };
  }, [onClose]);

  return (
    <div role="presentation" className="htnote-dialog-backdrop fixed inset-0 z-50 flex items-center justify-center bg-app-backdrop p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t("shortcuts.title")} className="htnote-dialog-surface max-h-[80vh] w-full max-w-xl overflow-y-auto  p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("shortcuts.title")}</h2>
          <IconButton ref={closeButton} type="button" onClick={onClose} label={t("shortcuts.close")}>×</IconButton>
        </div>
        {categories.map((category) => (
          <section key={category} className="mt-5">
            <h3 className="font-semibold">{t(`shortcuts.categories.${category}`)}</h3>
            <dl className="mt-2 divide-y divide-app-border text-sm">
              {shortcuts.filter((shortcut) => shortcut.category === category).map((shortcut) => (
                <div key={shortcut.id} data-shortcut-id={shortcut.id} className="flex items-center justify-between gap-4 py-2">
                  <dt>{t(`shortcuts.actions.${shortcut.id}`)}</dt>
                  <dd className="shrink-0 font-mono text-app-muted"><kbd className="htnote-kbd">{formatShortcut(shortcut.id, platform)}</kbd></dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
