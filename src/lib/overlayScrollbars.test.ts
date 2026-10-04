import { afterEach, expect, it, vi } from "vitest";
import { installOverlayScrollbars, scrollbarGeometry, scrollFromDrag } from "./overlayScrollbars";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("maps viewport proportions and clamps drag positions, including small tracks", () => {
  expect(scrollbarGeometry(100, 400, 150)).toEqual({ length: 25, travel: 75, range: 300, offset: 37.5 });
  expect(scrollFromDrag(150, 25, 300, 75)).toBe(250);
  expect(scrollFromDrag(150, -100, 300, 75)).toBe(0);
  expect(scrollFromDrag(150, 100, 300, 75)).toBe(300);
  expect(scrollbarGeometry(10, 400, 0).travel).toBe(0);
  expect(scrollbarGeometry(100, 100, 0).range).toBe(0);
});

function createScrollContainer() {
  const element = document.createElement("div");
  element.style.overflowY = "auto";
  Object.defineProperties(element, { clientHeight: { value: 100 }, clientWidth: { value: 120 }, scrollHeight: { value: 400 } });
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 120, bottom: 100, width: 120, height: 100, x: 0, y: 0, toJSON: () => {} });
  document.body.append(element);
  return element;
}

function stubResizeObserver() {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
}

it.each(['[contenteditable="true"]', ".ProseMirror", ".cm-content", ".cm-line", "[data-overlay-scrollbars]"])("skips scanning %s and its mutations", async (selector) => {
  vi.useFakeTimers();
  stubResizeObserver();
  const element = createScrollContainer();
  const editor = document.createElement("div");
  if (selector.startsWith(".")) editor.className = selector.slice(1);
  else if (selector.includes("contenteditable")) editor.setAttribute("contenteditable", "true");
  else editor.dataset.overlayScrollbars = "true";
  editor.innerHTML = "<p>text</p>".repeat(1000);
  element.append(editor);
  const computed = vi.spyOn(window, "getComputedStyle");
  const dispose = installOverlayScrollbars();
  try {
    await vi.advanceTimersByTimeAsync(20);
    expect(computed.mock.calls.some(([target]) => editor.contains(target))).toBe(false);
    expect(document.querySelectorAll(".htnote-overlay-scrollbar")).toHaveLength(2);
    computed.mockClear();
    editor.firstElementChild!.append(document.createElement("span"));
    editor.firstElementChild!.setAttribute("class", "edited");
    await vi.advanceTimersByTimeAsync(20);
    // Yalnızca kayıtlı kabın boyut ve konum güncellemesi stil okur.
    expect(computed.mock.calls.map(([target]) => target)).toEqual([element]);
    computed.mockClear();
    editor.firstElementChild!.firstChild!.textContent = "changed";
    await vi.advanceTimersByTimeAsync(20);
    expect(computed).not.toHaveBeenCalled();
  } finally { dispose(); element.remove(); }
});

it("updates only the scrolling or hovered container and reuses ancestor styles", async () => {
  vi.useFakeTimers();
  stubResizeObserver();
  const first = createScrollContainer();
  const second = createScrollContainer();
  const computed = vi.spyOn(window, "getComputedStyle");
  const dispose = installOverlayScrollbars();
  try {
    await vi.advanceTimersByTimeAsync(20);
    const tracks = document.querySelectorAll<HTMLElement>('.htnote-overlay-scrollbar[data-axis="y"]');
    const firstThumb = tracks[0].firstElementChild as HTMLElement;
    const secondThumb = tracks[1].firstElementChild as HTMLElement;
    computed.mockClear();
    vi.mocked(first.getBoundingClientRect).mockClear();
    vi.mocked(second.getBoundingClientRect).mockClear();
    first.scrollTop = 100;
    first.dispatchEvent(new Event("scroll"));
    await vi.advanceTimersByTimeAsync(20);
    expect(firstThumb.style.top).toBe("25px");
    expect(secondThumb.style.top).toBe("0px");
    expect(first.getBoundingClientRect).toHaveBeenCalledTimes(1);
    expect(second.getBoundingClientRect).not.toHaveBeenCalled();
    expect(computed.mock.calls.map(([target]) => target)).toEqual([first]);
    computed.mockClear();
    second.dispatchEvent(new Event("pointerenter"));
    await vi.advanceTimersByTimeAsync(20);
    expect(computed.mock.calls.map(([target]) => target)).toEqual([second]);
    expect(first.getBoundingClientRect).toHaveBeenCalledTimes(1);
  } finally { dispose(); first.remove(); second.remove(); }
});

it("shows on passive scroll, hides after 800ms, tracks hover, resizes and cleans up", async () => {
  vi.useFakeTimers();
  let resized: () => void = () => {};
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resized = callback; }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  const element = document.createElement("div");
  element.style.overflowY = "auto";
  Object.defineProperties(element, { clientHeight: { value: 100 }, clientWidth: { value: 120 }, scrollHeight: { value: 400, configurable: true } });
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, right: 120, bottom: 100, width: 120, height: 100, x: 0, y: 0, toJSON: () => {} });
  document.body.append(element);
  const dispose = installOverlayScrollbars();
  try {
    await vi.advanceTimersByTimeAsync(20);
    const track = document.querySelector<HTMLElement>('.htnote-overlay-scrollbar[data-axis="y"]')!;
    const thumb = track.firstElementChild as HTMLElement;
    expect(thumb.style.height).toBe("25px");
    element.scrollBy = vi.fn();
    track.dispatchEvent(new WheelEvent("wheel", { deltaY: 20 }));
    expect(element.scrollBy).toHaveBeenCalledWith({ left: 0, top: 20, behavior: "instant" });
    thumb.setPointerCapture = vi.fn();
    thumb.hasPointerCapture = () => true;
    thumb.releasePointerCapture = vi.fn();
    thumb.dispatchEvent(new MouseEvent("pointerdown", { button: 0, clientY: 10 }));
    thumb.dispatchEvent(new MouseEvent("pointermove", { clientY: 35 }));
    expect(element.scrollTop).toBe(100);
    thumb.dispatchEvent(new MouseEvent("pointerup"));
    expect(thumb.releasePointerCapture).toHaveBeenCalled();

    element.dispatchEvent(new Event("scroll"));
    expect(track.dataset.visible).toBe("true");
    await vi.advanceTimersByTimeAsync(799);
    expect(track.dataset.visible).toBe("true");
    await vi.advanceTimersByTimeAsync(1);
    expect(track.dataset.visible).toBe("false");
    element.dispatchEvent(new Event("pointerenter"));
    expect(track.dataset.visible).toBe("true");
    element.dispatchEvent(new Event("pointerleave"));
    expect(track.dataset.visible).toBe("false");
    Object.defineProperty(element, "scrollHeight", { value: 200 });
    resized();
    await vi.advanceTimersByTimeAsync(20);
    expect(thumb.style.height).toBe("50px");
    dispose();
    expect(document.querySelector("[data-overlay-scrollbars]")).toBeNull();
  } finally { dispose(); element.remove(); }
});
