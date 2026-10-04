import type { Language } from "@/lib/types";

export function writeCachedLanguage(language: Language): void {
  try {
    localStorage.setItem("htnote.language", language);
  } catch {
    // Depolama kapalıysa dil yine bu oturumda çalışır.
  }
}

export function resolveLanguage(settingLanguage: Language | null | undefined, navigatorLanguage: string): Language {
  if (settingLanguage) return settingLanguage;
  return navigatorLanguage.toLowerCase().startsWith("tr") ? "tr" : "en";
}
