import { applyReducedMotion, readSystemReducedMotion } from "@/lib/motion";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "@/App";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import "@/i18n";
import { applyThemeClass, readCachedThemeMode } from "@/lib/theme";
import { ipc } from "@/lib/ipc";
import { initNoteOrigin } from "@/lib/noteUrl";
import { installContextMenuGuard } from "@/lib/contextMenuGuard";
import { OverlayScrollbars } from "@/components/ui/OverlayScrollbars";
import "@fontsource-variable/plus-jakarta-sans/wght.css";
import "@/index.css";

applyReducedMotion(readSystemReducedMotion());
installContextMenuGuard();
applyThemeClass(readCachedThemeMode() ?? (window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

void ipc.getNoteOrigin().then((origin) => {
  initNoteOrigin(origin);
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <ErrorBoundary><OverlayScrollbars /><App /></ErrorBoundary>
    </React.StrictMode>,
  );
});
