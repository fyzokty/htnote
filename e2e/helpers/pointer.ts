import type { ChainablePromiseElement } from "webdriverio";

export interface PointerPoint { x: number; y: number }
interface PointerSnapshot {
  rect: { left: number; right: number; top: number; bottom: number; width: number; height: number } | null;
  runningAnimations: { count: number; names: string[] };
}
interface RecordedPoint extends PointerPoint { time: number; snapshot: PointerSnapshot }
interface PointerMeasurementResult {
  error?: string;
  measurement?: { point: PointerPoint; snapshot: PointerSnapshot };
}
export type PointerElement = WebdriverIO.Element | ChainablePromiseElement;
type EventKind = "pointermove" | "pointerdown" | "pointerup" | "mousemove" | "mousedown" | "mouseup";
type PointerAction = { type: "pointerMove"; duration: number; origin: { "element-6066-11e4-a52e-4f735466cecf": string }; x: number; y: number }
  | { type: "pointerDown" | "pointerUp"; button: number };

declare global {
  interface Window {
    __htnotePointerProbe?: {
      events: Partial<Record<EventKind, RecordedPoint>>;
      target?: Element;
      stop: () => void;
    };
  }
}

const tolerance = 2;
const pointerId = "calibrated-mouse";
const viewportInset = 5;

export async function clampPointerPoint(point: PointerPoint): Promise<PointerPoint> {
  return browser.execute((point, inset) => {
    const clamp = (value: number, size: number) => {
      const margin = Math.min(inset, Math.floor((size - 1) / 2));
      return Math.max(margin, Math.min(size - 1 - margin, Math.round(value)));
    };
    return { x: clamp(point.x, window.innerWidth), y: clamp(point.y, window.innerHeight) };
  }, point, viewportInset);
}
class PointerCoordinateError extends Error {}
const matches = (actual: PointerPoint | undefined, expected: PointerPoint) => actual
  && Math.abs(actual.x - expected.x) <= tolerance && Math.abs(actual.y - expected.y) <= tolerance;

async function measurePointer(element: PointerElement, timeout = 5000) {
  const result = await browser.executeAsync<PointerMeasurementResult, [WebdriverIO.Element, number]>((element, timeout, done) => {
    if (window.__htnotePointerProbe) window.__htnotePointerProbe.target = element;
    const snapshot = (): PointerSnapshot => {
      const rect = element.getBoundingClientRect();
      const running = document.getAnimations().filter((animation) => animation.playState === "running");
      return {
        rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height },
        runningAnimations: {
          count: running.length,
          names: running.map((animation) => (animation as CSSAnimation).animationName
            || (animation as CSSTransition).transitionProperty || animation.id || "Web Animation"),
        },
      };
    };
    let previous: PointerSnapshot | undefined;
    let latest: PointerSnapshot | undefined;
    let frame = 0;
    const timer = setTimeout(() => {
      cancelAnimationFrame(frame);
      done({ error: `Pointer target did not stabilize within ${timeout}ms: ${JSON.stringify(latest)}` });
    }, timeout);
    const sample = () => {
      latest = snapshot();
      if (previous && JSON.stringify(previous.rect) === JSON.stringify(latest.rect)
        && previous.runningAnimations.count === 0 && latest.runningAnimations.count === 0) {
        clearTimeout(timer);
        const rect = latest.rect!;
        const left = Math.max(0, rect.left);
        const right = Math.min(window.innerWidth, rect.right);
        const top = Math.max(0, rect.top);
        const bottom = Math.min(window.innerHeight, rect.bottom);
        if (left >= right || top >= bottom) {
          done({ error: "Pointer origin has no in-view center" });
        } else {
          // W3C element origins use the floored center of the visible rectangle.
          done({ measurement: { point: { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) }, snapshot: latest } });
        }
        return;
      }
      previous = latest;
      frame = requestAnimationFrame(sample);
    };
    frame = requestAnimationFrame(sample);
  }, await element.getElement(), timeout);
  if (result.error) throw new Error(result.error);
  return result.measurement!;
}

export async function pointerCenter(element: PointerElement): Promise<PointerPoint> {
  return (await measurePointer(element)).point;
}

export async function waitForPointerStable(element: PointerElement, timeout = 5000): Promise<void> {
  await measurePointer(element, timeout);
}

async function perform(actions: PointerAction[]) {
  await browser.performActions([{
    type: "pointer", id: pointerId, parameters: { pointerType: "mouse" }, actions,
  }]);
}

