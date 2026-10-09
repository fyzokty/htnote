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

On Windows, debug builds explicitly pass non-empty
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` to every WebView2 environment, including
`main` and the hidden `pdf-export-*` windows. The merged arguments are computed
once at startup and shared by configured and dynamically created windows.
wry's explicit browser arguments can override the environment
variable, preventing EdgeDriver's `--remote-debugging-port=0` and
`--enable-automation` from reaching WebView2 and causing `DevToolsActivePort`
session failures. The debug override preserves wry 0.57's disabled features and
autoplay default, appends the driver arguments, and merges repeated
`--disable-features=` / `--enable-features=` values into one switch each so
Chromium does not discard earlier values. Window configuration and capabilities
are preserved; PDF windows still have no capability permissions. WebView2 requires
identical `AdditionalBrowserArguments` for environments sharing a user data
folder; otherwise creating the PDF environment fails with `0x8007139F`.
Empty variables, release builds and other platforms keep their existing behavior.

Each session and test returns to the main frame and waits for the loaded React
shell and Tauri IPC before executing host commands. The save shortcut also waits
for the editor's save acknowledgement before another shortcut is sent; a file
appearing on disk alone does not mean the editor has finished saving. Conditions
have bounded timeouts for slower CI runners, without fixed sleeps or test retries.

Settings controls use stable test IDs rather than translated button text; the
tab sizing flow runs in both Turkish and English. Specs that select translated
labels pin the language in settings (editing/widgets: `tr`, colors: `en`), because the
default follows the OS locale and CI runs in `en-US`. Right-side media gap clicks
stay left of a visible overlay scrollbar track, which owns clicks on its strip
when a smaller window makes the editor scrollable. The external-change flow polls
the frame text without implicit element waits, so a reload right after frame
entry re-enters the new frame; search queries replace the remembered text via
keyboard selection and wait for the input value. Outside media clicks must leave
a gap cursor immediately before or after that media, keep the same position on
mouseup, and leave its toolbar hidden. The application uses the media NodeView's
bounds in the capture phase to place left/right clicks before/after that media.
Small vertical gaps within a row's computed CSS margin snap to the nearest media
row by vertical distance (ties use document order), placing the cursor before
the row when clicking above it and after it when clicking below it. Preview,
toolbar and text-row clicks retain their normal behavior. Unit tests cover these
gaps, nearest-row selection, incorrect coordinate hit tests and media event targets.

CodeMirror virtualizes off-screen lines, so `.cm-content.getText()` reads only
the rendered viewport, not the entire HTML document. Scroll the relevant content
into view before asserting its source (the color flow uses Ctrl+End to reveal
the note content after the appearance CSS). Also verify saved HTML through
`read_note` and computed colors in the reopened note iframe.

Widget content clicks use `visibleEditorContentControl`. In a narrow window,
`visibleEditorTool` opens the toolbar overflow panel to reach Insert Widget.
WebDriver `setValue` focuses fields without an outside pointerdown, so the panel
can remain open and its disabled controls' tooltip anchors intercept the widget
background button. A real click in the widget title closes that panel. The helper
closes it with a real overflow-trigger click, scrolls the target using the editor's
sticky-toolbar padding, and waits for stable geometry and clickability. It does
not dispatch synthetic clicks or add fixed pauses.

Run the editing and widget specs with the default window first, then repeat under
the smaller CI-like window and English WebView2 locale:

```powershell
$env:CARGO_BUILD_JOBS = "4"
npx wdio run e2e/wdio.conf.ts --spec e2e/specs/flows-widgets.e2e.ts --spec e2e/specs/flows-editing.e2e.ts
$env:HTNOTE_E2E_WINDOW_SIZE = "1028x780"
$env:HTNOTE_E2E_BROWSER_LANGUAGE = "en-US"
npx wdio run e2e/wdio.conf.ts --spec e2e/specs/flows-widgets.e2e.ts --spec e2e/specs/flows-editing.e2e.ts
Remove-Item Env:HTNOTE_E2E_WINDOW_SIZE, Env:HTNOTE_E2E_BROWSER_LANGUAGE
```

`HTNOTE_E2E_WINDOW_SIZE` is opt-in and logs the actual viewport, locale and user
agent. `HTNOTE_E2E_BROWSER_LANGUAGE` passes `--lang` via
[`webviewOptions.additionalBrowserArguments`](https://learn.microsoft.com/en-us/microsoft-edge/webdriver/capabilities-edge-options#webviewoptions-object)
and asserts `navigator.language`. EdgeDriver replaces the browser argument
environment when launching the application, so setting `--lang` only in
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` can silently leave the OS locale active.
Keep application language pinned inside specs even when the browser is started
with `--lang=en-US`.

If session creation fails, first check that both drivers are on `PATH` and that
the EdgeDriver major version matches WebView2. If a security assertion fails,
inspect the failing `data-*` result in the note iframe and investigate the
isolation boundary; do not loosen the assertion or sandbox policy.

