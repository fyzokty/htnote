import type { ChainablePromiseElement } from "webdriverio";

export interface PointerPoint { x: number; y: number }
interface RecordedPoint extends PointerPoint { time: number }
export type PointerElement = WebdriverIO.Element | ChainablePromiseElement;
type EventKind = "pointermove" | "mousemove" | "mousedown" | "mouseup";
type PointerAction = { type: "pointerMove"; duration: number; origin: { "element-6066-11e4-a52e-4f735466cecf": string }; x: number; y: number }
  | { type: "pointerDown" | "pointerUp"; button: number };

declare global {
  interface Window {
    __htnotePointerProbe?: {
      events: Partial<Record<EventKind, RecordedPoint>>;
      stop: () => void;
    };
  }
}

const tolerance = 2;
const pointerId = "calibrated-mouse";
class PointerCoordinateError extends Error {}
const matches = (actual: PointerPoint | undefined, expected: PointerPoint) => actual
  && Math.abs(actual.x - expected.x) <= tolerance && Math.abs(actual.y - expected.y) <= tolerance;

export async function pointerCenter(element: PointerElement): Promise<PointerPoint> {
  return browser.execute((element) => {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    if (left >= right || top >= bottom) throw new Error("Pointer origin has no in-view center");
    // W3C element origins use the floored center of the visible rectangle.
    return { x: Math.floor((left + right) / 2), y: Math.floor((top + bottom) / 2) };
  }, await element.getElement());
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
  private offset: PointerPoint = { x: 0, y: 0 };

  private async inFrame<T>(frame: WebdriverIO.Element, run: () => Promise<T>): Promise<T> {
    await browser.switchFrame(frame);
    try { return await run(); }
    finally { await browser.switchToParentFrame(); }
  }

  private async install() {
    await browser.execute(() => {
      window.__htnotePointerProbe?.stop();
      const events: Partial<Record<EventKind, RecordedPoint>> = {};
      const kinds: EventKind[] = ["pointermove", "mousemove", "mousedown", "mouseup"];
      const record = (event: MouseEvent) => {
        if (event.isTrusted) events[event.type as EventKind] = {
          x: event.clientX, y: event.clientY, time: performance.timeOrigin + event.timeStamp,
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
      latest = { x: event.x + origin.x, y: event.y + origin.y, time: event.time };
    }
    return latest ? { x: latest.x, y: latest.y } : undefined;
  }

  private async moveAction(element: WebdriverIO.Element, point: PointerPoint, offset: PointerPoint, duration = 0): Promise<PointerAction> {
    const center = await pointerCenter(element);
    return {
      type: "pointerMove", duration,
      origin: { "element-6066-11e4-a52e-4f735466cecf": element.elementId },
      x: Math.round(point.x - center.x - offset.x), y: Math.round(point.y - center.y - offset.y),
    };
  }

  async calibrate(element: WebdriverIO.Element) {
    const center = await pointerCenter(element);
    const samples: PointerPoint[] = [];
    // Different positions force fresh movement events even if the mouse was
    // already at the center. A second sample checks that the offset is stable.
    for (const point of [{ x: center.x - 4, y: center.y }, center]) {
      await this.clear();
      await perform([await this.moveAction(element, { x: point.x + 2, y: point.y }, { x: 0, y: 0 }),
        await this.moveAction(element, point, { x: 0, y: 0 })]);
      const actual = await this.actual("pointermove") ?? await this.actual("mousemove");
      if (!actual) throw new Error(`WebDriver pointer calibration: no trusted move event at ${JSON.stringify(point)}`);
      samples.push({ x: actual.x - point.x, y: actual.y - point.y });
    }
    if (!matches(samples[0], samples[1])) {
      throw new Error(`WebDriver pointer calibration is unstable: offsets ${JSON.stringify(samples)} (tolerance ±${tolerance}px)`);
    }
    this.offset = samples[1];
    console.info("WebDriver pointer calibration offset:", this.offset);
  }

  private error(kind: EventKind, point: PointerPoint, actual: PointerPoint | undefined) {
    return new PointerCoordinateError(`WebDriver ${kind} coordinate drift: expected ${JSON.stringify(point)}, `
      + `received ${JSON.stringify(actual) ?? "no trusted event"}, calibrated offset ${JSON.stringify(this.offset)} (tolerance ±${tolerance}px)`);
  }

  async move(element: WebdriverIO.Element, point: PointerPoint, duration = 0, retry = true, approach = true) {
    for (let attempt = 0; attempt < (retry ? 2 : 1); attempt++) {
      await this.clear();
      // A short approach ensures a fresh event when repeating a hover/click.
      const actions = approach ? [await this.moveAction(element, { x: point.x + 2, y: point.y }, this.offset)] : [];
      actions.push(await this.moveAction(element, point, this.offset, duration));
      await perform(actions);
      const actual = await this.actual("pointermove") ?? await this.actual("mousemove");
      if (matches(actual, point)) return actual!;
      if (!retry || attempt === 1) throw this.error("pointermove", point, actual);
      await this.calibrate(element);
    }
    throw new Error("Unreachable pointer move attempt");
  }

  async button(kind: "mousedown" | "mouseup", point: PointerPoint, button: number) {
    await this.clear();
    await perform([{ type: kind === "mousedown" ? "pointerDown" : "pointerUp", button }]);
    const actual = await this.actual(kind);
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
    await session.calibrate(element);
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
    const point = { x: Math.round(x), y: Math.round(y) };
    await session.calibrate(element);
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
        await session.calibrate(element);
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
    const start = options.fromPoint ?? await pointerCenter(from);
    const end = options.toPoint ?? await pointerCenter(to);
    await session.calibrate(from);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await session.move(from, start, 0, false);
        await session.button("mousedown", start, 0);
        // A distinct event activates dnd-kit's distance sensor before moving
        // across siblings or into a note iframe.
        await session.move(from, { x: start.x - 10, y: start.y }, 100, false, false);
        await options.afterActivation?.();
        for (const point of options.waypoints ?? []) await session.move(from, point, 200, false, false);
        await options.beforeDrop?.();
        await session.move(from, end, 400, false, false);
        await session.button("mouseup", end, 0);
        return;
      } catch (error) {
        if (!(error instanceof PointerCoordinateError) || attempt === 1) throw error;
        // Escape cancels the active sensor before recalibrating/restarting;
        // releasing at a wrong destination could accidentally reorder tabs.
        await browser.keys("Escape");
        await browser.releaseActions();
        await session.calibrate(from);
      }
    }
  });
}
