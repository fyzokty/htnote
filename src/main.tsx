import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import "@/i18n";
import { applyThemeClass, readCachedThemeMode } from "@/lib/theme";
import "@/index.css";

applyThemeClass(readCachedThemeMode() ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>,
);
