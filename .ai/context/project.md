# Project Context

> Every agent receives this file. `docs/decisions.md` (D01–D26) is the authoritative source; on any conflict with other docs, it wins.

Project Type: Local-first desktop note-taking app (HTNote). Notes are plain HTML/CSS/JS bundles on disk and may run user JavaScript.
Primary Language: TypeScript (strict) for the frontend, Rust (edition 2021) for the backend.
Framework: Tauri v2 + React 19 + Vite; Tailwind CSS v4 (`dark` class strategy) + lucide-react icons. Planned: TipTap (visual editor), CodeMirror 6 (code editor), @dnd-kit (in-app drag/drop), i18next (TR/EN).
State Management: Zustand (`settingsStore`, `treeStore`, `tabsStore`, `uiStore`) — planned, see D14.
Architecture: React host window ↔ Tauri IPC commands (Rust) ↔ file system; notes rendered in a sandboxed iframe served from the custom `htnote-note` protocol (different origin). See architecture.md.
Navigation: Single window; tabs + sidebar tree, no router. Notes are addressed by UUID (`htnote://note/<uuid>`), folders by root-relative path.
Networking: None. Fully offline. External links open in the system browser via `tauri-plugin-opener`.
Persistence: File system only. Note root default `Documents/HTNote/` (note = directory containing `metadata.json` + `index.html` [+ `style.css`, `script.js`, `assets/`]). App settings and drafts live in the Tauri app config/data dir (`%APPDATA%\com.htnote.app\`), never in the note root. Writes are atomic (temp file + rename). Deletion moves to `.trash/`.
Supported Platforms: Windows first (development, testing, CI on `windows-latest`). Code must stay cross-platform-compilable; macOS/Linux specifics come last.

## Current State

Early skeleton (phase 1): `src/App.tsx` shell, `src-tauri/src/lib.rs` with only the opener plugin. Most folders in D14 do not exist yet; create them as tasks require.

## Important Constraints

- Follow `docs/decisions.md`; do not contradict a decision without the task explicitly changing it.
- Security model (D08/D09) is non-negotiable: note content is never injected into the host DOM, never loaded via `srcdoc` or from the app origin.
- Never run `tauri dev` / `npm run tauri dev` (runs forever). To verify the app launches, use `npm run smoke:app`.
- Package manager is npm. Do not add dependencies outside the D02 list without the task stating it.
- Out of scope for v1.0 (D26): cloud sync, multi-window, version history, templates, plugins, mobile.
- Preserve existing public contracts (IPC command names/payloads, `AppError` codes, postMessage types) unless the task explicitly requires a change.
- Prefer existing project patterns and dependencies.
