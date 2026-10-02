import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function checkVersions(rootDir) {
  const packageVersion = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")).version;
  const cargo = readFileSync(join(rootDir, "src-tauri", "Cargo.toml"), "utf8");
  const packageSection = cargo.match(/^\[package\]([\s\S]*?)(?=^\[|(?![\s\S]))/m)?.[1];
  const cargoVersion = packageSection?.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  const tauriVersion = JSON.parse(readFileSync(join(rootDir, "src-tauri", "tauri.conf.json"), "utf8")).version;
  const resolvedTauriVersion = tauriVersion === "../package.json" ? packageVersion : tauriVersion;

  if (!packageVersion || !cargoVersion || !resolvedTauriVersion ||
      packageVersion !== cargoVersion || packageVersion !== resolvedTauriVersion) {
    throw new Error(`Sürüm uyuşmazlığı: package.json=${packageVersion ?? "eksik"}, ` +
      `Cargo.toml=${cargoVersion ?? "eksik"}, tauri.conf.json=${tauriVersion ?? "eksik"}`);
  }

  return packageVersion;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    console.log(`Sürüm tutarlı: ${checkVersions(process.argv[2] ?? process.cwd())}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
