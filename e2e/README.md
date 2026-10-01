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
then runs both specs. The E2E suite is separate from `verify:test`.

If session creation fails, first check that both drivers are on `PATH` and that
the EdgeDriver major version matches WebView2. If a security assertion fails,
inspect the failing `data-*` result in the note iframe and investigate the
isolation boundary; do not loosen the assertion or sandbox policy.

Driver output is also saved to `e2e/logs/tauri-driver.log`. CI prints the driver
and WebView2 versions, launches the debug app directly with temporary root and
config overrides, and uploads `e2e/logs/` on failure. The app startup diagnostic
captures its stdout and stderr there as separate files.