// Record in the current document and its visible child frames. A tab drag's
// vertical excursion crosses a sandboxed note frame, whose events do not bubble
// to the parent. WebDriver can install/read the recorder without changing that
// sandbox or dispatching synthetic events.
class PointerSession {
  private frames: WebdriverIO.Element[] = [];
  private measured?: PointerSnapshot;
  private observed?: PointerSnapshot;

  private async inFrame<T>(frame: WebdriverIO.Element, run: () => Promise<T>): Promise<T> {
    await browser.switchFrame(frame);
    try { return await run(); }
    finally { await browser.switchToParentFrame(); }
  }

  private async install() {
    await browser.execute(() => {
      window.__htnotePointerProbe?.stop();
      const events: Partial<Record<EventKind, RecordedPoint>> = {};
      const kinds: EventKind[] = ["pointermove", "pointerdown", "pointerup", "mousemove", "mousedown", "mouseup"];
      const record = (event: MouseEvent) => {
        if (!event.isTrusted) return;
        const rect = window.__htnotePointerProbe?.target?.getBoundingClientRect();
        const running = document.getAnimations().filter((animation) => animation.playState === "running");
        events[event.type as EventKind] = {
          x: event.clientX, y: event.clientY, time: performance.timeOrigin + event.timeStamp,
          snapshot: {
            rect: rect ? { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height } : null,
            runningAnimations: {
              count: running.length,
              names: running.map((animation) => (animation as CSSAnimation).animationName
                || (animation as CSSTransition).transitionProperty || animation.id || "Web Animation"),
            },
          },
        };
      };
      kinds.forEach((kind) => document.addEventListener(kind, record, true));
      window.__htnotePointerProbe = {
        events,
        stop: () => {
          kinds.forEach((kind) => document.removeEventListener(kind, record, true));
          delete window.__htnotePointerProbe;
        },
      };
    });
  }

  async start() {
    await this.install();
    for (const frame of await $$("iframe")) {
      if (!await frame.isDisplayed()) continue;
      const resolved = await frame.getElement();
      await this.inFrame(resolved, () => this.install());
      this.frames.push(resolved);
    }
  }

  private async clear() {
    const clear = () => browser.execute(() => {
      const events = window.__htnotePointerProbe?.events;
      if (events) for (const kind of Object.keys(events)) delete events[kind as EventKind];
    });
    await clear();
    for (const frame of this.frames) await this.inFrame(frame, clear);
  }

  private async actual(kind: EventKind): Promise<PointerPoint | undefined> {
    const read = () => browser.execute((kind) => window.__htnotePointerProbe?.events[kind], kind);
    let latest = await read();
    for (const frame of this.frames) {
      const event = await this.inFrame(frame, read);
      if (!event || (latest && event.time <= latest.time)) continue;
      const origin = await browser.execute((frame) => {
        const rect = frame.getBoundingClientRect();
        return { x: rect.left + frame.clientLeft, y: rect.top + frame.clientTop };
      }, frame);
      latest = { ...event, x: event.x + origin.x, y: event.y + origin.y };
    }
    this.observed = latest?.snapshot;
    return latest ? { x: latest.x, y: latest.y } : undefined;
  }

  private async moveAction(element: WebdriverIO.Element, point: PointerPoint, offset: PointerPoint, duration = 0): Promise<PointerAction> {
    const measurement = await measurePointer(element);
    const center = measurement.point;
    this.measured = measurement.snapshot;
    const command = await clampPointerPoint({ x: point.x - offset.x, y: point.y - offset.y });
    return {
      type: "pointerMove", duration,
      origin: { "element-6066-11e4-a52e-4f735466cecf": element.elementId },
      x: command.x - center.x, y: command.y - center.y,
    };
  }

  private error(kind: EventKind, point: PointerPoint, actual: PointerPoint | undefined, offset?: PointerPoint) {
    return new PointerCoordinateError(`WebDriver ${kind} coordinate drift: expected ${JSON.stringify(point)}, `
      + `received ${JSON.stringify(actual) ?? "no trusted event"}, correction ${JSON.stringify(offset ?? { x: 0, y: 0 })} (tolerance ±${tolerance}px)`
      + `; measurement ${JSON.stringify(this.measured)}, event ${JSON.stringify(this.observed) ?? "no trusted event"}`);
  }

