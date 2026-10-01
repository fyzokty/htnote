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
  editorSplitRatio: number;
  editorLivePreview: boolean;
  openTabs: string[];
  activeTab: string | null;
  expandedFolders: string[];
  onboardingDone: boolean;
}

export type SettingsPatch = Partial<Omit<Settings, "onboardingDone">>;

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

export interface NoteMetadata {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  isFavorite: boolean;
  tags: string[];
  hasCustomCss: boolean;
  hasCustomJs: boolean;
  [key: string]: unknown;
}

export interface NoteData {
  metadata: NoteMetadata;
  html: string;
  css: string | null;
  js: string | null;
  contentHash: string;
}

export interface SaveNotePayload {
  html: string;
  css: string;
  js: string;
  expectedHash: string | null;
}

export interface SaveNoteResult {
  metadata: NoteMetadata;
  contentHash: string;
}

export type AssetKind = "image" | "audio" | "video" | "file";

export interface AssetInfo {
  relPath: string;
  kind: AssetKind;
  mime: string;
}

export interface PreviewDraftPayload {
  html: string;
  css: string;
  js: string;
}

export interface RecoveryDraft extends PreviewDraftPayload {
  id: string;
  baseHash: string;
  savedAt: string;
}

export type WriteDraftPayload = Omit<RecoveryDraft, "id">;

export type TreeNode = FolderNode | NoteNode;

export interface FsChangePayload {
  changedNoteIds: string[];
  removedNoteIds: string[];
  treeChanged: boolean;
  trashChanged: boolean;
}

export type TreeSelection = { kind: "note"; id: string } | { kind: "folder"; relPath: string };

export interface FlatNote {
  id: string;
  title: string;
  relPath: string;
}
