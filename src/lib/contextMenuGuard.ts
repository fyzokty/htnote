const textInputTypes = new Set(["text", "search", "email", "url", "tel", "password", "number"]);

export function allowsNativeContextMenu(target: EventTarget | null, selection: Selection | null): boolean {
  const element = target instanceof Element ? target : target instanceof Node ? target.parentElement : null;
  if (!element) return false;
  if (element.closest("textarea, .cm-editor")) return true;
  if (element instanceof HTMLInputElement && textInputTypes.has(element.type)) return true;
  const editable = element.closest("[contenteditable]")?.getAttribute("contenteditable")?.toLowerCase();
  if (editable === "" || editable === "true" || editable === "plaintext-only") return true;

  // Başka bir alandaki seçim, bu hedefin varsayılan menüsünü açmamalı.
  if (selection && selection.toString().trim()) {
    for (let index = 0; index < selection.rangeCount; index++) {
      const range = selection.getRangeAt(index);
      if (!range.collapsed && range.intersectsNode(element)) return true;
    }
  }
  return false;
}

export function installContextMenuGuard(): () => void {
  const guard = (event: MouseEvent) => {
    if (!allowsNativeContextMenu(event.target, window.getSelection())) event.preventDefault();
  };
  // Bubble aşaması, React bileşenlerinin kendi menülerini önce açmasını sağlar.
  window.addEventListener("contextmenu", guard);
  return () => window.removeEventListener("contextmenu", guard);
}
