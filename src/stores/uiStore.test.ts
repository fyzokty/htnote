import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useUiStore } from "@/stores/uiStore";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  useUiStore.getState().toasts.forEach((toast) => useUiStore.getState().dismissToast(toast.id));
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("toast queue", () => {
  it("dördüncü toast geldiğinde en eskisini ve zamanlayıcısını kaldırır", () => {
    const { pushToast } = useUiStore.getState();
    const first = pushToast({ kind: "info", messageKey: "first" });
    pushToast({ kind: "success", messageKey: "second" });
    pushToast({ kind: "info", messageKey: "third" });
    pushToast({ kind: "error", messageKey: "fourth" });
    expect(useUiStore.getState().toasts).toHaveLength(3);
    expect(useUiStore.getState().toasts.some((toast) => toast.id === first)).toBe(false);
    expect(vi.getTimerCount()).toBe(3);
  });

  it("bilgi toast'ını 4 saniyede kapatır", () => {
    useUiStore.getState().pushToast({ kind: "info", messageKey: "info" });
    vi.advanceTimersByTime(3999);
    expect(useUiStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it("hata toast'ını 8 saniyede kapatır", () => {
    useUiStore.getState().pushToast({ kind: "error", messageKey: "error" });
    vi.advanceTimersByTime(7999);
    expect(useUiStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useUiStore.getState().toasts).toHaveLength(0);
  });

  it("elle kapatıldığında zamanlayıcıyı temizler", () => {
    const id = useUiStore.getState().pushToast({ kind: "info", messageKey: "info" });
    useUiStore.getState().dismissToast(id);
    expect(useUiStore.getState().toasts).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
