import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ErrorBoundary } from "@/components/ui/ErrorBoundary";

afterEach(() => vi.restoreAllMocks());

function Broken(): ReactNode {
  throw new Error("render failed");
}

it("render hatasında yedek ekranı gösterir", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(<ErrorBoundary><Broken /></ErrorBoundary>);
  expect(screen.getByRole("heading", { name: "Bir şeyler ters gitti" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Yeniden yükle" })).toBeInTheDocument();
});
