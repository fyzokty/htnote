export function measureSegment(button: Pick<HTMLElement, "offsetLeft" | "offsetWidth" | "offsetTop" | "offsetHeight">) {
  return { left: button.offsetLeft, width: button.offsetWidth, top: button.offsetTop, height: button.offsetHeight };
}
