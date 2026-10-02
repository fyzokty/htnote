import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import { formatShortcut, getPlatform, listShortcuts } from "@/lib/shortcuts/registry";
import type { ShortcutCategory } from "@/lib/shortcuts/registry";

const categories: readonly ShortcutCategory[] = ["general", "tabs", "editing", "editor"];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const closeButton = useRef<HTMLButtonElement>(null);
  const platform = getPlatform();
  const shortcuts = listShortcuts();

  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <div role="presentation" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t("shortcuts.title")} className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-lg border border-app-border bg-app-surface p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{t("shortcuts.title")}</h2>
          <button ref={closeButton} type="button" onClick={onClose} aria-label={t("shortcuts.close")} className="rounded px-2 py-1 text-app-muted hover:bg-app-subtle">×</button>
        </div>
        {categories.map((category) => (
          <section key={category} className="mt-5">
            <h3 className="font-semibold">{t(`shortcuts.categories.${category}`)}</h3>
            <dl className="mt-2 divide-y divide-app-border text-sm">
              {shortcuts.filter((shortcut) => shortcut.category === category).map((shortcut) => (
                <div key={shortcut.id} data-shortcut-id={shortcut.id} className="flex items-center justify-between gap-4 py-2">
                  <dt>{t(`shortcuts.actions.${shortcut.id}`)}</dt>
                  <dd className="shrink-0 font-mono text-app-muted">{formatShortcut(shortcut.id, platform)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
