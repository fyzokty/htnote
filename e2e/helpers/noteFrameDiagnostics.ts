import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

interface NoteFrameTarget {
  id: string;
  title: string;
  relPath: string;
  expectedHref: string;
}

// Each probe is independent: a detached frame must not hide the disk or host state.
export async function noteFrameFailure(error: unknown, target: NoteFrameTarget): Promise<Error> {
  const diagnostics: Record<string, unknown> = {
    capturedAt: new Date().toISOString(), target,
    failure: error instanceof Error ? error.message : String(error),
  };
  const probe = async (name: string, read: () => Promise<unknown>) => {
    try { diagnostics[name] = await read(); }
    catch (failure) { diagnostics[name] = { error: String(failure) }; }
  };
  const readDocument = () => browser.execute((href) => {
    const link = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].find((item) => item.getAttribute("href") === href);
    const rect = link?.getBoundingClientRect();
    return {
      url: location.href, revision: new URL(location.href).searchParams.get("revision"),
      readyState: document.readyState, visibilityState: document.visibilityState,
      hasContent: document.getElementById("htnote-content") !== null,
      containsLink: Boolean(link),
      link: link ? {
        rect: rect?.toJSON(), display: getComputedStyle(link).display,
        visibility: getComputedStyle(link).visibility, text: link.textContent,
      } : null,
    };
  }, target.expectedHref);
  await probe("failedContext", readDocument);
  await probe("host", async () => {
    await browser.switchFrame(null);
    return browser.execute((id) => {
      const container = [...document.querySelectorAll<HTMLElement>('[data-mode="view"][data-note-id]')]
        .find((item) => item.dataset.noteId === id);
      const frame = container?.querySelector("iframe");
      const style = frame ? getComputedStyle(frame) : null;
      let contentDocument: unknown = null;
      try { contentDocument = frame?.contentDocument?.readyState ?? null; }
      catch (failure) { contentDocument = { error: String(failure) }; }
      const activeTab = document.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
      const editor = [...document.querySelectorAll<HTMLElement>('[data-mode="visual"], [data-mode="code"]')]
        .find((item) => item.getClientRects().length > 0);
      return {
        url: location.href, userAgent: navigator.userAgent,
        reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
        activeTab: activeTab?.dataset.noteId ?? null, activeMode: editor?.dataset.mode ?? "view",
        revision: container?.dataset.revision ?? null,
        loadedRevision: container?.dataset.loadedRevision ?? null,
        editing: container?.dataset.editing ?? null, saving: container?.dataset.saving ?? null,
        frame: frame ? {
          src: frame.src, contentDocumentReadyState: contentDocument,
          rect: frame.getBoundingClientRect().toJSON(), display: style?.display,
          visibility: style?.visibility, opacity: style?.opacity,
          container: {
            className: container?.className, hidden: container?.hidden,
            inert: container?.hasAttribute("inert"), ariaHidden: container?.getAttribute("aria-hidden"),
            rect: container?.getBoundingClientRect().toJSON(),
          },
        } : null,
      };
    }, target.id);
  });
  await probe("currentFrame", async () => {
    await browser.switchFrame(null);
    const frame = await $(`iframe[title=${JSON.stringify(target.title)}]`);
    await browser.switchFrame(frame);
    // The note origin is isolated from the host. Read readyState in the frame itself.
    return readDocument();
  });
  await probe("disk", async () => {
    await browser.switchFrame(null);
    const result = await browser.executeAsync((done) => {
      const api = (window as unknown as {
        __TAURI_INTERNALS__: { invoke: (command: string) => Promise<string> };
      }).__TAURI_INTERNALS__;
      void api.invoke("get_root_dir").then(
        (root) => done({ root }), (failure) => done({ error: String(failure) }),
      );
    }) as { root?: string; error?: string };
    if (!result.root) throw new Error(result.error ?? "Missing note root");
    const path = join(result.root, target.relPath, "index.html");
    const html = await readFile(path, "utf8");
    return { path, containsLink: html.includes(target.expectedHref), html };
  });
  await probe("restoreMainFrame", () => browser.switchFrame(null));
  const directory = resolve("e2e", "logs");
  const path = join(directory, `note-frame-${target.id}-${Date.now()}.json`);
  diagnostics.logPath = path;
  try {
    await mkdir(directory, { recursive: true });
    await writeFile(path, JSON.stringify(diagnostics, null, 2), "utf8");
  } catch (failure) { diagnostics.logWriteError = String(failure); }
  return new Error(`${diagnostics.failure}\nNote iframe diagnostics: ${JSON.stringify(diagnostics, null, 2)}`, { cause: error });
}
