import { getCurrentWindow } from "@tauri-apps/api/window";

import { onMaximizeOverlayState } from "@/lib/events";
import type { MaximizeOverlayState } from "@/lib/events";

export interface WindowState {
  maximized: boolean;
  focused: boolean;
}

type Unlisten = () => void;

/** Test ortamı ve önizleme gibi Tauri penceresi olmayan bağlamlarda pencere API'si çağrılmaz. */
export function hasNativeWindow(): boolean {
  const internals = (window as Window & { __TAURI_INTERNALS__?: { metadata?: { currentWindow?: unknown } } }).__TAURI_INTERNALS__;
  return Boolean(internals?.metadata?.currentWindow);
}

export function minimizeWindow(): Promise<void> {
  return hasNativeWindow() ? getCurrentWindow().minimize() : Promise.resolve();
}

export function toggleMaximizeWindow(): Promise<void> {
  return hasNativeWindow() ? getCurrentWindow().toggleMaximize() : Promise.resolve();
}

/** `destroy()` değil: `onCloseRequested` koruması kaydedilmemiş değişiklikleri sorabilsin. */
export function closeWindow(): Promise<void> {
  return hasNativeWindow() ? getCurrentWindow().close() : Promise.resolve();
}

function bindListeners(registrations: Promise<Unlisten>[]): Unlisten {
  let disposed = false;
  const unlisteners: Unlisten[] = [];
  for (const registration of registrations) {
    void registration.then((unlisten) => {
      if (disposed) unlisten();
      else unlisteners.push(unlisten);
    }, () => {});
  }
  return () => {
    disposed = true;
    for (const unlisten of unlisteners.splice(0)) unlisten();
  };
}

/** Büyütülmüş ve etkin pencere durumunu izler; Win+Ok, sürükleyip yaslama ve snap de yakalanır. */
export function subscribeWindowState(onChange: (state: WindowState) => void): Unlisten {
  if (!hasNativeWindow()) return () => {};
  const current = getCurrentWindow();
  let disposed = false;
  let state: WindowState = { maximized: false, focused: true };
  const publish = (patch: Partial<WindowState>) => {
    if (disposed) return;
    const next = { ...state, ...patch };
    if (next.maximized === state.maximized && next.focused === state.focused) return;
    state = next;
    onChange(state);
  };
  const refreshMaximized = () => { void current.isMaximized().then((maximized) => publish({ maximized }), () => {}); };
  refreshMaximized();
  void current.isFocused().then((focused) => publish({ focused }), () => {});
  const unlisten = bindListeners([
    current.onResized(refreshMaximized),
    current.onFocusChanged(({ payload }) => publish({ focused: payload })),
  ]);
  return () => { disposed = true; unlisten(); };
}

export function subscribeMaximizeOverlay(onChange: (state: MaximizeOverlayState) => void): Unlisten {
  if (!hasNativeWindow()) return () => {};
  return bindListeners([onMaximizeOverlayState(onChange)]);
}
