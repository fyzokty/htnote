import assert from "node:assert/strict";
import { test } from "node:test";

import { pointerClickAt, pointerDrag, pointerMoveTo } from "./pointer";

// A driver double injects the CI offsets into trusted event coordinates. This
// exercises calibration/retry without requiring an older WebView2 locally.
function driver(initialOffset: { x: number; y: number }) {
  const listeners = new Map<string, Set<(event: object) => void>>();
  const testWindow = { innerWidth: 1000, innerHeight: 800 } as Window;
  const sourceRect = { left: 100, right: 260, top: 10, bottom: 40 };
  const targetRect = { left: 300, right: 460, top: 10, bottom: 40 };
  const element = (id: string, rect: typeof sourceRect) => ({
    elementId: id,
    getBoundingClientRect: () => rect,
    getElement: async function () { return this; },
    scrollIntoView: async () => {},
  });
  const source = element("source", sourceRect);
  const target = element("target", targetRect);
  let offset = initialOffset;
  let position = { x: 0, y: 0 };
  let pressed = false;
  let time = 0;
  let moves = 0;
  let releases = 0;
  let cancellations = 0;
  const clicks: { x: number; y: number }[] = [];
  let beforeEvent: ((kind: string, moveCount: number) => void) | undefined;
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = new Map(["window", "document", "browser", "$$"].map((key) => [key, globals[key]]));
  globals.window = testWindow;
  globals.document = {
    addEventListener: (kind: string, listener: (event: object) => void) => {
      if (!listeners.has(kind)) listeners.set(kind, new Set());
      listeners.get(kind)!.add(listener);
    },
    removeEventListener: (kind: string, listener: (event: object) => void) => listeners.get(kind)?.delete(listener),
  };
  globals.$$ = async () => [];
  const emit = (kind: string) => {
    for (const listener of listeners.get(kind) ?? []) {
      listener({ type: kind, isTrusted: true, clientX: position.x, clientY: position.y, timeStamp: ++time });
    }
  };
  globals.browser = {
    execute: async (callback: (...args: unknown[]) => unknown, ...args: unknown[]) => callback(...args),
    performActions: async (sequences: { actions: { type: string; origin?: Record<string, string>; x: number; y: number }[] }[]) => {
      for (const action of sequences[0].actions) {
        if (action.type === "pointerMove") {
          beforeEvent?.("move", ++moves);
          const rect = action.origin?.["element-6066-11e4-a52e-4f735466cecf"] === "target" ? targetRect : sourceRect;
          const next = {
            x: Math.floor((rect.left + rect.right) / 2) + action.x + offset.x,
            y: Math.floor((rect.top + rect.bottom) / 2) + action.y + offset.y,
          };
          if (pressed) {
            sourceRect.left += next.x - position.x;
            sourceRect.right += next.x - position.x;
          }
          position = next;
          emit("pointermove");
          emit("mousemove");
        } else {
          const kind = action.type === "pointerDown" ? "mousedown" : "mouseup";
          beforeEvent?.(kind, moves);
          pressed = kind === "mousedown";
          if (pressed) clicks.push({ ...position });
          emit(kind);
        }
      }
    },
    releaseActions: async () => { releases++; pressed = false; },
    keys: async (key: string) => { if (key === "Escape") { cancellations++; pressed = false; } },
  };
  return {
    source: source as unknown as WebdriverIO.Element,
    target: target as unknown as WebdriverIO.Element,
    clicks,
    setOffset: (next: typeof offset) => { offset = next; },
    onEvent: (callback: typeof beforeEvent) => { beforeEvent = callback; },
    displace: (x: number, y: number) => { position = { x: position.x + x, y: position.y + y }; },
    position: () => position,
    cancellations: () => cancellations,
    cleanup: () => {
      assert.equal(pressed, false, "Mouse button must be released");
      assert.ok(releases > 0, "Input state must be released on success and failure");
      assert.equal(testWindow.__htnotePointerProbe, undefined);
      assert.equal([...listeners.values()].reduce((sum, entries) => sum + entries.size, 0), 0);
      for (const [key, value] of previous) {
        if (value === undefined) delete globals[key]; else globals[key] = value;
      }
    },
  };
}

for (const offset of [{ x: 0, y: 0 }, { x: 0, y: 12 }, { x: 0, y: 30 }, { x: -7, y: 12 }]) {
  test(`click lands at the intended point with driver offset ${JSON.stringify(offset)}`, async () => {
    const fake = driver(offset);
    try {
      const events = await pointerClickAt(fake.source, 800, 25);
      assert.deepEqual(events, { down: { x: 800, y: 25 }, up: { x: 800, y: 25 } });
      assert.deepEqual(fake.clicks, [{ x: 800, y: 25 }]);
    } finally { fake.cleanup(); }
  });
}

test("hover recalibrates once when the offset changes after the probes", async () => {
  const fake = driver({ x: 0, y: 30 });
  fake.onEvent((kind, moves) => { if (kind === "move" && moves === 5) fake.setOffset({ x: 0, y: 12 }); });
  try { assert.deepEqual(await pointerMoveTo(fake.source), { x: 180, y: 25 }); }
  finally { fake.cleanup(); }
});

test("persistent coordinate drift fails after one retry and cleans up", async () => {
  const fake = driver({ x: 0, y: 0 });
  fake.onEvent((kind, moves) => {
    if (kind === "move" && moves === 5) fake.setOffset({ x: 0, y: 12 });
    if (kind === "move" && moves === 11) fake.setOffset({ x: 0, y: 30 });
  });
  try {
    await assert.rejects(pointerClickAt(fake.source, 800, 25), /coordinate drift.*expected.*800.*received.*43.*calibrated offset/);
    assert.equal(fake.clicks.length, 0, "A missed movement must be detected before pressing");
  } finally { fake.cleanup(); }
});

test("a mismatched mousedown recalibrates and retries the click once", async () => {
  const fake = driver({ x: 0, y: 30 });
  let firstDown = true;
  fake.onEvent((kind) => {
    if (kind === "mousedown" && firstDown) {
      firstDown = false;
      fake.displace(0, 12);
      fake.setOffset({ x: 0, y: 12 });
    }
  });
  try {
    const result = await pointerClickAt(fake.source, 800, 25);
    assert.deepEqual(result.down, { x: 800, y: 25 });
    assert.equal(fake.clicks.length, 2);
  } finally { fake.cleanup(); }
});

test("drag compensates moving element origins and cancels before retrying drift", async () => {
  const fake = driver({ x: 0, y: 30 });
  fake.onEvent((kind, moves) => { if (kind === "move" && moves === 8) fake.setOffset({ x: 0, y: 12 }); });
  let activations = 0;
  try {
    await pointerDrag(fake.source, fake.target, {
      afterActivation: async () => { activations++; },
      waypoints: [{ x: 180, y: 160 }],
    });
    assert.deepEqual(fake.position(), { x: 380, y: 25 });
    assert.equal(fake.cancellations(), 1);
    assert.equal(activations, 2);
  } finally { fake.cleanup(); }
});

test("unstable probe offsets produce an explicit error", async () => {
  const fake = driver({ x: 0, y: 30 });
  fake.onEvent((kind, moves) => { if (kind === "move" && moves === 3) fake.setOffset({ x: 0, y: 12 }); });
  try { await assert.rejects(pointerMoveTo(fake.source), /calibration is unstable/); }
  finally { fake.cleanup(); }
});
