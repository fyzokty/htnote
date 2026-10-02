import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface NoteNode { type: "note"; id: string; title: string; relPath: string }
interface FolderNode { type: "folder"; relPath: string; children: TreeNode[] }
export type TreeNode = NoteNode | FolderNode;

export async function invoke<T>(command: string, args: object = {}): Promise<T> {
  const result = await browser.executeAsync((name, payload, done) => {
    const api = (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: object) => Promise<unknown> } }).__TAURI_INTERNALS__;
    void api.invoke(name, payload).then(
      (value) => done({ ok: true, value }),
      (error) => done({ ok: false, error: JSON.stringify(error) }),
    );
  }, command, args) as { ok: boolean; value: T; error?: string };
  if (!result.ok) throw new Error(`${command}: ${result.error}`);
  return result.value;
}

export function flatten(nodes: TreeNode[]): NoteNode[] {
  return nodes.flatMap((node) => node.type === "note" ? [node] : flatten(node.children));
}

export async function tree(): Promise<TreeNode[]> {
  return invoke<TreeNode[]>("get_note_tree");
}

export async function useTempRoot(): Promise<{ root: string; restore: () => Promise<void> }> {
  const original = await invoke<string>("get_root_dir");
  const root = await mkdtemp(join(tmpdir(), "htnote-flow-"));
  await invoke("set_root_dir", { path: root });
  await browser.refresh();
  await $("[role=tree]").waitForExist();
  await browser.waitUntil(async () => (await tree()).length === 0, { timeout: 10000 });
  return {
    root,
    restore: async () => {
      await invoke("set_root_dir", { path: original });
      await browser.refresh();
      await $("[role=tree]").waitForExist();
      await rm(root, { recursive: true, force: true });
    },
  };
}

export async function waitForTreeItem(id: string) {
  const item = await $(`[data-tree-key="note:${id}"]`);
  await item.waitForDisplayed({ timeout: 15000 });
  return item;
}

export async function createNote(title: string, parentRelPath = ""): Promise<NoteNode> {
  const note = await invoke<NoteNode>("create_note", { parentRelPath, title });
  assert.equal(note.type, "note");
  await browser.waitUntil(async () => flatten(await tree()).some((item) => item.id === note.id));
  await browser.refresh();
  await waitForTreeItem(note.id);
  return note;
}

export async function openNote(id: string): Promise<void> {
  await (await waitForTreeItem(id)).click();
  await browser.waitUntil(async () => await $(`[data-note-id="${id}"] [role=tab]`).getAttribute("aria-selected") === "true");
  const note = flatten(await tree()).find((item) => item.id === id);
  assert.ok(note);
  await $(`iframe[title="${note.title}"]`).waitForExist();
}

export async function withNoteFrame<T>(id: string, run: () => Promise<T>): Promise<T> {
  const note = flatten(await tree()).find((item) => item.id === id);
  assert.ok(note);
  const frame = await $(`iframe[title="${note.title}"]`);
  // Kaydetme ve dosya olayları iframe'i yeniden oluşturur; her çağrı güncel öğeyi bulur.
  await frame.waitForExist({ timeout: 15000 });
  await browser.switchFrame(frame);
  try {
    await $("#htnote-content").waitForExist({ timeout: 15000 });
    return await run();
  } finally {
    await browser.switchFrame(null);
  }
}

export async function waitForFile(path: string, predicate: (bytes: Buffer) => boolean = (bytes) => bytes.length > 0): Promise<Buffer> {
  let bytes = Buffer.alloc(0);
  await browser.waitUntil(async () => {
    try {
      if ((await stat(path)).size === 0) return false;
      bytes = await readFile(path);
      return predicate(bytes);
    } catch { return false; }
  }, { timeout: 30000, interval: 100 });
  return bytes;
}

export async function typeInVisualEditor(text: string): Promise<void> {
  const editor = await $(".htnote-visual-editor .tiptap");
  await editor.waitForDisplayed();
  await editor.click();
  await editor.addValue(text);
}

export async function saveShortcut(): Promise<void> {
  await browser.keys(["Control", "s"]);
}

export async function editNote(): Promise<void> {
  await (await $('[data-testid="edit-note"]')).click();
  await $('[data-testid="visual-mode"]').waitForDisplayed();
}
