import { useEffect, useRef } from "react";

export function useHoverExpand(toggle: (path: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const hover = (path: string | null, closed: boolean) => {
    clear();
    if (path && closed) timer.current = setTimeout(() => { timer.current = null; toggle(path); }, 700);
  };
  return { hover, clear };
}
