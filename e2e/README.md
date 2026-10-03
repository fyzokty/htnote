# Windows E2E isolation tests

The suite launches the real debug Tauri executable through WebdriverIO and
`tauri-driver`. It creates a fresh temporary note root and config directory for
each run, copies `fixtures/` into the root, and removes both directories after
the run. The two overrides are compiled only in debug builds.

## Prerequisites

1. Install Rust, Node.js, npm, and the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/).
2. Run `npm ci` for the WebdriverIO packages.
3. Run `cargo install tauri-driver --locked` and put Cargo's `bin` directory on `PATH`.
4. Install a Microsoft Edge WebDriver matching the **WebView2 Runtime** version,
   which can differ from the Edge browser version. One option is:

   ```powershell
   cargo install --git https://github.com/chippers/msedgedriver-tool msedgedriver-tool
   msedgedriver-tool
   # Put the generated msedgedriver.exe directory on PATH.
   ```

   Check the runtime version in the WebView2 Runtime entry under Apps or in the
   Microsoft EdgeUpdate Clients registry key. Confirm `msedgedriver --version`
   reports the same major version.

   Set `MSEDGEDRIVER_PATH` to the matching executable's absolute path to make
   `tauri-driver` use that binary even if another driver appears first on `PATH`.

Run `npm run test:e2e`. This builds the debug executable without an installer,
then runs all specs. The E2E suite is separate from `verify:test`.

Each session and test returns to the main frame and waits for the loaded React
shell and Tauri IPC before executing host commands. The save shortcut also waits
for the editor's save acknowledgement before another shortcut is sent; a file
appearing on disk alone does not mean the editor has finished saving. Conditions
have bounded timeouts for slower CI runners, without fixed sleeps or test retries.

Settings controls use stable test IDs rather than translated button text; the
tab sizing flow runs in both Turkish and English. Outside media clicks must leave
a gap cursor immediately before or after that media, keep the same position on
mouseup, and leave its toolbar hidden. WebView2 versions can resolve outside
coordinates to either adjacent boundary; the unit tests separately verify the
application's left/right placement with fixed geometry.

CodeMirror virtualizes off-screen lines, so `.cm-content.getText()` reads only
the rendered viewport, not the entire HTML document. Scroll the relevant content
into view before asserting its source (the color flow uses Ctrl+End to reveal
the note content after the appearance CSS). Also verify saved HTML through
`read_note` and computed colors in the reopened note iframe.

If session creation fails, first check that both drivers are on `PATH` and that
the EdgeDriver major version matches WebView2. If a security assertion fails,
inspect the failing `data-*` result in the note iframe and investigate the
isolation boundary; do not loosen the assertion or sandbox policy.

Driver output is also saved to `e2e/logs/tauri-driver.log`. CI prints the driver
and WebView2 versions, launches the debug app directly with temporary root and
config overrides, and uploads `e2e/logs/` on failure. The app startup diagnostic
captures its stdout and stderr there as separate files.
Failed tests save screenshots in `e2e/logs/` and print the current frame URL,
document readiness and security probe results to the test log.
CI E2E is pinned to `windows-2022` until [runner image issue 14738](https://github.com/actions/runner-images/issues/14738) is resolved.
