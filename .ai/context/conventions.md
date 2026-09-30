# Project Conventions

> Every agent receives this file. Authoritative decisions: `docs/decisions.md`.

## Naming
- TS: React components `PascalCase.tsx`; hooks `useX.ts`; other modules `camelCase.ts`; Zustand stores `xxxStore.ts`.
- Rust: `snake_case` modules/functions, `PascalCase` types. Structs crossing IPC use `#[serde(rename_all = "camelCase")]`.
- IPC commands are `snake_case` verbs (`read_note`, `save_note`). Notes are addressed by `note_id` (UUID), folders by root-relative path.
- postMessage types are `HTNOTE_*` (D09). Theme CSS variables use the `--ht-*` prefix.

## File Structure
- Frontend (D14): `src/app`, `src/features/<feature>/`, `src/components/ui`, `src/lib`, `src/stores`, `src/locales`.
- Import alias `@/` → `src/` (use it instead of deep relative paths).
- Rust (D14): `src-tauri/src/{commands,notes,index,watcher,protocol,search,trash,export,settings,error}.rs` or `/` module dirs. `lib.rs` wires the builder; `main.rs` only calls `run()`.

## State Management
- Zustand stores only (`settingsStore`, `treeStore`, `tabsStore`, `uiStore`). No other global state library.
- Business logic lives in plain, testable TS modules/stores, not inside components (UI tasks get no tests).

## IPC
- `invoke` is called ONLY from typed wrappers in `src/lib/ipc.ts`. Components and stores never import `invoke` directly.
- Rust ↔ TS types are mirrored by hand in `src/lib/types.ts`; keep both sides in sync in the same change.
- New commands must be registered in `lib.rs` and, if they need permissions, in `src-tauri/capabilities/default.json` (main window only).

## Error Handling
- Rust commands return `Result<T, AppError>`; `AppError` serializes to `{ code, message }` with `thiserror` (D18). Codes are SCREAMING_SNAKE (`NOTE_NOT_FOUND`, `NAME_CONFLICT`, `INVALID_NAME`, `IO_ERROR`, `PATH_OUTSIDE_ROOT`).
- Rust returns codes, never user-facing text. Frontend maps `code` → i18n key `errors.<CODE>` and shows a toast; `message` is for logs only.
- No `unwrap()`/`expect()` on runtime paths in Rust (tests and startup wiring excepted).

## i18n
- All UI text via `t()` from i18next; keys in `src/locales/tr.json` and `src/locales/en.json` (add to both). No hard-coded UI strings (D17).

## Paths & Platform
- Build paths with `PathBuf::join` / `path.join`; never hard-code `\` or `/` separators (D01).
- Windows-only code behind `#[cfg(windows)]` with a compilable fallback for other targets.

## Logging
- No stray `console.log` in committed frontend code. Rust: no `println!` in app code paths; return errors instead.

## Testing (D20)
- Frontend: Vitest + Testing Library + jsdom; tests colocated as `src/**/*.test.{ts,tsx}`. Mock IPC with `@tauri-apps/api/mocks` (`mockIPC`); `src/test/setup.ts` clears mocks after each test.
- Rust: `#[cfg(test)] mod tests` in the same file; file-system tests use `tempfile` on real directories. File ops, sanitize, head sync, index, search, trash and export must be tested.
- Must-test frontend: stores, content-region parser, TipTap round-trip, shortcut registry.
- `kind: UI` tasks write no tests; keep logic out of components so it stays testable.
- Never run `tauri dev`. Launch verification only via `npm run smoke:app`. E2E (`npm run test:e2e`) is not part of per-task validation.
- Validation: `npm run verify:analyze` (eslint + tsc + clippy `-D warnings`), `npm run verify:test` (vitest + cargo test), `npm run verify:build`.

## Imports
- Use `@/` alias for `src/` imports. Group: external packages first, then `@/` imports, then relative.

## Formatting
- No formatter is configured; match the surrounding style (2-space TS, double quotes, semicolons, trailing commas; `rustfmt` defaults for Rust).
- ESLint (flat config) + `tsc` strict with `noUnusedLocals`/`noUnusedParameters`; clippy warnings are errors.

## Code Style
- Code comments and doc comments are written in Turkish (match existing files). Identifiers are English.
- Comment non-obvious code; explain the why, especially for security and file-system edge cases.
- Do not compress logic into unreadable one-liners.
