import type { Command } from "@tiptap/core";

export function insertWidget(name: string): Command {
  return ({ tr, commands }) => {
    const { $from } = tr.selection;
    // Boş paragrafın yerini al; dolu paragrafı bölmeden widget'ı arkasına ekle.
    if ($from.parent.type.name === "paragraph" && $from.parent.content.size) {
      return commands.insertContentAt($from.after(), { type: name });
    }
    return commands.insertContent({ type: name });
  };
}
