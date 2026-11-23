import { useLayoutEffect, useMemo, useRef, type ComponentPropsWithRef } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, Code2, ImagePlus, ListOrdered, Plus, Trash2 } from "lucide-react";
import { emptyStep, isEmptyStep, type StepImage, type StepItem } from "./steps";
import { leaveTextBox, textBoxBoundary } from "./textBox";
import { WidgetHeader } from "./widgets/WidgetHeader";
import { SingleLineTextarea } from "./widgets/SingleLineTextarea";
import { singleLineWidgetText } from "./widgets/widgetFormat";
import { useTextareaSizing } from "./widgets/useTextareaSizing";
import { IMAGE_EXTENSIONS, pickMediaPaths } from "./mediaPicker";
import { copyStepImage, saveStepDataImage, saveStepImage } from "./stepsImage";
import { kindFromPath, registerElementDropHandler } from "./fileDrop";
import { resolveMediaSrc } from "./mediaSrc";
import { useUiStore } from "@/stores/uiStore";

function GrowingTextarea({ ref, ...props }: ComponentPropsWithRef<"textarea"> & { value: string }) {
  const sizingRef = useTextareaSizing(props.value, 3);
  return <textarea {...props} rows={3} ref={(field) => {
    sizingRef.current = field;
    if (typeof ref === "function") ref(field); else if (ref) ref.current = field;
  }} />;
}

