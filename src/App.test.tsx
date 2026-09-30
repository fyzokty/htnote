import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "@/App";

describe("App", () => {
  it("uygulama kabuğunu render eder", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "HTNote" })).toBeInTheDocument();
  });
});
