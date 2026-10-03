import { useEffect, useRef, useState } from "react";

interface Props {
  name: string;
  label: string;
  variant?: "box" | "underline";
  className?: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}

export function InlineRename({ name, label, variant = "box", className, onConfirm, onCancel }: Props) {
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

  if (variant === "underline") {
    return (
      <span className="inline-grid max-w-full items-center align-baseline">
        <span
          className="invisible col-start-1 row-start-1 whitespace-pre font-semibold py-0.5 border-b-2 border-transparent select-none"
          aria-hidden
        >
          {value || " "}
        </span>
        <input
          ref={input}
          value={value}
          aria-label={label}
          onChange={(event) => setValue(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onBlur={confirm}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") { event.preventDefault(); confirm(); }
            if (event.key === "Escape") { event.preventDefault(); cancel(); }
          }}
          className={className ?? "select-text col-start-1 row-start-1 w-full min-w-[2ch] bg-transparent border-0 border-b-2 border-app-accent outline-none text-app-text font-semibold py-0.5 p-0 m-0 rounded-none"}
        />
      </span>
    );
  }

  return (
    <input
      ref={input}
      value={value}
      aria-label={label}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={confirm}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") { event.preventDefault(); confirm(); }
        if (event.key === "Escape") { event.preventDefault(); cancel(); }
      }}
      className={className ?? "select-text min-w-0 flex-1 rounded bg-app-bg px-1 text-app-text outline outline-app-accent"}
    />
  );
}
