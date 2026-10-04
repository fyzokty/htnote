import { PopoverPresence } from "@/components/ui/PopoverPresence";
import { useDialogActive } from "@/components/ui/useDialogPresence";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/core";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { Button } from "@/components/ui/Button";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { clampFontSize, familyLabel, FONT_SIZES, fontStack, loadSystemFonts, selectedComputedStyle, selectedTextStyle } from "./fonts";

function FontPopover({ anchor, label, onClose, children }: { anchor: HTMLElement; label: string; onClose: () => void; children: ReactNode }) {
  const active = useDialogActive();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const reduced = useReducedMotion();
  const [position, setPosition] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => { close.current = onClose; });
  useLayoutEffect(() => {
    if (!active) return;
    const rect = anchor.getBoundingClientRect(), bounds = panel.current!.getBoundingClientRect();
    setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - bounds.width - 8)),
      top: Math.max(8, rect.bottom + bounds.height > window.innerHeight ? rect.top - bounds.height : rect.bottom + 4) });
    panel.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, [anchor, active]);
  useEffect(() => {
    if (!active) return;
    const element = panel.current;
    const outside = (event: PointerEvent) => { if (!element?.contains(event.target as Node) && !anchor.contains(event.target as Node)) close.current(); };
    const resize = () => close.current();
    document.addEventListener("pointerdown", outside); window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside); window.removeEventListener("resize", resize);
      if (document.activeElement === document.body || element?.contains(document.activeElement)) anchor.focus();
    };
  }, [anchor, active]);
  return createPortal(<div ref={panel} inert={!active} aria-hidden={!active || undefined} data-closing={!active} data-side={position.top < anchor.getBoundingClientRect().top ? "up" : "down"} className="htnote-popover-motion htnote-popover-surface htnote-font-popover" role="dialog" aria-label={label}
    data-reduced-motion={reduced} style={position} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key === "Tab" || (["ArrowDown", "ArrowUp"].includes(event.key) && (event.target as HTMLElement).tagName !== "INPUT")) {
        event.preventDefault(); event.stopPropagation();
        const controls = [...panel.current!.querySelectorAll<HTMLElement>("input, button:not(:disabled)")];
        const backwards = event.shiftKey || event.key === "ArrowUp";
        controls[(controls.indexOf(document.activeElement as HTMLElement) + (backwards ? controls.length - 1 : 1)) % controls.length]?.focus();
      }
    }}>{children}</div>, document.body);
}

export function FontFamilySelector({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [families, setFamilies] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState(60);
  const selection = useRef({ from: 1, to: 1 });
  useEffect(() => { let live = true; void loadSystemFonts().then((values) => { if (live) setFamilies(values); }); return () => { live = false; }; }, []);
  const current = selectedTextStyle(editor, "fontFamily");
  const filtered = families.filter((family) => family.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const apply = (family: string) => {
    const chain = editor.chain().focus().setTextSelection(selection.current);
    if (family) chain.setFontFamily(fontStack(family)).run(); else chain.unsetFontFamily().run();
    setAnchor(null);
  };
  return <>
    <Tooltip label={t("editor.fontFamily")}><Button size="sm" variant="ghost" className="htnote-font-trigger" data-testid="editor-font-family" aria-label={t("editor.fontFamily")}
      aria-haspopup="dialog" aria-expanded={!!anchor} onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => { selection.current = { from: editor.state.selection.from, to: editor.state.selection.to }; setSearch(""); setLimit(60); setAnchor(anchor ? null : event.currentTarget); }}>
      <span>{familyLabel(current) || t("editor.fontDefault")}</span><ChevronDown size={12} aria-hidden />
    </Button></Tooltip>
    <PopoverPresence>{anchor && <FontPopover anchor={anchor} label={t("editor.fontFamily")} onClose={() => setAnchor(null)}>
      <input type="search" aria-label={t("editor.fontSearch")} placeholder={t("editor.fontSearch")} value={search}
        onChange={(event) => { setSearch(event.target.value); setLimit(60); }} onKeyDown={(event) => {
          if (event.key === "ArrowDown") { event.preventDefault(); event.currentTarget.nextElementSibling?.querySelector<HTMLElement>("button")?.focus(); }
        }} />
      <div className="htnote-font-list" onScroll={(event) => { const el = event.currentTarget; if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) setLimit((count) => count + 60); }}>
        <Button size="sm" variant="ghost" aria-pressed={!current} onClick={() => apply("")}>{t("editor.fontDefault")}</Button>
        {filtered.slice(0, limit).map((family) => <Button key={family} size="sm" variant="ghost" data-font-family={family}
          style={{ fontFamily: fontStack(family) }} aria-pressed={familyLabel(current) === family} onClick={() => apply(family)}>{family}</Button>)}
        {!filtered.length && <p>{t("editor.fontNoResults")}</p>}
      </div>
    </FontPopover>}</PopoverPresence>
  </>;
}

export function FontSizeSelector({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const current = selectedTextStyle(editor, "fontSize").replace(/px$/, "");
  const computedSize = parseFloat(selectedComputedStyle(editor, "fontSize"));
  const [draft, setDraft] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const selection = useRef({ from: 1, to: 1 });
  const capture = () => { selection.current = { from: editor.state.selection.from, to: editor.state.selection.to }; };
  const apply = (value: string) => {
    const size = clampFontSize(value);
    if (value && !size) return;
    const chain = editor.chain().focus().setTextSelection(selection.current);
    if (size) chain.setFontSize(size).run(); else chain.unsetFontSize().run();
    setDraft(null); setAnchor(null);
  };
  return <div className="htnote-font-size">
    <input data-testid="editor-font-size" aria-label={t("editor.fontSize")} inputMode="numeric" value={draft ?? current}
      placeholder={Number.isFinite(computedSize) && computedSize > 0 ? String(Math.round(computedSize)) : "—"} onFocus={capture} onChange={(event) => setDraft(event.target.value)}
      onBlur={() => setDraft(null)} onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); apply(draft ?? current); }
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setDraft(null); editor.commands.focus(); }
      }} />
    <Tooltip label={t("editor.fontSizeOptions")}><Button size="sm" variant="ghost" data-testid="editor-font-size-options" aria-label={t("editor.fontSizeOptions")}
      aria-haspopup="dialog" aria-expanded={!!anchor} onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => { capture(); setAnchor(anchor ? null : event.currentTarget); }}><ChevronDown size={12} aria-hidden /></Button></Tooltip>
    <PopoverPresence>{anchor && <FontPopover anchor={anchor} label={t("editor.fontSize")} onClose={() => setAnchor(null)}>
      <div className="htnote-font-list"><Button size="sm" variant="ghost" aria-pressed={!current} onClick={() => apply("")}>{t("editor.fontDefault")}</Button>
        {FONT_SIZES.map((size) => <Button key={size} size="sm" variant="ghost" aria-pressed={current === String(size)} onClick={() => apply(String(size))}>{t("editor.fontSizeValue", { size })}</Button>)}
      </div>
    </FontPopover>}</PopoverPresence>
  </div>;
}
