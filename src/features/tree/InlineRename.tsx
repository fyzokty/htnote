import { useEffect, useRef, useState } from "react";

interface Props {
  name: string;
  label: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function InlineRename({ name, label, onConfirm, onCancel }: Props) {
  const [value, setValue] = useState(name);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => { input.current?.focus(); input.current?.select(); }, []);

  function confirm() {
    if (done.current) return;
    done.current = true;
    const trimmed = value.trim();
    if (!trimmed || trimmed === name) onCancel();
    else onConfirm(trimmed);
  }

  function cancel() {
    if (done.current) return;
    done.current = true;
    onCancel();
  }

  return <input ref={input} value={value} aria-label={label} onChange={(event) => setValue(event.target.value)} onClick={(event) => event.stopPropagation()} onBlur={confirm} onKeyDown={(event) => {
    event.stopPropagation();
    if (event.key === "Enter") { event.preventDefault(); confirm(); }
    if (event.key === "Escape") { event.preventDefault(); cancel(); }
  }} className="select-text min-w-0 flex-1 rounded bg-app-bg px-1 text-app-text outline outline-app-accent" />;
}