  async move(element: WebdriverIO.Element, point: PointerPoint, duration = 0, approach = true) {
    point = await clampPointerPoint(point);
    // Wait for layout/animation stability before measuring each element origin.
    // Keep per-target corrections for any remaining driver coordinate mismatch.
    const offset = { x: 0, y: 0 };
    let actual: PointerPoint | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.clear();
      // A short approach ensures a fresh event when repeating a hover/click.
      if (approach || (attempt > 0 && !actual)) {
        await perform([await this.moveAction(element, { x: point.x + 2, y: point.y }, offset)]);
      }
      // An approach can move a dragged origin; measure again after it executes.
      await perform([await this.moveAction(element, point, offset, duration)]);
      actual = await this.actual("pointermove") ?? await this.actual("mousemove");
      if (matches(actual, point)) return actual!;
      if (attempt === 2) {
        throw new PointerCoordinateError(`Pointer correction failed after 3 attempts: ${this.error("pointermove", point, actual, offset).message}`);
      }
      if (actual) {
        offset.x += actual.x - point.x;
        offset.y += actual.y - point.y;
      }
    }
    throw new Error("Unreachable pointer move attempt");
  }

  async button(kind: "mousedown" | "mouseup", point: PointerPoint, button: number) {
    await this.clear();
    await perform([{ type: kind === "mousedown" ? "pointerDown" : "pointerUp", button }]);
    // pointerdown.preventDefault() uyumluluk mouse olaylarını bastırabilir.
    const actual = await this.actual(kind === "mousedown" ? "pointerdown" : "pointerup") ?? await this.actual(kind);
    if (!matches(actual, point)) throw this.error(kind, point, actual);
    return actual!;
  }

  async stop() {
    try { await browser.releaseActions(); }
    finally {
      try {
        for (const frame of this.frames) {
          // Clicking a tab's close control can remove its viewer frame.
          if (await frame.isExisting()) await this.inFrame(frame, () => browser.execute(() => window.__htnotePointerProbe?.stop()));
        }
      } finally { await browser.execute(() => window.__htnotePointerProbe?.stop()); }
    }
  }
}

async function withPointer<T>(run: (session: PointerSession) => Promise<T>): Promise<T> {
  const session = new PointerSession();
  try { await session.start(); return await run(session); }
  finally { await session.stop(); }
}

export async function pointerMoveTo(target: PointerElement) {
  const element = await target.getElement();
  await element.scrollIntoView();
  return withPointer(async (session) => {
    return session.move(element, await pointerCenter(element));
  });
}

export async function pointerClickAt(target: PointerElement, x: number, y: number, options: {
  button?: number;
  afterDown?: () => Promise<void>;
  afterUp?: () => Promise<void>;
} = {}) {
  const element = await target.getElement();
  return withPointer(async (session) => {
    const point = await clampPointerPoint({ x, y });
    for (let attempt = 0; attempt < 2; attempt++) {
      await session.move(element, point);
      let down: PointerPoint;
      let up: PointerPoint;
      try {
        down = await session.button("mousedown", point, options.button ?? 0);
        await options.afterDown?.();
        up = await session.button("mouseup", point, options.button ?? 0);
      } catch (error) {
        if (!(error instanceof PointerCoordinateError) || attempt === 1) throw error;
        await browser.releaseActions();
        continue;
      }
      await options.afterUp?.();
      return { down, up };
    }
    throw new Error("Unreachable pointer click attempt");
  });
}

export async function pointerDrag(source: PointerElement, target: PointerElement, options: {
  fromPoint?: PointerPoint;
  toPoint?: PointerPoint;
  waypoints?: PointerPoint[];
  afterActivation?: () => Promise<void>;
  beforeDrop?: () => Promise<void>;
} = {}) {
  const from = await source.getElement();
  const to = await target.getElement();
  await from.scrollIntoView();
  return withPointer(async (session) => {
    const start = await clampPointerPoint(options.fromPoint ?? await pointerCenter(from));
    const end = await clampPointerPoint(options.toPoint ?? await pointerCenter(to));
    try {
      await session.move(from, start);
      await session.button("mousedown", start, 0);
      // A distinct event activates dnd-kit's distance sensor before moving
      // across siblings or into a note iframe.
      await session.move(from, { x: start.x - 10, y: start.y }, 100, false);
      await options.afterActivation?.();
      for (const point of options.waypoints ?? []) await session.move(from, point, 200, false);
      await options.beforeDrop?.();
      await session.move(from, end, 400, false);
      await session.button("mouseup", end, 0);
    } catch (error) {
      // Escape cancels the active sensor before releasing;
      // releasing at a wrong destination could accidentally reorder tabs.
      await browser.keys("Escape");
      await browser.releaseActions();
      throw error;
    }
  });
}