export function StepsView({ node, updateAttributes, editor, getPos, selected, extension }: NodeViewProps) {
  const { t } = useTranslation();
  const noteId = (extension.options as { noteId: string }).noteId;
  const saved = node.attrs.items as StepItem[];
  const items = useMemo(() => saved.length ? saved : [emptyStep()], [saved]);
  const current = useRef(items);
  const root = useRef<HTMLDivElement>(null);
  const headings = useRef<(HTMLTextAreaElement | null)[]>([]);
  const descriptions = useRef<(HTMLTextAreaElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  const imports = useRef(new Set<{ item: StepItem }>());
  useLayoutEffect(() => {
    current.current = items;
    if (pendingFocus.current !== null) { headings.current[pendingFocus.current]?.focus(); pendingFocus.current = null; }
  }, [items]);
  const change = (next: StepItem[], focus?: number) => {
    if (focus !== undefined) pendingFocus.current = focus;
    current.current = next;
    updateAttributes({ items: next, html: null });
  };
  const patch = (index: number, value: Partial<StepItem>) => {
    const previous = current.current[index];
    const next = { ...previous, ...value };
    // Kopyalama sürerken metin düzenleme ve adım taşıma hedefi değiştirmesin.
    imports.current.forEach((target) => { if (target.item === previous) target.item = next; });
    change(current.current.map((item, at) => at === index ? next : item));
  };
  const move = (index: number, direction: -1 | 1) => {
    const next = [...current.current], target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    change(next, target);
  };
  const remove = (index: number) => {
    imports.current.forEach((target) => { if (target.item === current.current[index]) imports.current.delete(target); });
    if (current.current.length === 1) { patch(0, emptyStep()); return; }
    change(current.current.filter((_, at) => at !== index), Math.max(0, index - 1));
  };
  const importImage = async (index: number, loader: () => Promise<StepImage | null>) => {
    const target = { item: current.current[index] };
    imports.current.add(target);
    try {
      const image = await loader();
      const at = current.current.indexOf(target.item);
      if (image && imports.current.has(target) && at >= 0 && !editor.isDestroyed && root.current?.isConnected) patch(at, { image });
    } catch { useUiStore.getState().pushToast({ kind: "error", messageKey: "editor.mediaOpenFailed" }); }
    finally { imports.current.delete(target); }
  };
  const selectImage = (index: number) => importImage(index, async () => {
    const [path] = await pickMediaPaths({ name: t("editor.mediaImages"), extensions: IMAGE_EXTENSIONS }, false);
    return path ? copyStepImage(noteId, path) : null;
  });
  useLayoutEffect(() => {
    const cleanups = Array.from(root.current?.querySelectorAll(".htnote-steps-editor-item") ?? [], (element, index) =>
      registerElementDropHandler(element, noteId, async (paths) => {
        const path = paths.find((value) => kindFromPath(value) === "image");
        if (path) await importImage(index, () => copyStepImage(noteId, path));
      }));
    return () => { cleanups.forEach((cleanup) => cleanup()); };
  });
  const navigate = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.nativeEvent.isComposing) return;
    const field = event.currentTarget;
    const direction = textBoxBoundary(event.key, field.value, field.selectionStart ?? 0, field.selectionEnd ?? 0);
    if (!direction) return;
    event.preventDefault();
    const fields = Array.from(root.current?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input,textarea") ?? []);
    const next = fields[fields.indexOf(field) + direction];
    if (next) next.focus();
    else { const position = getPos(); if (position !== undefined) leaveTextBox(editor, position, node.nodeSize, direction); }
  };
  return <NodeViewWrapper ref={root} className={`htnote-steps-editor${selected ? " is-selected" : ""}`} contentEditable={false}
    data-widget-background={node.attrs.background || undefined}
    style={{ background: node.attrs.background ? `var(--app-note-${node.attrs.background})` : undefined }}
    onKeyDown={(event: React.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ["z", "y"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        if (event.shiftKey || event.key.toLowerCase() === "y") editor.commands.redo(); else editor.commands.undo();
      }
      if (event.altKey && event.shiftKey && !event.ctrlKey && !event.metaKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        const row = (event.target as Element).closest(".htnote-steps-editor-item");
        const index = Array.from(root.current?.querySelectorAll(".htnote-steps-editor-item") ?? []).indexOf(row!);
        if (index >= 0) move(index, event.key === "ArrowUp" ? -1 : 1);
      }
    }}>
    <WidgetHeader icon={<ListOrdered size={14} />} label={t("widgetTypes.steps")} background={node.attrs.background}
      onBackgroundChange={(background) => updateAttributes({ background })} selectLabel={t("editor.steps.select")}
      onSelect={() => { const position = getPos(); if (position !== undefined) editor.chain().focus().setNodeSelection(position).run(); }}>
      <input data-testid="steps-title" aria-label={t("editor.steps.title")} placeholder={t("editor.steps.title")} value={String(node.attrs.title)} spellCheck={false}
        onChange={(event) => updateAttributes({ title: event.target.value, html: null })}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); headings.current[0]?.focus(); } else navigate(event); }} />
    </WidgetHeader>
    <div className="htnote-steps-editor-items">
      {items.map((item, index) => <div className="htnote-steps-editor-item" key={index}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.stopPropagation(); } }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault(); event.stopPropagation();
          const file = Array.from(event.dataTransfer.files).find((entry) => entry.type.startsWith("image/"));
          if (file) void importImage(index, () => saveStepImage(noteId, file));
        }} onPaste={(event) => {
          const file = Array.from(event.clipboardData.files ?? []).find((entry) => entry.type.startsWith("image/"));
          const html = event.clipboardData.getData("text/html");
          const src = html ? new DOMParser().parseFromString(html, "text/html").querySelector('img[src^="data:image/"]')?.getAttribute("src") : null;
          if (!file && !src) return;
          event.preventDefault(); event.stopPropagation();
          void importImage(index, () => file ? saveStepImage(noteId, file) : saveStepDataImage(noteId, src!));
        }}>
        <div className="htnote-steps-editor-row">
          <span className="htnote-steps-editor-number" aria-hidden>{index + 1}</span>
          <SingleLineTextarea ref={(field) => { headings.current[index] = field; }} data-testid="steps-heading" data-step-heading
            aria-label={t("editor.steps.heading", { index: index + 1 })} placeholder={t("editor.steps.heading", { index: index + 1 })}
            value={item.heading} onChange={(event) => patch(index, { heading: singleLineWidgetText(event.target.value) })}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text/plain");
              if (/[\r\n]/.test(pasted)) { event.preventDefault(); const field = event.currentTarget; patch(index, { heading: singleLineWidgetText(item.heading.slice(0, field.selectionStart) + pasted + item.heading.slice(field.selectionEnd)) }); }
            }} onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
              if (event.key === "Enter") { event.preventDefault(); descriptions.current[index]?.focus(); }
              else if (event.key === "Backspace" && isEmptyStep(item) && items.length > 1) { event.preventDefault(); remove(index); }
              else navigate(event);
            }} />
          <div className="htnote-steps-editor-actions">
            <button type="button" aria-label={t("editor.steps.up", { index: index + 1 })} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} aria-hidden /></button>
            <button type="button" aria-label={t("editor.steps.down", { index: index + 1 })} disabled={index === items.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} aria-hidden /></button>
            <button type="button" aria-label={t("editor.steps.remove", { index: index + 1 })} onClick={() => remove(index)}><Trash2 size={14} aria-hidden /></button>
          </div>
        </div>
        <GrowingTextarea ref={(field) => { descriptions.current[index] = field; }} data-testid="steps-text" aria-label={t("editor.steps.text", { index: index + 1 })}
          placeholder={t("editor.steps.text", { index: index + 1 })} value={item.text} onChange={(event) => patch(index, { text: event.target.value })} onKeyDown={navigate} />
        {item.code !== null && <div className="htnote-steps-editor-code">
          <div><span>{t("editor.steps.code")}</span><button type="button" onClick={() => patch(index, { code: null })}>{t("editor.steps.removeCode")}</button></div>
          <GrowingTextarea data-testid="steps-code" aria-label={t("editor.steps.code")} value={item.code} spellCheck={false} onChange={(event) => patch(index, { code: event.target.value })} onKeyDown={navigate} />
        </div>}
        {item.image && <div className="htnote-steps-editor-image">
          <img src={resolveMediaSrc(noteId, item.image.src)} alt={item.image.alt} draggable={false} />
          <div><label>{t("editor.image.alt")}<input data-testid="steps-alt" value={item.image.alt} onChange={(event) => patch(index, { image: { ...item.image!, alt: event.target.value } })} onKeyDown={navigate} /></label>
            <button type="button" onClick={() => { void selectImage(index); }}>{t("editor.steps.replaceImage")}</button>
            <button type="button" onClick={() => patch(index, { image: null })}>{t("editor.steps.removeImage")}</button></div>
        </div>}
        <div className="htnote-steps-editor-additions">
          {item.code === null && <button type="button" data-testid="steps-add-code" onClick={() => patch(index, { code: "" })}><Code2 size={14} aria-hidden />{t("editor.steps.addCode")}</button>}
          {!item.image && <button type="button" data-testid="steps-add-image" onClick={() => { void selectImage(index); }}><ImagePlus size={14} aria-hidden />{t("editor.steps.addImage")}</button>}
        </div>
      </div>)}
    </div>
    <button type="button" className="htnote-steps-editor-add" data-testid="steps-add" onClick={() => change([...items, emptyStep()], items.length)}><Plus size={14} aria-hidden />{t("editor.steps.add")}</button>
  </NodeViewWrapper>;
}
