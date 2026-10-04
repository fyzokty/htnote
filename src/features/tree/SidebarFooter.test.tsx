import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { SidebarFooter } from "./SidebarFooter";
import { resetTabsStoreForTests } from "@/stores/tabsStore";
import { useUiStore } from "@/stores/uiStore";
beforeEach(() => { resetTabsStoreForTests(); useUiStore.setState({ trashCount: 4 }); });
it("shows trash count and settings hint and highlights the selected view", () => {
  render(<SidebarFooter />);
  expect(screen.getByTestId("trash")).toHaveTextContent("4");
  expect(screen.getByTestId("settings")).toHaveTextContent("Ctrl+,");
  fireEvent.click(screen.getByTestId("settings"));
  expect(screen.getByTestId("settings")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("settings")).toHaveClass("bg-app-selected");
  fireEvent.click(screen.getByTestId("trash"));
  expect(screen.getByTestId("trash")).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("settings")).toHaveAttribute("aria-pressed", "false");
});
