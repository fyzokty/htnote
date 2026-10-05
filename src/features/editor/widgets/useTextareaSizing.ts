import { useLayoutEffect, useRef } from "react";

// field-sizing bulunmayan motorlarda metin kutusu ve satır alanları aynı yedeği kullanır.
export function useTextareaSizing(value: string, rows: number, force = false) {
  const content = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const field = content.current;
    if (!field || (!force && window.CSS?.supports?.("field-sizing", "content"))) return;
    const resize = () => {
      const style = getComputedStyle(field);
      const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
      field.style.height = "auto";
      field.style.height = `${Math.max(field.scrollHeight + border, rows * (parseFloat(style.lineHeight) || 21))}px`;
    };
    resize();
    // Pano hücresi daralınca yedek de yeniden sarılan içeriğin yüksekliğini izler.
    let width = field.getBoundingClientRect().width;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      const nextWidth = field.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; resize(); }
    });
    observer?.observe(field);
    return () => observer?.disconnect();
  }, [content, value, rows, force]);
  return content;
}
