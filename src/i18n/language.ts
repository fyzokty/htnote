import type { Language } from "@/lib/types";

export function resolveLanguage(settingLanguage: Language | null | undefined, navigatorLanguage: string): Language {
  if (settingLanguage) return settingLanguage;
  return navigatorLanguage.toLowerCase().startsWith("tr") ? "tr" : "en";
}
