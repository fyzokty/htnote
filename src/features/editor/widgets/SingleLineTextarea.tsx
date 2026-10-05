import type { ComponentPropsWithRef } from "react";
import { useTextareaSizing } from "./useTextareaSizing";

export function SingleLineTextarea({ ref, ...props }: ComponentPropsWithRef<"textarea"> & { value: string }) {
  const contentRef = useTextareaSizing(props.value, 1);
  return <textarea {...props} rows={1} ref={(field) => {
    contentRef.current = field;
    if (typeof ref === "function") ref(field);
    else if (ref) ref.current = field;
  }} onKeyDown={(event) => {
    // Değiştirici tuşlar ve IME mevcut gezinmeyi korur; hiçbir Enter satır sonu yazmaz.
    if (event.key === "Enter" && !event.nativeEvent.isComposing) event.preventDefault();
    props.onKeyDown?.(event);
  }} />;
}
