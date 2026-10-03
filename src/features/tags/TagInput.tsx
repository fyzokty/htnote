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
}

export function TagInput({ tags, suggestions, onChange }: Props) {
  const { t } = useTranslation();
  const colors = useSettingsStore((state) => state.settings?.tagColors);
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

  return <div className="mt-1 flex flex-wrap items-center gap-1">
    {tags.map((tag) => <span key={tag} style={tagColorStyle(tagColor(colors, tag))} className={`inline-flex items-center gap-1 rounded bg-app-subtle px-2 py-0.5 text-xs ${tagColor(colors, tag) ? "htnote-colored-tag" : ""}`}>
      {tagColor(colors, tag) && <span className="htnote-tag-dot" aria-hidden />}{tag}<IconButton size="sm" className="size-4 min-h-0" type="button" label={t("tags.remove", { tag })} onClick={() => onChange(removeTag(tags, tag))}>×</IconButton>
    </span>)}
    <div className="relative">
      <input type="text" aria-label={t("tags.add")} placeholder={t("tags.add")} value={value}
        onChange={(event) => { setValue(event.target.value); setSelected(0); }} onKeyDown={keyDown}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        className="w-24 bg-transparent text-xs outline-none placeholder:text-app-muted" />
      {focused && matches.length > 0 && <ul className="absolute left-0 top-full z-20 max-h-40 min-w-36 overflow-y-auto rounded border border-app-border bg-app-surface shadow-lg" role="listbox" aria-label={t("tags.suggestions")}>
        {matches.map(({ tag, count }, index) => <li key={tag} role="option" aria-selected={index === selected}>
          <Button variant="ghost" size="sm" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => commit(tag)} className="flex w-full justify-between gap-3 px-2 py-1 text-left text-xs hover:bg-app-subtle">{tag}<span>{count}</span></Button>
        </li>)}
      </ul>}
    </div>
  </div>;
}
