// Uygulamayı gerçekten açıp ana penceresinin oluştuğunu doğrular, ardından kendisi kapatır.
// `tauri dev` süresiz çalıştığı için agent'lar ve otomasyon bunun yerine bu script'i kullanır.
//
// Kullanım: npm run smoke:app [-- --skip-build] [-- --timeout 60]
//   --skip-build  Önceki debug build'i kullanır (frontend gömülü build gerekir).
//   --timeout N   Pencerenin açılması için beklenecek en fazla saniye (varsayılan 60).
// Çıkış kodu: 0 = pencere açıldı ve kararlı, 1 = hata / zaman aşımı.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const timeoutIdx = args.indexOf("--timeout");
const timeoutSec = timeoutIdx >= 0 ? Number(args[timeoutIdx + 1]) : 60;
const STABLE_MS = 3000; // Pencere açıldıktan sonra çökmediğini görmek için beklenen süre
const isWindows = process.platform === "win32";

const exePath = join("src-tauri", "target", "debug", isWindows ? "htnote.exe" : "htnote");

function log(msg) {
  console.log(`[smoke] ${msg}`);
}

function fail(msg) {
  console.error(`[smoke] HATA: ${msg}`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Frontend'i exe'ye gömen debug build (dev server gerektirmez).
if (!skipBuild) {
  log("debug build alınıyor (tauri build --debug --no-bundle)...");
  const build = spawnSync("npx", ["tauri", "build", "--debug", "--no-bundle"], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, NO_COLOR: "1", CARGO_TERM_COLOR: "never" },
  });
  if (build.status !== 0) fail(`build başarısız (çıkış kodu ${build.status})`);
}
if (!existsSync(exePath)) fail(`${exePath} bulunamadı; --skip-build olmadan çalıştırın`);

log(`başlatılıyor: ${exePath}`);
const externalLog = join(mkdtempSync(join(tmpdir(), "htnote-smoke-")), "external-open.jsonl");
writeFileSync(externalLog, "");
log(`OS açılışları kaydedilecek: ${externalLog}`);
const child = spawn(exePath, [], {
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, HTNOTE_EXTERNAL_OPEN_LOG: externalLog },
});
let exited = false;
let exitCode = null;
let stderrTail = "";
child.stderr.on("data", (d) => {
  stderrTail = (stderrTail + d.toString()).slice(-2000);
});
child.stdout.on("data", () => {});
child.on("exit", (code) => {
  exited = true;
  exitCode = code;
});

// Süreç ağacını (WebView2 alt süreçleri dahil) kapatır.
function killApp() {
  if (exited) return;
  if (isWindows) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}
process.on("exit", killApp);

// Windows'ta ana pencere oluşunca MainWindowHandle sıfırdan farklı olur.
function windowTitle() {
  if (!isWindows) return "";
  const r = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `$p = Get-Process -Id ${child.pid} -ErrorAction SilentlyContinue; if ($p -and $p.MainWindowHandle -ne 0) { $p.MainWindowTitle }`,
    ],
    { encoding: "utf8" },
  );
  return (r.stdout ?? "").trim();
}

const deadline = Date.now() + timeoutSec * 1000;
let title = "";
while (Date.now() < deadline) {
  if (exited) fail(`uygulama pencere açılmadan kapandı (kod ${exitCode})\n${stderrTail}`);
  if (!isWindows) {
    // Diğer platformlarda pencere tespiti yok; birkaç saniye ayakta kalması yeterli sayılır.
    await sleep(5000);
    title = "(kontrol edilmedi)";
    break;
  }
  title = windowTitle();
  if (title) break;
  await sleep(500);
}
if (!title) {
  killApp();
  fail(`${timeoutSec} sn içinde ana pencere açılmadı`);
}
log(`ana pencere açıldı: "${title}"`);

await sleep(STABLE_MS);
if (exited) fail(`uygulama açıldıktan sonra çöktü (kod ${exitCode})\n${stderrTail}`);

killApp();
log("OK — uygulama açıldı, kararlı çalıştı ve kapatıldı");
process.exit(0);
