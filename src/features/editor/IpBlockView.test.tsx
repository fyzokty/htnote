import { createRef } from "react";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisualEditor, type VisualEditorHandle } from "./VisualEditor";
import { serializeIpBlock } from "./ipBlock";
import { useEditSession } from "./useEditSession";
import { resetTabsStoreForTests, useTabsStore } from "@/stores/tabsStore";

describe("IpBlockView", () => {
  it("updates defaults, counts hosts, reports errors, flushes drafts and uses node history", async () => {
    vi.useFakeTimers(); resetTabsStoreForTests();
    const initial = serializeIpBlock({ title: "", gateway: "10.67.106.14", prefix: 28, html: null });
    useTabsStore.getState().openNote("ip", { editBase: { html: `<main id="htnote-content">${initial}</main>`, css: null, js: null, contentHash: "base" } });
    const { result, unmount: unmountHook } = renderHook(() => useEditSession("ip"));
    const ref = createRef<VisualEditorHandle>();
    const { unmount } = render(<VisualEditor ref={ref} initialInner={initial} onChange={result.current.onVisualChange} />);
    const editor = (screen.getByRole("textbox", { name: "Not içeriği" }) as HTMLElement & { editor: Editor }).editor;
    const gateway = screen.getByTestId("ipblock-gateway") as HTMLInputElement;
    const prefix = screen.getByTestId("ipblock-prefix") as HTMLSelectElement;
    try {
      expect(screen.getByTestId("ipblock-count")).toHaveTextContent("13 adres");
      expect(screen.getByTestId("ipblock-preview").textContent?.split("\n")).toHaveLength(5);
      await act(async () => { fireEvent.change(screen.getByTestId("ipblock-title"), { target: { value: "Saved" } }); });
      await act(async () => { fireEvent.keyDown(screen.getByTestId("ipblock-title"), { key: "Enter" }); }); expect(gateway).toHaveFocus();
      await act(async () => { fireEvent.keyDown(gateway, { key: "Enter" }); }); expect(prefix).toHaveFocus();
      act(() => { editor.view.dispatch(closeHistory(editor.state.tr)); });
      await act(async () => { fireEvent.change(prefix, { target: { value: "30" } }); });
      expect(screen.getByTestId("ipblock-count")).toHaveTextContent("1 adres");
      expect(screen.getByTestId("ipblock-preview")).toHaveTextContent("10.67.106.13");
      await act(async () => { fireEvent.keyDown(prefix, { key: "z", ctrlKey: true }); }); expect(prefix.value).toBe("28");
      await act(async () => { fireEvent.keyDown(prefix, { key: "y", ctrlKey: true }); }); expect(prefix.value).toBe("30");
      await act(async () => { fireEvent.change(gateway, { target: { value: "" } }); });
      expect(gateway).toHaveAttribute("aria-invalid", "false");
      expect(gateway.getAttribute("aria-describedby")).not.toContain("error");
      expect(screen.getByText("Geçerli bir IP ve alt ağ girildiğinde kullanılabilir adresler listelenecektir.")).toBeInTheDocument();
      expect(screen.queryByTestId("ipblock-preview")).toBeNull();
      expect(screen.getByTestId("ipblock-count")).toHaveTextContent("0 adres");
      await act(async () => { fireEvent.change(gateway, { target: { value: "10.67.106.12" } }); });
      expect(gateway).toHaveAttribute("aria-invalid", "true");
      expect(document.getElementById(gateway.getAttribute("aria-describedby")!)).toHaveTextContent("Ağ geçidi bu blokta ağ veya yayın adresi olamaz");
      expect(screen.queryByTestId("ipblock-preview")).toBeNull(); expect(screen.getByTestId("ipblock-count")).toHaveTextContent("0 adres");
      await act(async () => { fireEvent.change(gateway, { target: { value: "10.67.106.13" } }); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Widget arka planı" })); });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Nane" })); });
      act(() => { ref.current?.flush(); vi.advanceTimersByTime(150); });
      expect(useTabsStore.getState().tabs[0].doc.dirty).toBe(true);
      expect(useTabsStore.getState().tabs[0].doc.draft?.html).toContain('data-htnote-gw="10.67.106.13"');
      expect(useTabsStore.getState().tabs[0].doc.draft?.html).toContain('data-htnote-prefix="30"');
      expect(useTabsStore.getState().tabs[0].doc.draft?.html).toContain('data-htnote-bg="mint"');
      gateway.focus(); gateway.setSelectionRange(gateway.value.length, gateway.value.length);
      await act(async () => { fireEvent.keyDown(gateway, { key: "ArrowDown" }); });
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    } finally { unmount(); unmountHook(); resetTabsStoreForTests(); vi.useRealTimers(); }
  });
});
