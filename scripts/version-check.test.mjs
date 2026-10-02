import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const fixtures = [];
const script = join(process.cwd(), "scripts", "version-check.mjs");

function runCheck(cargoVersion = "1.2.3", tauriVersion = "../package.json") {
  const root = mkdtempSync(join(tmpdir(), "htnote-version-"));
  fixtures.push(root);
  mkdirSync(join(root, "src-tauri"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));
  writeFileSync(join(root, "src-tauri", "Cargo.toml"), `[package]\nname = "htnote"\nversion = "${cargoVersion}"\n\n[dependencies]\nversion = "9.9.9"\n`);
  writeFileSync(join(root, "src-tauri", "tauri.conf.json"), JSON.stringify({ version: tauriVersion }));
  return spawnSync(process.execPath, [script, root], { encoding: "utf8" });
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("version:check", () => {
  it("eşit sürümlerde başarılı olur", () => {
    expect(runCheck("1.2.3", "1.2.3").status).toBe(0);
  });

  it("Cargo sürümü farklıysa hata verir", () => {
    const result = runCheck("1.2.4");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Cargo.toml=1.2.4");
  });

  it("Tauri sürümü farklıysa hata verir", () => {
    const result = runCheck("1.2.3", "1.2.4");
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("tauri.conf.json=1.2.4");
  });

  it("package.json referansını çözer", () => {
    expect(runCheck().status).toBe(0);
  });
});
