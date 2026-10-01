import { useCallback, useEffect, useRef } from "react";

export function useHoverExpand(toggle: (path: string) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const hover = useCallback((path: string | null, closed: boolean, stillClosed: () => boolean = () => true) => {
    clear();
    if (path && closed) timer.current = setTimeout(() => {
      timer.current = null;
      if (stillClosed()) toggle(path);
    }, 700);
  }, [clear, toggle]);
  return { hover, clear };
}
