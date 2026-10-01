import { spawn, type ChildProcess } from "node:child_process";
import { connect } from "node:net";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
  mochaOpts: { timeout: 60000 },
  connectionRetryTimeout: 120000,
  connectionRetryCount: 1,
  async onPrepare() {
    testDirectory = await mkdtemp(join(tmpdir(), "htnote-e2e-"));
    const root = join(testDirectory, "notes");
    const configDir = join(testDirectory, "config");
    await cp(resolve("e2e", "fixtures"), root, { recursive: true });
    const driverArgs = process.env.MSEDGEDRIVER_PATH
      ? ["--native-driver", process.env.MSEDGEDRIVER_PATH]
      : [];
    const logDirectory = resolve("e2e", "logs");
    await mkdir(logDirectory, { recursive: true });
    driverLog = createWriteStream(join(logDirectory, "tauri-driver.log"));
    console.info(`Starting tauri-driver ${driverArgs.join(" ")}`);
    driver = spawn("tauri-driver", driverArgs, {
      env: { ...process.env, HTNOTE_ROOT_OVERRIDE: root, HTNOTE_CONFIG_DIR_OVERRIDE: configDir },
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
    if (testDirectory) await rm(testDirectory, { recursive: true, force: true });
  },
};
