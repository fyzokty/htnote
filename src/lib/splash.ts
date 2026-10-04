export function hideSplash(doc: Document = document): void {
  const splash = doc.getElementById("htnote-splash");
  if (!splash || splash.dataset.state === "hidden") return;
  splash.dataset.state = "hidden";
  const view = doc.defaultView;
  if (view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    splash.remove();
    return;
  }
  const remove = () => {
    clearTimeout(timer);
    splash.removeEventListener("transitionend", onTransitionEnd);
    splash.remove();
  };
  const onTransitionEnd = (event: TransitionEvent) => {
    if (event.target === splash && event.propertyName === "opacity") remove();
  };
  const timer = setTimeout(remove, 400);
  splash.addEventListener("transitionend", onTransitionEnd);
}
