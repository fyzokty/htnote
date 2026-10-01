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

export interface FolderNode {
  type: "folder";
  name: string;
  relPath: string;
  children: TreeNode[];
}

export interface NoteNode {
  type: "note";
  id: string;
  title: string;
  relPath: string;
  isFavorite: boolean;
  tags: string[];
  updatedAt: string;
}

export type TreeNode = FolderNode | NoteNode;

export type TreeSelection = { kind: "note"; id: string } | { kind: "folder"; relPath: string };

export interface FlatNote {
  id: string;
  title: string;
  relPath: string;
}
