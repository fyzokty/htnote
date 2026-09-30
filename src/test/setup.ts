import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";
import i18n from "@/i18n";

void i18n.changeLanguage("tr");

// Her testten sonra DOM ve Tauri IPC mock'ları sıfırlanır; testler birbirini etkilemez.
afterEach(() => {
  cleanup();
  clearMocks();
});
