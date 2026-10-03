import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Compartment } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { NotePicker } from "@/components/ui/NotePicker";
import { codeChange, codeTheme, createCodeState } from "@/features/editor/codeState";
import type { CodeChange, CodeTab } from "@/features/editor/codeState";
import { codeTagFor, copyFilesSequentially, fileName, registerDropHandler } from "@/features/editor/fileDrop";
import { codeNoteLink } from "@/features/editor/noteLinks";
import { useThemeMode } from "@/hooks/useThemeMode";
import { ipc } from "@/lib/ipc";
import type { FlatNote } from "@/lib/types";
import { useUiStore } from "@/stores/uiStore";

interface CodeEditorProps {
  noteId?: string;
  html: string;
  css: string;
  js: string;
  onChange: (partial: CodeChange) => void;
  initialTab?: CodeTab;
  toolbarActions?: ReactNode;
}

const tabs: CodeTab[] = ["html", "css", "js"];

export function CodeEditor({ noteId = "", html, css, js, onChange, initialTab = "html", toolbarActions }: CodeEditorProps) {
  const { t } = useTranslation();
  const mode = useThemeMode();
  const [activeTab, setActiveTab] = useState<CodeTab>(initialTab);
  const tabId = useId();
  const [pickerOpen, setPickerOpen] = useState(false);
  const cursorRef = useRef<number | null>(null);
  const openPicker = (view: EditorView) => {
    cursorRef.current = view.state.selection.main.head;
    setPickerOpen(true);
    return true;
  };
  const activeRef = useRef(activeTab);
  const callbackRef = useRef(onChange);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Record<CodeTab, EditorState> | null>(null);
  const themesRef = useRef<Record<CodeTab, Compartment>>({
    html: new Compartment(),
    css: new Compartment(),
    js: new Compartment(),
  });

  useEffect(() => { callbackRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (activeTab !== "html") return;
    return registerDropHandler(noteId, "code", async (paths, point) => {
      const view = viewRef.current;
      if (!view || activeRef.current !== "html") {
        useUiStore.getState().pushToast({ kind: "info", messageKey: "editor.dropInEditMode" });
        return;
      }
      const position = view.posAtCoords({ x: point.x, y: point.y }) ?? view.state.selection.main.head;
      const copied = await copyFilesSequentially(paths, (path) => ipc.copyAsset(noteId, path),
        (path) => useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.dropCopyFailed", params: { name: fileName(path) } }));
      if (viewRef.current !== view || activeRef.current !== "html" || !copied.length) return;
      const tags = copied.map(({ result, path }) => codeTagFor(result, fileName(path))).join("");
      view.dispatch({ changes: { from: position, insert: tags }, selection: { anchor: position + tags.length } });
    });
  }, [noteId, activeTab]);

  useEffect(() => {
    if (!hostRef.current) return;
    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) callbackRef.current(codeChange(activeRef.current, update.state.doc.toString()));
    });
    const states = {
      html: createCodeState("html", html, themesRef.current.html, mode, [listener, keymap.of([{ key: "Mod-k", run: openPicker }])]),
      css: createCodeState("css", css, themesRef.current.css, mode, [listener]),
      js: createCodeState("js", js, themesRef.current.js, mode, [listener]),
    };
    statesRef.current = states;
    const view = new EditorView({ state: states[activeRef.current], parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
      statesRef.current = null;
    };
    // İlk belge yalnızca mount sırasında yüklenir; sonraki prop güncellemeleri aşağıdaki effect'tedir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const states = statesRef.current;
    const view = viewRef.current;
    if (!states || !view) return;
    for (const tab of tabs) {
      const incoming = { html, css, js }[tab];
      const current = tab === activeRef.current ? view.state : states[tab];
      if (incoming === current.doc.toString()) continue;
      const updated = current.update({ changes: { from: 0, to: current.doc.length, insert: incoming } }).state;
      states[tab] = updated;
      if (tab === activeRef.current) view.setState(updated);
    }
  }, [html, css, js]);

  useEffect(() => {
    const states = statesRef.current;
    const view = viewRef.current;
    if (!states || !view) return;
    for (const tab of tabs) {
      const current = tab === activeRef.current ? view.state : states[tab];
      const updated = current.update({ effects: themesRef.current[tab].reconfigure(codeTheme(mode)) }).state;
      states[tab] = updated;
      if (tab === activeRef.current) view.setState(updated);
    }
  }, [mode]);

  const switchTab = (tab: CodeTab) => {
    if (tab === activeRef.current || !statesRef.current || !viewRef.current) return;
    statesRef.current[activeRef.current] = viewRef.current.state;
    activeRef.current = tab;
    viewRef.current.setState(statesRef.current[tab]);
    setActiveTab(tab);
  };

  const selectNote = (note: FlatNote) => {
    const view = viewRef.current;
    if (!view || cursorRef.current === null) return;
    const pos = Math.min(cursorRef.current, view.state.doc.length);
    view.dispatch({ changes: { from: pos, insert: codeNoteLink(note.id, note.title) } });
    view.focus();
    setPickerOpen(false);
  };

  return (
    <section className="htnote-code-editor" aria-label={t("editor.code.label")}>
      <div className="htnote-editor-bar htnote-code-bar">
        <div className="htnote-code-tabs" role="tablist" aria-label={t("editor.code.tabs")}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const index = tabs.indexOf(activeTab);
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
              : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
            switchTab(tabs[next]);
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
          }}>
          {tabs.map((tab) => <Tooltip key={tab} label={t(`editor.code.${tab}`)}>
            <Button variant="ghost" size="sm" className="htnote-code-tab" data-testid={`code-tab-${tab}`}
              id={`${tabId}-${tab}`} role="tab" aria-controls={`${tabId}-panel`} aria-selected={activeTab === tab}
              tabIndex={activeTab === tab ? 0 : -1} onClick={() => switchTab(tab)}>
              <span aria-hidden="true" className={`htnote-code-dot htnote-code-dot-${tab}`} />{t(`editor.code.${tab}`)}
            </Button>
          </Tooltip>)}
        </div>
        {toolbarActions && <div className="htnote-code-actions">{toolbarActions}</div>}
      </div>
      <div className="htnote-code-host" ref={hostRef} id={`${tabId}-panel`} role="tabpanel" aria-labelledby={`${tabId}-${activeTab}`} />
      {pickerOpen && <NotePicker currentNoteId={noteId} onSelect={selectNote} onClose={() => setPickerOpen(false)} />}
    </section>
  );
}
