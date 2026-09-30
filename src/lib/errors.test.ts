import { act, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Toaster } from "@/components/ui/Toaster";
import i18n from "@/i18n";
import { appErrorCodes, isAppError, notifyError, toErrorMessageKey } from "@/lib/errors";
import { useUiStore } from "@/stores/uiStore";

afterEach(() => {
  useUiStore.getState().toasts.forEach((toast) => useUiStore.getState().dismissToast(toast.id));
  void i18n.changeLanguage("tr");
  vi.restoreAllMocks();
});

describe("isAppError", () => {
  it("bilinen kodlu hata nesnesini kabul eder", () => {
    expect(isAppError({ code: "NOTE_NOT_FOUND", message: "missing" })).toBe(true);
  });

  it("geçersiz değerleri reddeder", () => {
    expect(isAppError(null)).toBe(false);
    expect(isAppError("NOTE_NOT_FOUND")).toBe(false);
    expect(isAppError({ code: "NOTE_NOT_FOUND" })).toBe(false);
    expect(isAppError({ code: "UNKNOWN", message: "missing" })).toBe(false);
  });
});

describe("toErrorMessageKey", () => {
  it.each(appErrorCodes)("eşler: %s", (code) => {
    expect(toErrorMessageKey({ code, message: "private detail" })).toBe(`errors.${code}`);
  });

  it.each([
    { code: "UNRECOGNIZED", message: "private detail" },
    new Error("private detail"),
    "NAME_CONFLICT",
    null,
  ])("bilinmeyen hatayı eşler: %s", (error) => {
    expect(toErrorMessageKey(error)).toBe("errors.UNKNOWN");
  });

  it("yalnızca kod içeren IPC hatasını eşler", () => {
    expect(toErrorMessageKey({ code: "NAME_CONFLICT" })).toBe("errors.NAME_CONFLICT");
  });
});

describe("notifyError", () => {
  it("hata ayrıntısını loglar ve çevrilebilir toast ekler", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = { code: "NAME_CONFLICT", message: "private detail" };
    notifyError(error);
    expect(log).toHaveBeenCalledWith(error);
    expect(useUiStore.getState().toasts).toMatchObject([{ kind: "error", messageKey: "errors.NAME_CONFLICT" }]);
  });

  it("seçili dilde metin gösterir", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await i18n.changeLanguage("en");
    render(createElement(Toaster));
    act(() => notifyError({ code: "NAME_CONFLICT" }));
    expect(screen.getByText("This name is already in use.")).toBeInTheDocument();
  });
});
