import { useEffect, useRef, useState } from "react";
import { Compartment } from "@codemirror/state";
import type { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useTranslation } from "react-i18next";

import { codeChange, codeTheme, createCodeState } from "@/features/editor/codeState";
import type { CodeChange, CodeTab } from "@/features/editor/codeState";
import { useThemeMode } from "@/hooks/useThemeMode";

interface CodeEditorProps {
  html: string;
  css: string;
  js: string;
  onChange: (partial: CodeChange) => void;
  initialTab?: CodeTab;
}

const tabs: CodeTab[] = ["html", "css", "js"];

export function CodeEditor({ html, css, js, onChange, initialTab = "html" }: CodeEditorProps) {
  const { t } = useTranslation();
  const mode = useThemeMode();
  const [activeTab, setActiveTab] = useState<CodeTab>(initialTab);
  const activeRef = useRef(activeTab);
  const callbackRef = useRef(onChange);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Record<CodeTab, EditorState> | null>(null);
  const themeRef = useRef(new Compartment());

  useEffect(() => { callbackRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) return;
    const listener = EditorView.updateListener.of((update) => {
      if (update.docChanged) callbackRef.current(codeChange(activeRef.current, update.state.doc.toString()));
    });
    const states = {
      html: createCodeState("html", html, themeRef.current, mode, [listener]),
      css: createCodeState("css", css, themeRef.current, mode, [listener]),
      js: createCodeState("js", js, themeRef.current, mode, [listener]),
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
      const updated = current.update({ effects: themeRef.current.reconfigure(codeTheme(mode)) }).state;
      states[tab] = updated;
      if (tab === activeRef.current) view.dispatch({ effects: themeRef.current.reconfigure(codeTheme(mode)) });
    }
  }, [mode]);

  const switchTab = (tab: CodeTab) => {
    if (tab === activeRef.current || !statesRef.current || !viewRef.current) return;
    statesRef.current[activeRef.current] = viewRef.current.state;
    activeRef.current = tab;
    viewRef.current.setState(statesRef.current[tab]);
    setActiveTab(tab);
    viewRef.current.focus();
  };

  return (
    <section className="htnote-code-editor" aria-label={t("editor.code.label")}>
      <div className="htnote-code-tabs" role="tablist" aria-label={t("editor.code.tabs")}>
        {tabs.map((tab) => <button key={tab} type="button" role="tab" aria-selected={activeTab === tab} onClick={() => switchTab(tab)}>{t(`editor.code.${tab}`)}</button>)}
      </div>
      <div className="htnote-code-host" ref={hostRef} aria-label={t(`editor.code.${activeTab}`)} />
    </section>
  );
}
