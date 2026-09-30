export interface AppInfo {
  version: string;
  platform: string;
}

export type Theme = "system" | "light" | "dark";
export type Language = "tr" | "en";

export interface Settings {
  rootDir: string | null;
  theme: Theme;
  language: Language | null;
  sidebarWidth: number;
  sidebarVisible: boolean;
  openTabs: string[];
  activeTab: string | null;
  expandedFolders: string[];
}

export type SettingsPatch = Partial<Settings>;
