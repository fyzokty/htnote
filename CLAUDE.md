# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Proje kuralları

- Commit mesajı: `tür(kapsam): Türkçe açıklama.` (tür: feat, fix, chore…), ör. `fix(editor): kayıt sırasında bekleyen görsel değişikliğin kaybolmasını önle.`
- Branch adı: `NNNN-tür(kapsam)-kisa-slug` (ör. `0150-fix(e2e)-harici-acmalari-engelle`), ardından PR ve merge.
- `/orch` ve `.ai/` artık kullanılmıyor; yerel `tasks/README.md` içindeki orch atıfları eskidir.
- `tasks/` gitignore'dadır (yerel planlama, ajan brief'leri, `tasks/design/` tasarım referansları).

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run verify:analyze` | sürüm eşitliği + ESLint + `tsc --noEmit` (iki tsconfig) + `cargo clippy -D warnings` |
| `npm run verify:test` | `vitest run` + `cargo test` |
| `npm run verify:build` | `vite build` + `cargo build` |
| `npm run smoke:app` | Debug build alır, pencereyi açar, kısa süre izler, kapatır (çıkış kodu 0/1) |
| `npm run test:e2e` | `tauri build --debug --no-bundle` + WebdriverIO (`tauri-driver` + WebView2 ile aynı major `msedgedriver` gerekir; bkz. `e2e/README.md`) |
| `npm run bench` | Rust `tests/perf.rs` (`--ignored`) + `vitest.perf.config.ts` (`*.perf.test.*`) |
| `npm run docs:screenshots` | `docs/images/` ekran görüntülerini fixture'lardan üretir |

Tek test çalıştırma:
- Vitest: `npx vitest run src/features/editor/saveTab.test.ts` veya `-t "test adı"`
- Rust: `cargo test --manifest-path src-tauri/Cargo.toml <test_adı_filtresi>`
- E2E tek spec: `npx wdio run e2e/wdio.conf.ts --spec e2e/specs/flows-links.e2e.ts` (önce debug build gerekir)
- E2E pointer yardımcıları: `node --import tsx --test e2e/helpers/pointer.test.ts`

Uygulamayı doğrulamak için `npm run tauri dev` kullanma (süresiz çalışır); `npm run smoke:app` kullan. Ajan çalıştırırken `CARGO_BUILD_JOBS=4` ve vitest `--maxWorkers=2` ile sınırla.

CI (`.github/workflows/ci.yml`) yalnızca `main`'e push'ta veya `gh workflow run CI --ref <branch>` ile çalışır; `cross-platform.yml` push'ta yalnızca belirli dosyalar değişince çalışır ve `linux-e2e` işi yalnızca elle/haftalık tetiklenir; Rust veya e2e yapılandırması değişince `gh workflow run Cross-platform --ref <branch>` ile elle çalıştır. E2E CI job'u `windows-2022`'ye sabitlenmiştir. Asıl kapı yerel doğrulamadır; CI'da deneme-yanılma döngüsüne girme. Sürüm değişince `package.json`, `src-tauri/Cargo.toml` ve `tauri.conf.json` eşitlenip `npm run version:check` çalıştırılır; `v*` etiketi taslak release üretir.

## Mimari

Tauri v2 masaüstü uygulaması: Rust çekirdeği (`src-tauri/src`) + React 19/TS/Vite ön yüz (`src`). Notlar disk üzerinde açık HTML paketleridir; veritabanı yoktur.

**Yetkili kaynak `docs/decisions.md`'dir (D01–D29).** Arayüz dili (renk, tipografi, bileşenler) kökteki `DESIGN.md`'dedir. Diğer dokümanlarla çelişirse o geçerlidir. Özellikle `docs/architecture.md` hâlâ eski `htnote-note` protokolünü anlatır; güncel tasarım D08'deki loopback HTTP sunucusudur.

### Not modeli
- İçinde `metadata.json` olan dizin bir nottur (`index.html`, isteğe bağlı `style.css`, `script.js`, `assets/`); olmayan dizin klasördür. `.` ile başlayan dizinler (`.trash` dahil) taranmaz.
- Notlar UUID (`metadata.id`) ile, klasörler köke göreli yolla adreslenir. Klasör adı = `sanitize(title)` (D05).
- Rust'taki bellek içi `NoteIndex` (`index/`) id → yol/metadata eşlemesini, `search/` Türkçe kurallı küçük harfle tam metin indeksini tutar. İkisi de `watcher.rs` (notify-debouncer-full, 250 ms) ile güncellenir ve ön yüze `fs-change` event'i gider.
- Yazımlar atomiktir (geçici dosya + rename, `fs_util.rs`). `<head>` senkronizasyonu (`<title>`, `meta[name^=htnote-]`, style/script etiketleri) Rust'ta `lol_html` ile yapılır (`notes/html.rs`, `notes/save.rs`).
- Ayarlar ve taslaklar not kökünde değil, app config/data dizinindedir (`%APPDATA%\com.htnote.app\`).

### Güvenlik sınırı (en kritik kısım)
- Not HTML/JS'i asla ana origin'de çalışmaz. `note_server.rs` `127.0.0.1:<rastgele port>` üzerinde dinler, `Host` başlığını tam eşleştirir ve yalnızca indeksteki not dizinlerinden dosya sunar (`protocol/mod.rs`: canonicalize + prefix kontrolü, Range desteği). Canlı önizleme `/<id>/__draft/<rev>/` altından bellekteki taslağı sunar.
- Viewer iframe: `sandbox="allow-scripts allow-forms allow-same-origin allow-modals"`. `srcdoc` ve `dangerouslySetInnerHTML` yasaktır; popup, top-navigation ve download izni verilmez. Tauri özel URI şemalarına IPC enjekte ettiği için özel protokol yerine HTTP origin seçildi.
- `src/bridge/bridge.js` sunucu tarafından HTML yanıtlarına enjekte edilir (`include_str!`). iframe ↔ host iletişimi yalnızca D09'daki `postMessage` tablosuyla olur. Host `event.source` ve `event.origin`'i doğrular (`src/features/viewer/bridgeHost.ts`).
- URL/asset açma ve klasörde gösterme yalnızca `src-tauri/src/external.rs` üzerinden geçer (D28). Debug build'de `HTNOTE_EXTERNAL_OPEN_LOG` ayarlıysa gerçekte açmak yerine JSONL kaydı yazılır. E2E/smoke bunu kullanır; URL/dosya açan yeni testler de bu yoldan geçmelidir.
- E2E güvenlik assertion'ı başarısız olursa assertion'ı veya sandbox politikasını gevşetme; izolasyon sınırını incele.

### Ön yüz
- IPC yalnızca `src/lib/ipc.ts` içindeki tipli sarmalayıcılarla çağrılır; bileşenler `invoke`'u doğrudan çağırmaz. Rust ↔ TS tipleri elle `src/lib/types.ts`'te eşlenir (serde `camelCase`). Yeni komut eklerken `lib.rs`'deki `generate_handler!`, `commands/mod.rs`, `ipc.ts` ve `types.ts` birlikte güncellenir. Hatalar `{ code, message }` biçiminde `AppError` olarak döner (`error.rs` ↔ `src/lib/errors.ts`).
- Durum Zustand'dadır: `settingsStore`, `treeStore`, `tabsStore` (sekmeler + belge/düzenleme durumu), `uiStore`.
- Editör (D10): TipTap yalnızca `main#htnote-content`'in içini düzenler. Şemanın kayıpsız temsil edemediği üst seviye çocuklar ham `outerHTML` saklayan `htmlBlock` atom node'una çevrilir (`features/editor/blockClassifier.ts`, `contentRegion.ts`, `visualPipeline.ts`). Kod modu (CodeMirror 6) tam `index.html`, `style.css` ve `script.js`'i düzenler. Kayıt manueldir; kaydedilmemiş sekmeler 5 sn debounce ile taslak yazar (`recoveryDrafts.ts`). Dış değişiklik içerik hash'iyle tespit edilir (`externalChange.ts`).
- i18n: `src/locales/{tr,en}.json`. ESLint `i18next/no-literal-string` (JSX metni) hata verir; UI metinleri çeviri anahtarıyla yazılır.
- Kısayollar merkezi registry'dedir (`src/lib/shortcuts`). iframe odaktayken bridge `HTNOTE_SHORTCUT` ile iletir.
- Mantık UI bileşenlerinden ayrı, test edilebilir modüllerde (`*.ts` + `*.test.ts`) tutulur. Ön yüz testleri IPC'yi `mockIPC` ile taklit eder; Rust testleri `tempfile` ile gerçek dosya sistemi kullanır.

### Platform
Birincil geliştirme ve E2E platformu Windows'tur, ancak kod macOS/Linux'ta da derlenmelidir. Windows'a özgü kod (`webview2-com` ile PDF dışa aktarma vb.) `#[cfg(windows)]` arkasında, derlenebilir bir yedekle tutulur. Yollar her zaman `PathBuf`/`path.join` ile birleştirilir.
