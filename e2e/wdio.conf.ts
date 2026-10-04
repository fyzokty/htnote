import { spawn, type ChildProcess } from "node:child_process";
import assert from "node:assert/strict";
import { connect } from "node:net";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { waitForApp } from "./helpers/app";

let driver: ChildProcess | undefined;
let testDirectory: string | undefined;
let driverLog: ReturnType<typeof createWriteStream> | undefined;

async function waitForDriver(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (driver?.exitCode !== null || !driver) throw new Error("tauri-driver exited before listening");
    const ready = await new Promise<boolean>((done) => {
      const socket = connect(4444, "127.0.0.1");
      socket.once("connect", () => { socket.destroy(); done(true); });
      socket.once("error", () => done(false));
    });
    if (ready) return;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("tauri-driver did not start on port 4444");
}

export const config = {
  runner: "local",
  specs: ["./specs/**/*.e2e.ts"],
  maxInstances: 1,
  hostname: "127.0.0.1",
  port: 4444,
  path: "/",
  capabilities: [{
    "tauri:options": {
      application: resolve("src-tauri", "target", "debug", process.platform === "win32" ? "htnote.exe" : "htnote"),
    },
  }],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { timeout: 120000 },
  connectionRetryTimeout: 120000,
  connectionRetryCount: 1,
  waitforTimeout: 30000,
  waitforInterval: 100,
  async before() {
    await browser.setTimeout({ script: 60000 });
    await waitForApp();
    if (process.platform === "win32") {
      assert.equal(await browser.execute(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true,
        "E2E WebView2 must start with --force-prefers-reduced-motion");
    }
    // WebKitGTK/WKWebView do not support WebView2's browser argument. Their
    // desktop motion preference is not reliably configurable by this runner;
    // skip the assertion there. Animations can still cause timing instability,
    // so tests must wait for actual readiness rather than fixed delays.
    if (process.env.HTNOTE_E2E_CPU_THROTTLE) {
      const rate = Number(process.env.HTNOTE_E2E_CPU_THROTTLE);
      assert.ok(Number.isFinite(rate) && rate >= 1, "HTNOTE_E2E_CPU_THROTTLE must be >= 1");
      await browser.sendCommandAndGetResult("Emulation.setCPUThrottlingRate", { rate });
      console.info(`Race diagnosis: CPU throttling rate=${rate}`);
    }
  },
  async beforeTest() {
    await browser.releaseActions();
    await waitForApp();
  },
  async onPrepare() {
    testDirectory = await mkdtemp(join(tmpdir(), "htnote-e2e-"));
    const externalLog = join(testDirectory, "external-open.jsonl");
    await writeFile(externalLog, "");
    // WDIO workers and tauri-driver -> EdgeDriver -> HTNote share this path.
    process.env.HTNOTE_EXTERNAL_OPEN_LOG = externalLog;
    const root = join(testDirectory, "notes");
    const configDir = join(testDirectory, "config");
    await cp(process.env.HTNOTE_E2E_FIXTURE_DIR ?? resolve("e2e", "fixtures"), root, { recursive: true });
    const nativeDriver = process.env.TAURI_DRIVER_NATIVE_DRIVER
      ?? (process.platform === "win32" ? process.env.MSEDGEDRIVER_PATH : undefined);
    const driverArgs = nativeDriver
      ? ["--native-driver", nativeDriver]
      : [];
    const logDirectory = resolve("e2e", "logs");
    await mkdir(logDirectory, { recursive: true });
    driverLog = createWriteStream(join(logDirectory, "tauri-driver.log"));
    console.info(`Starting tauri-driver ${driverArgs.join(" ")}`);
    driver = spawn("tauri-driver", driverArgs, {
      // tauri-driver and its EdgeDriver/app children inherit this E2E-only setting.
      env: {
        ...process.env,
        ...(process.platform === "win32" ? {
          WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `${process.env.WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS ?? ""} --force-prefers-reduced-motion`.trim(),
        } : {}),
        HTNOTE_ROOT_OVERRIDE: root,
        HTNOTE_CONFIG_DIR_OVERRIDE: configDir,
        HTNOTE_EXTERNAL_OPEN_LOG: externalLog,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    driver.stdout?.pipe(process.stdout);
    driver.stderr?.pipe(process.stderr);
    driver.stdout?.pipe(driverLog, { end: false });
    driver.stderr?.pipe(driverLog, { end: false });
    await waitForDriver();
  },
  async onComplete() {
    driver?.kill();
    driverLog?.end();
    if (testDirectory) {
      await cp(join(testDirectory, "external-open.jsonl"), resolve("e2e", "logs", "external-open.jsonl"));
      console.info("External opens recorded in e2e/logs/external-open.jsonl (OS opens suppressed)");
      await rm(testDirectory, { recursive: true, force: true });
    }
  },
  async afterTest(test: { title: string; file?: string }, _context: unknown, result: { error?: Error }) {
    try {
      if (result.error) {
        const directory = resolve("e2e", "logs");
        await mkdir(directory, { recursive: true });
        const name = `${test.file ?? "spec"}-${test.title}`.replace(/[^a-z0-9.-]+/gi, "-").slice(-180);
        await browser.saveScreenshot(join(directory, `${name}.png`));
        console.info("Failure frame:", await browser.execute(() => ({
          url: location.href, readyState: document.readyState,
          dataset: { ...document.documentElement.dataset },
        })));
      }
    } finally {
      await browser.switchFrame(null);
    }
  },
};
