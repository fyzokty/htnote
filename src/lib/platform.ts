export type Platform = "mac" | "windows" | "linux";

/** Ön yüzdeki tek platform tespiti; kısayol ipuçları ve pencere kabuğu buna göre seçilir. */
export function getPlatform(): Platform {
  if (typeof navigator !== "undefined" && /Mac/i.test(navigator.platform)) return "mac";
  if (typeof navigator !== "undefined" && /Linux/i.test(navigator.platform)) return "linux";
  return "windows";
}

/** macOS sistemin trafik ışıklarını korur; Windows ve Linux kendi pencere düğmelerimizi çizer. */
export function usesCustomWindowControls(platform: Platform = getPlatform()): boolean {
  return platform !== "mac";
}
