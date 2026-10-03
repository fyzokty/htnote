import assert from "node:assert/strict";
import { test } from "node:test";

import { pointerClickAt, pointerDrag, pointerMoveTo } from "./pointer";

// A driver double injects the CI offsets into trusted event coordinates. This
// exercises per-target correction without requiring an older WebView2 locally.
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
  let offsetAt: ((point: { x: number; y: number }) => typeof offset) | undefined;
  let recordMoves = true;
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
          moves++;
          beforeEvent?.("move", moves);
          const rect = action.origin?.["element-6066-11e4-a52e-4f735466cecf"] === "target" ? targetRect : sourceRect;
          const requested = {
            x: Math.floor((rect.left + rect.right) / 2) + action.x,
            y: Math.floor((rect.top + rect.bottom) / 2) + action.y,
          };
          const drift = offsetAt?.(requested) ?? offset;
          const next = { x: requested.x + drift.x, y: requested.y + drift.y };
          if (pressed) {
            sourceRect.left += next.x - position.x;
            sourceRect.right += next.x - position.x;
          }
          position = next;
          if (recordMoves) {
            emit("pointermove");
            emit("mousemove");
          }
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
    setOffsetAt: (callback: typeof offsetAt) => { offsetAt = callback; },
    suppressMoves: () => { recordMoves = false; },
    moves: () => moves,
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

test("hover converges on the third attempt when drift changes during correction", async () => {
  const fake = driver({ x: 0, y: 30 });
  fake.onEvent((kind, moves) => { if (kind === "move" && moves === 3) fake.setOffset({ x: 0, y: 12 }); });
  try { assert.deepEqual(await pointerMoveTo(fake.source), { x: 180, y: 25 }); }
  finally { fake.cleanup(); }
});

test("persistent coordinate drift fails after three attempts and cleans up", async () => {
  const fake = driver({ x: 0, y: 0 });
  fake.onEvent((kind, moves) => {
    if (kind === "move") fake.setOffset({ x: 0, y: moves * 12 });
  });
  try {
    await assert.rejects(pointerClickAt(fake.source, 800, 25), /failed after 3 attempts.*coordinate drift.*expected.*800.*received.*49.*correction/);
    assert.equal(fake.moves(), 6);
    assert.equal(fake.clicks.length, 0, "A missed movement must be detected before pressing");
  } finally { fake.cleanup(); }
});

test("a mismatched mousedown corrects the target again and retries the click once", async () => {
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

test("drag corrects position-dependent drift at intermediate points and moving origins", async () => {
  const fake = driver({ x: 0, y: 30 });
  fake.setOffsetAt((point) => ({ x: point.x < 250 ? -7 : 5, y: point.y > 80 ? 30 : 12 }));
  let activations = 0;
  try {
    await pointerDrag(fake.source, fake.target, {
      afterActivation: async () => {
        activations++;
        assert.deepEqual(fake.position(), { x: 170, y: 25 });
      },
      waypoints: [{ x: 180, y: 160 }],
      beforeDrop: async () => { assert.deepEqual(fake.position(), { x: 180, y: 160 }); },
    });
    assert.deepEqual(fake.position(), { x: 380, y: 25 });
    assert.equal(fake.cancellations(), 0);
    assert.equal(activations, 1);
  } finally { fake.cleanup(); }
});

test("click corrects drift at its target even when nearby points have different offsets", async () => {
  const fake = driver({ x: 0, y: 0 });
  fake.setOffsetAt((point) => ({ x: 0, y: point.x > 800 ? 8 : 3 }));
  try {
    const result = await pointerClickAt(fake.source, 800, 25);
    assert.deepEqual(result, { down: { x: 800, y: 25 }, up: { x: 800, y: 25 } });
    assert.equal(fake.moves(), 4);
  } finally { fake.cleanup(); }
});

test("missing trusted movement events fail within three attempts", async () => {
  const fake = driver({ x: 0, y: 0 });
  fake.suppressMoves();
  try {
    await assert.rejects(pointerMoveTo(fake.source), /failed after 3 attempts.*no trusted event/);
    assert.equal(fake.moves(), 6);
    assert.equal(fake.clicks.length, 0);
  }
  finally { fake.cleanup(); }
});

test("failed drag correction cancels before releasing at a wrong destination", async () => {
  const fake = driver({ x: 0, y: 0 });
  try {
    await assert.rejects(pointerDrag(fake.source, fake.target, {
      afterActivation: async () => {
        fake.onEvent((kind, moves) => { if (kind === "move") fake.setOffset({ x: 0, y: moves * 12 }); });
      },
      waypoints: [{ x: 180, y: 160 }],
    }), /failed after 3 attempts/);
    assert.equal(fake.cancellations(), 1);
    assert.equal(fake.moves(), 6);
  } finally { fake.cleanup(); }
});
