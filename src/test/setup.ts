import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";
import i18n from "@/i18n";

void i18n.changeLanguage("tr");

// jsdom Range ölçümlerini sağlamaz; ProseMirror odak kaydırırken bunları kullanır.
Range.prototype.getClientRects = () => document.createElement("span").getClientRects();
Range.prototype.getBoundingClientRect = () => document.createElement("span").getBoundingClientRect();

// Her testten sonra DOM ve Tauri IPC mock'ları sıfırlanır; testler birbirini etkilemez.
afterEach(() => {
  cleanup();
  clearMocks();
});
