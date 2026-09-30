# Architecture Context

> Read when a change touches layer boundaries. Details: `docs/decisions.md` D08, D09, D10, D12, D14, D18.

## Layer Boundaries
- **Host UI (React, app origin `tauri.localhost`)**: components → stores → `src/lib/ipc.ts` → Tauri `invoke`. Only the host window has IPC capabilities.
- **Rust core (`src-tauri/src`)**: command handlers (thin) → domain modules (`notes`, `index`, `search`, `trash`, `export`, `settings`) → `std::fs`. Watcher and protocol handler sit beside commands and share the in-memory `NoteIndex`.
- **Note sandbox (iframe, origin `http://htnote-note.localhost`)**: user HTML/CSS/JS served by the `htnote-note` custom protocol. Has zero IPC permissions; talks to the host only via postMessage.

## Security Model (D08/D09) — critical
- Note HTML is never injected into the host DOM (`dangerouslySetInnerHTML` forbidden) and never loaded via `srcdoc` or from the app origin.
- iframe `sandbox="allow-scripts allow-forms allow-same-origin allow-modals"`; never add `allow-top-navigation*`, `allow-popups*`, `allow-downloads`.
- Host CSP: `frame-src http://htnote-note.localhost htnote-note:` only. Capabilities (`src-tauri/capabilities/`) are scoped to the `main` window/app origin.
- Protocol handler serves only files under an indexed note's directory (canonicalize + prefix check, reject `..`), 404 for unknown ids, supports HTTP Range, MIME via `mime_guess`. Injects `<script src="/__htnote/bridge.js">` into HTML responses only (disk untouched). Live preview: `/<id>/__draft/<rev>/...` serves index/style/script from the in-memory draft, assets from disk.
- Host accepts messages only when `event.source === iframe.contentWindow` AND `event.origin` is the note origin; payloads validated, unknown types ignored. iframe→host: `HTNOTE_READY`, `HTNOTE_OPEN_NOTE`, `HTNOTE_OPEN_EXTERNAL`, `HTNOTE_SHORTCUT`; host→iframe: `HTNOTE_THEME`, `HTNOTE_HIGHLIGHT`. `javascript:`/`file:` links blocked.

## Dependency Direction
- UI components → stores / feature logic → `src/lib/ipc.ts` + `src/lib/types.ts`. Nothing below imports React components.
- Rust: `commands` → domain modules → `error`. Domain modules do not depend on Tauri types where avoidable (keeps them unit-testable with `tempfile`).

## Feature Structure
- Frontend features under `src/features/<feature>/` (tree, tabs, viewer, editor, search, trash, settings, export). Shared primitives in `src/components/ui`. App shell in `src/app`.
- Editor model (D10): TipTap edits only the children of `main#htnote-content`; unsupported top-level children become lossless `htmlBlock` atom nodes; head/outside-main/style.css/script.js are preserved. Code mode edits the raw files. Head sync (`<title>`, `meta[name^=htnote-]`, css/js link tags) happens in Rust with `lol_html`.

## Global State
- Zustand: `settingsStore`, `treeStore`, `tabsStore` (tabs + per-document dirty state), `uiStore` (modals, toasts, sidebar).
- Rust: in-memory `NoteIndex` (`id → rel path`, `id → metadata`), search index and link (backlink) index, updated by full scan at startup and by the watcher.

## Repository / Data Boundaries
- File system is the database. Note = dir with `metadata.json`; dir without it = folder; dot-dirs ignored (D04). Folder name = `sanitize(title)`, `metadata.title` is the display source (D05). UUID v4 ids; duplicate ids from external copies get a new id (D06).
- Settings: app config dir `settings.json`; drafts: app data dir `drafts/<id>.json` (D03, D11). Trash: `.trash/<name>__<yyyyMMdd-HHmmss>/` + `.htnote-trash.json` (D23).
- All writes atomic (temp + rename). Any path from the frontend is resolved against the root and rejected with `PATH_OUTSIDE_ROOT` if it escapes.

## Watcher (D12)
- `notify-debouncer-full`, 250 ms, recursive on the root → update indexes → emit `fs-change` (affected rel paths + ids). Own writes are distinguished from external ones by content hash of the last save.

## Navigation
- No router. Tabs keyed by note id; `htnote://note/<uuid>` opens/focuses a tab and selects the tree node. Shortcuts from one central registry, captured before TipTap/CodeMirror; forwarded from the iframe via `HTNOTE_SHORTCUT` (D16).

## Dependency Injection
- None. Rust shares state via Tauri managed state (`app.manage`, `State<'_, T>`); frontend uses store singletons and module imports. Tests mock IPC with `mockIPC`.

## Error Handling
- Rust: `thiserror`-based `AppError { code, message }` returned from every command (D18). Frontend: `ipc.ts` wrappers surface `AppError`; UI maps `code` → `errors.<CODE>` i18n toast.
