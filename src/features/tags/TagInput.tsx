import { useState } from "react";
import type { KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { IconButton } from "@/components/ui/IconButton";
import { Button } from "@/components/ui/Button";
import { addTag, removeTag } from "@/features/tags/tags";
import type { TagCount } from "@/features/tags/tags";
import { normalizeText } from "@/lib/textMatch";

import { tagColor, tagColorStyle } from "./tagColors";
import { useSettingsStore } from "@/stores/settingsStore";

interface Props {
  tags: string[];
  suggestions: TagCount[];
  onChange: (tags: string[]) => void;
  compact?: boolean;
  visibleTagCount?: number;
}

export function TagInput({ tags, suggestions, onChange, compact = false, visibleTagCount = tags.length }: Props) {
  const { t } = useTranslation();
  const colors = useSettingsStore((state) => state.settings?.tagColors);
  const [showOverflow, setShowOverflow] = useState(false);
  const visibleCount = compact ? visibleTagCount : tags.length;
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState(0);
  const matches = value.trim() ? suggestions.filter(({ tag }) =>
    normalizeText(tag).includes(normalizeText(value.trim())) && !tags.some((item) => normalizeText(item) === normalizeText(tag))) : [];

  function commit(tag: string) {
    const next = addTag(tags, tag);
    if (next !== tags) onChange(next);
    setValue("");
    setSelected(0);
  }

  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && matches.length) { event.preventDefault(); setSelected((selected + 1) % matches.length); return; }
    if (event.key === "ArrowUp" && matches.length) { event.preventDefault(); setSelected((selected + matches.length - 1) % matches.length); return; }
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      commit(event.key === "Enter" ? matches[selected]?.tag ?? value : value);
    } else if (event.key === "Backspace" && !value && tags.length) {
      onChange(removeTag(tags, tags[tags.length - 1]));
    } else if (event.key === "Escape") {
      setFocused(false);
    }
  }

  return <div data-compact-tags={compact || undefined} className={compact ? "relative flex min-w-0 shrink-0 items-center gap-1" : "mt-1 flex flex-wrap items-center gap-1"}>
    {compact && <div aria-hidden inert className="pointer-events-none invisible absolute flex w-max items-center gap-1">
      {tags.map((tag) => <span key={tag} data-tag-measure className="inline-flex max-w-40 shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs"><span className="htnote-tag-dot" /><span className="truncate">#{tag}</span><span className="size-4 shrink-0" /></span>)}
      <Button data-tag-overflow-measure variant="ghost" size="sm" tabIndex={-1} className="shrink-0 rounded-full px-2 text-xs">+{tags.length}</Button>
    </div>}
    {tags.slice(0, visibleCount).map((tag) => <span key={tag} style={tagColorStyle(tagColor(colors, tag))} className={`group inline-flex max-w-40 shrink-0 items-center gap-1 rounded-full bg-app-subtle px-2 py-0.5 text-xs ${tagColor(colors, tag) ? "htnote-colored-tag" : ""}`}>
      <span className="htnote-tag-dot" style={{ background: `var(--app-color-${tagColor(colors, tag) ?? "gray"})` }} aria-hidden /><span className="truncate">#{tag}</span><IconButton size="sm" className="size-4 min-h-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100" type="button" label={t("tags.remove", { tag })} onClick={() => onChange(removeTag(tags, tag))}>×</IconButton>
    </span>)}
    {visibleCount < tags.length && <Button variant="ghost" size="sm" aria-label={t("tags.overflow", { count: tags.length - visibleCount })} aria-expanded={showOverflow} onClick={() => setShowOverflow(!showOverflow)} className="shrink-0 rounded-full px-2 text-xs">+{tags.length - visibleCount}</Button>}
    {showOverflow && visibleCount < tags.length && <div className="absolute left-0 top-full z-20 max-h-48 overflow-auto rounded-lg border border-app-border bg-app-card p-2 shadow-lg">{tags.slice(visibleCount).map((tag) => <div key={tag} className="flex items-center gap-1 text-xs"><span>#{tag}</span><IconButton size="sm" label={t("tags.remove", { tag })} onClick={() => onChange(removeTag(tags, tag))}>×</IconButton></div>)}</div>}
    <div data-tag-add className="relative min-w-0 shrink-0">
      <input type="text" aria-label={t("tags.add")} placeholder={t(compact ? "tags.addPill" : "tags.add")} value={value}
        onChange={(event) => { setValue(event.target.value); setSelected(0); }} onKeyDown={keyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        className={`w-20 text-xs outline-none placeholder:text-app-muted ${compact ? "rounded-full border border-dashed border-app-border px-2 py-1" : "bg-transparent"}`} />
      {focused && matches.length > 0 && <ul className="absolute left-0 top-full z-20 max-h-40 min-w-36 overflow-y-auto rounded border border-app-border bg-app-surface shadow-lg" role="listbox" aria-label={t("tags.suggestions")}>
        {matches.map(({ tag, count }, index) => <li key={tag} role="option" aria-selected={index === selected}>
          <Button variant="ghost" size="sm" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => commit(tag)} className="flex w-full justify-between gap-3 px-2 py-1 text-left text-xs hover:bg-app-subtle">{tag}<span>{count}</span></Button>
        </li>)}
      </ul>}
    </div>
  </div>;
}
