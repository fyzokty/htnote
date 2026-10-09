import type { Command } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { widgetMotionKey, widgetMotionReduced } from "./widgetMotion";

export function insertWidget(name: string): Command {
  return ({ tr, commands, dispatch }) => {
    const before = new Set<Node>();
    tr.doc.descendants((node) => { if (node.type.name === name) before.add(node); });
    const { $from } = tr.selection;
    // Boş paragrafın yerini al; dolu paragrafı bölmeden widget'ı arkasına ekle.
    const inserted = $from.parent.type.name === "paragraph" && $from.parent.content.size
      ? commands.insertContentAt($from.after(), { type: name })
      : commands.insertContent({ type: name });
    if (inserted && dispatch && !widgetMotionReduced()) {
      const nodes: Node[] = tr.getMeta(widgetMotionKey) ?? [];
      tr.doc.descendants((node) => { if (node.type.name === name && !before.has(node)) nodes.push(node); });
      tr.setMeta(widgetMotionKey, nodes);
    }
    return inserted;
  };
}
