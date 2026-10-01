import { createRef } from "react";
import { Editor } from "@tiptap/core";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createVisualExtensions } from "@/features/editor/extensions";
import { VisualEditor } from "@/features/editor/VisualEditor";
import type { VisualEditorHandle } from "@/features/editor/VisualEditor";

function normalized(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("colgroup").forEach((element) => element.remove());
  container.querySelectorAll("[style], a[rel], a[target]").forEach((element) => {
    element.removeAttribute("style");
    element.removeAttribute("rel");
    element.removeAttribute("target");
  });
  if (container.lastElementChild?.outerHTML === "<p></p>") container.lastElementChild.remove();
  return container.innerHTML;
}

afterEach(() => vi.useRealTimers());

describe("VisualEditor", () => {
  it("round trips supported blocks and marks", () => {
    const fixture = '<h2>Başlık</h2><p><strong>Kalın</strong> <em>İtalik</em> <u>Altı çizili</u> <s>Çizili</s> <a href="https://example.com">Link</a></p><ul><li><p>Madde</p></li></ul><blockquote><p>Alıntı</p></blockquote><pre><code>Kod</code></pre><hr><table><tbody><tr><th><p>Başlık</p></th><td><p>Hücre</p></td></tr></tbody></table>';
    const editor = new Editor({ extensions: createVisualExtensions(""), content: fixture });
    editor.commands.setContent(fixture);
    expect(normalized(editor.getHTML())).toBe(normalized(fixture));
    editor.destroy();
  });

  it("debounces changes and flushes on unmount", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<VisualEditor initialInner="<p>First</p>" onChange={onChange} />);
    screen.getByRole("textbox", { name: "Not içeriği" });
    act(() => { fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } }); });
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(150));
    expect(onChange).toHaveBeenCalledWith("<h2>First</h2>");
    act(() => { fireEvent.change(screen.getByRole("combobox"), { target: { value: "p" } }); });
    view.unmount();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("flushes a pending change before saving or switching modes", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const ref = createRef<VisualEditorHandle>();
    render(<VisualEditor ref={ref} initialInner="<p>First</p>" onChange={onChange} />);
    act(() => fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } }));
    expect(onChange).not.toHaveBeenCalled();
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalledWith("<h2>First</h2>");
    act(() => vi.advanceTimersByTime(200));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not render when visual editing is unavailable", () => {
    render(<VisualEditor initialInner="<p>Test</p>" onChange={vi.fn()} visualAvailable={false} />);
    expect(screen.queryByRole("toolbar")).toBeNull();
  });

  it("does not report an unchanged document as dirty", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<VisualEditor initialInner={'<p class="x" data-y="1">A</p><canvas></canvas><script>run()</script>'} onChange={onChange} />);
    act(() => vi.advanceTimersByTime(300));
    view.unmount();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserves raw canvas and script after a rich block edit", () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const view = render(<VisualEditor initialInner={'<p class="x" data-y="1">A</p><canvas id="c"></canvas><script>run()</script>'} onChange={onChange} />);
    act(() => { fireEvent.change(screen.getByRole("combobox"), { target: { value: "h2" } }); });
    act(() => vi.advanceTimersByTime(150));
    const result = onChange.mock.lastCall?.[0] as string;
    expect(result).toContain('<canvas id="c"></canvas><script>run()</script>');
    expect(result).toContain('data-y="1"');
    expect(result).not.toContain("htnote-raw");
    view.unmount();
  });

});