CI uses the runner's default WebView2 Runtime and installs the matching
EdgeDriver with `msedgedriver-tool`. Updating the runtime was attempted, but the
new runtime triggers [runner image issue 14738](https://github.com/actions/runner-images/issues/14738),
causing sessions to fail with `DevToolsActivePort file doesn't exist`.
The varying vertical coordinate differences in CI may come from measuring a
target while an entry animation or transition is still moving it; a coordinate
mismatch alone does not establish a WebDriver bug. On Windows, the E2E capability
passes `--force-prefers-reduced-motion` to WebView2 via
`tauri:options.webviewOptions.additionalBrowserArguments`. The session hook asserts
`matchMedia('(prefers-reduced-motion: reduce)').matches === true`. The screenshot
configuration inherits both the capability and the assertion. Only these test
launches force reduced motion; production animation behavior and the Tauri
application configuration are unchanged.

Driver output is also saved to `e2e/logs/tauri-driver.log`. CI prints the driver
and WebView2 versions, launches the debug app directly with temporary root and
config overrides, and uploads `e2e/logs/` on failure. The app startup diagnostic
captures its stdout and stderr there as separate files.
Outside media clicks append geometry, hit testing, DOM and ProseMirror selections
before/after mousedown and mouseup, handler decisions, and the user agent to
`e2e/logs/media-click-diagnostics.json`. The same JSON appears in assertion
failures. Coordinate-sensitive clicks, tab drags and hovers use `helpers/pointer.ts`
with real WebDriver mouse actions. Before measuring an element origin, the
helper waits for its rectangle to remain unchanged across two consecutive
animation frames with no `running` animations from `document.getAnimations()`.
The wait has a five-second timeout that reports geometry and animation names;
finished/paused animations do not block it. Media gap clicks also wait before
calculating their intended point. For each target point, the helper moves the
pointer, reads the actual trusted DOM `clientX/clientY`, and adjusts the commanded
coordinates by the measured error. Each point has at most three attempts to
reach ±2 px tolerance; failures report the target, actual point and correction,
plus the target rectangle and running animation count/names at measurement and
trusted event time (before application handlers run). Events inside a sandboxed
child frame report that document's animations and a null target rectangle when
the origin belongs to the parent document.
There is no global calibration or assumption that offsets at different positions
match. Down/up actions use the corrected pointer position and their actual events
are also verified. Drags correct the activation point, every waypoint and the
drop destination, accounting for moving element origins. Failed drags cancel the
active sensor before releasing buttons; a mismatched click button event retries
the click once with a fresh target correction. Temporary document listeners also observe
visible note frames during a drag's vertical excursion and are removed in
`finally`, along with releasing mouse buttons. The correction helper tests run
with `node --import tsx --test e2e/helpers/pointer.test.ts` and inject offsets of
0, 12 and 30 px, position-dependent and changing drift, missing events and
persistent failures without an older runtime. They also cover moving target
rectangles, waiting for running animations, bounded stability timeouts, and
measurement/event snapshots that distinguish target motion from driver offsets.
Assertions compare the handler's actual event coordinates with the
intended point (allowing only 1 px rounding) and verify that it is outside the
preview in the intended row using bounds recorded at mousedown, before selection
can change the layout; drift reports the expected/actual point and offset.
The handler trace is enabled only for each diagnostic click through an explicit
test hook. Gap-cursor and mouseup expectations remain unchanged.
Failed tests save screenshots in `e2e/logs/` and print the current frame URL,
document readiness and security probe results to the test log.
Internal-link iframe failures also include a diagnostic JSON in the error and
`e2e/logs/note-frame-<id>-<timestamp>.json`, before the temporary root is removed.
It records the failing frame context and the currently attached frame separately,
their URLs/revisions and document readiness, expected link presence, iframe
visibility/geometry, host revision and loaded revision, active tab/editor mode,
editing/saving state, and the actual `index.html` from disk with its link presence.
The host cannot access the isolated frame's `contentDocument`; its null result is
recorded, and document readiness is also read through WebDriver inside the frame.
Probe failures are recorded independently and do not replace the original assertion.
Assertions and their timeouts are unchanged; failed actions are not retried.
For race diagnosis, set `HTNOTE_E2E_CPU_THROTTLE=4` before running the usual WDIO
command to request fourfold CPU slowdown through EdgeDriver's DevTools endpoint.
This is opt-in and leaves normal suite launches unchanged.
To repeat both save-race specs fifteen times with fourfold CPU slowdown:

```powershell
$env:HTNOTE_E2E_CPU_THROTTLE = "4"
npx wdio run e2e/wdio.conf.ts --spec e2e/specs/flows-links.e2e.ts --spec e2e/specs/flows-editing.e2e.ts --repeat 15
```

The link flow selects the result by its expected title, then checks the inserted
editor anchor and dirty status before saving. Both save flows wait for the enabled
Save button, the return to view mode, and the expected `read_note` HTML. The
counter flow checks the script and button remain in the saved HTML after the
visual edit. Frame entry waits for a visible, non-inert view with an acknowledged
revision, then verifies that revision and document readiness inside the frame.
These are state waits; assertions are neither retried nor relaxed.
CI E2E is pinned to `windows-2022` until [runner image issue 14738](https://github.com/actions/runner-images/issues/14738) is resolved.

### Harici açılış kaydı

E2E ve ekran görüntüsü yapılandırmalarının ortak `onPrepare` kancası geçici bir JSONL dosyası oluşturur ve `HTNOTE_EXTERNAL_OPEN_LOG` değişkenini WDIO worker ve tauri-driver ortamına verir. tauri-driver → EdgeDriver → uygulama ortam devralması izolasyon testindeki `https://example.com` kaydıyla doğrulanır. Debug uygulama URL/asset/klasörde göster işlemlerini kaydeder; gerçek tarayıcı veya gezgin açmaz. Release bu değişkeni yok sayar.

Çalıştırma sonunda kayıt `e2e/logs/external-open.jsonl` dosyasına kopyalanır. İzolasyon testleri üst pencere URL'sinin değişmediğini, sandbox kaçışlarının ve yeni komutların not/taslak iframe'lerinden reddedildiğini ayrıca denetler. `npm run smoke:app` de geçici kayıt dosyası kullanır ve yolunu yazdırır.
