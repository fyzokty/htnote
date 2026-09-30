import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { clearMocks } from "@tauri-apps/api/mocks";

// Her testten sonra DOM ve Tauri IPC mock'ları sıfırlanır; testler birbirini etkilemez.
afterEach(() => {
  cleanup();
  clearMocks();
});
