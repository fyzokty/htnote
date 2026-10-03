import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { waitForApp, waitForSavedEditor } from "./app";

export interface NoteNode { type: "note"; id: string; title: string; relPath: string }
interface FolderNode { type: "folder"; relPath: string; children: TreeNode[] }
export type TreeNode = NoteNode | FolderNode;

export async function invoke<T>(command: string, args: object = {}): Promise<T> {
  await waitForApp();
  const result = await browser.executeAsync((name, payload, done) => {
    const api = (window as unknown as { __TAURI_INTERNALS__: { invoke: (command: string, args: object) => Promise<unknown> } }).__TAURI_INTERNALS__;
    void api.invoke(name, payload).then(
      (value) => done({ ok: true, value }),
      (error) => done({ ok: false, error: JSON.stringify(error) }),
    );
  }, command, args) as { ok: true; value: unknown } | { ok: false; error: string };
  if (!result.ok) throw new Error(`${command}: ${result.error}`);
  return result.value as T;
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
  await waitForApp();
  await browser.waitUntil(async () => (await tree()).length === 0, { timeout: 10000 });
  return {
    root,
    restore: async () => {
      await invoke("set_root_dir", { path: original });
      await browser.refresh();
      await waitForApp();
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
  await browser.waitUntil(async () => await $(`[role="tab"][data-note-id="${id}"]`).getAttribute("aria-selected") === "true");
  const note = flatten(await tree()).find((item) => item.id === id);
  assert.ok(note);
  await $(`iframe[title="${note.title}"]`).waitForExist();
}

export async function withNoteFrame<T>(id: string, run: () => Promise<T>): Promise<T> {
  const note = flatten(await tree()).find((item) => item.id === id);
  assert.ok(note);
  try {
    // Dosya olayları beklerken de iframe'i değiştirebilir; hazır olana kadar güncel öğeyi bul.
    await browser.waitUntil(async () => {
      await browser.switchFrame(null);
      const frame = await $(`iframe[title="${note.title}"]`);
      if (!await frame.isExisting()) return false;
      try {
        await browser.switchFrame(frame);
        return await browser.execute(() => window !== window.top && document.getElementById("htnote-content") !== null);
      } catch (error) {
        if (error instanceof Error && /stale element|no such (frame|element)|frame detached/i.test(error.message)) return false;
        throw error;
      }
    }, { timeout: 15000, interval: 100, timeoutMsg: `Note iframe did not become ready: ${id}` });
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
  await waitForSavedEditor();
}

export async function editNote(): Promise<void> {
  await (await $('[data-testid="edit-note"]')).click();
  await $('[data-testid="visual-mode"]').waitForDisplayed();
}
