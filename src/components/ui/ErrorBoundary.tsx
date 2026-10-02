import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import i18n from "@/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-app-bg p-6 text-center text-app-text">
          <h1 className="text-xl font-semibold">{i18n.t("errorBoundary.title")}</h1>
          <p className="select-text text-app-muted">{i18n.t("errorBoundary.description")}</p>
          <Button type="button" variant="primary" onClick={() => window.location.reload()}>
            {i18n.t("errorBoundary.reload")}
          </Button>
        </main>
      );
    }
    return this.props.children;
  }
}
