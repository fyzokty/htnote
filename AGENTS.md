# AGENTS.md

HTNote: Tauri v2 masaüstü not uygulaması. Rust çekirdeği `src-tauri/src` altında, React 19/TS/Vite ön yüzü `src` altında. Notlar diskte HTML paketleridir, veritabanı yoktur.

**Yetkili kaynaklar:** mimari ve davranış için `docs/decisions.md` (D01–D29), arayüz dili için `DESIGN.md`. Diğer dokümanlarla çelişirse bunlar geçerlidir; `docs/architecture.md` eskidir. Bu dosyayı kısa tut, ayrıntıyı oraya yaz.

## Doğrulama
| Komut | Ne yapar |
|---|---|
| `npm run verify:analyze` | sürüm eşitliği, ESLint, `tsc` (iki tsconfig), `cargo clippy -D warnings` |
| `npm run verify:test` / `verify:build` | vitest ile cargo test / vite build ile cargo build |
| `npm run smoke:app` | debug build alır, pencereyi açıp kapatır. `npm run tauri dev` kullanma, süresiz çalışır |
| `npm run test:e2e` | debug build alır, WebdriverIO çalıştırır (kurulum: `e2e/README.md`) |

- Tek test: `npx vitest run <dosya>`, `cargo test --manifest-path src-tauri/Cargo.toml <filtre>`.
- Tek E2E spec: `npx tauri build --debug --no-bundle` sonrası `npx wdio run e2e/wdio.conf.ts --spec <spec>`.
- Ajanlar `CARGO_BUILD_JOBS=4` ve vitest `--maxWorkers=2` ile çalışır.
- Asıl kapı yerel doğrulamadır, CI'da deneme-yanılma yapma. CI yalnızca `main` push'unda çalışır. Rust veya E2E yapılandırması değişince `gh workflow run Cross-platform --ref <branch>` ile elle tetikle.
- Sürüm değişince `package.json`, `src-tauri/Cargo.toml` ve `tauri.conf.json` eşitlenir, `npm run version:check` çalıştırılır. `v*` etiketi taslak release üretir.

## Güvenlik sınırı (gevşetilmez)
- Not HTML/JS'i ana origin'de çalışmaz. Notlar `note_server.rs` loopback sunucusundan sunulur (D08): Host tam eşleşir, yalnızca indeksteki not dizinleri sunulur, canonicalize ve prefix kontrolü yapılır.
- Viewer iframe sandbox'ı `allow-scripts allow-forms allow-same-origin allow-modals` ile sınırlıdır. `srcdoc` ve `dangerouslySetInnerHTML` yasaktır.
- iframe ↔ host iletişimi yalnızca D09'daki `postMessage` tablosuyla olur (`src/bridge/bridge.js`, `bridgeHost.ts`).
- URL/dosya açma yalnızca `external.rs` üzerinden yapılır (D28). Testler `HTNOTE_EXTERNAL_OPEN_LOG` ile bunu kayda yönlendirir.
- Bir güvenlik assertion'ı başarısız olursa assertion'ı veya politikayı gevşetme; izolasyonu incele.

## Kod kuralları
- IPC yalnızca `src/lib/ipc.ts` sarmalayıcılarıyla çağrılır. Yeni komut eklerken `generate_handler!` (`lib.rs`), `commands/mod.rs`, `ipc.ts` ve `types.ts` birlikte güncellenir. Hatalar `AppError { code, message }` olarak döner.
- UI metinleri `src/locales/{tr,en}.json` anahtarlarından gelir; JSX literal metin lint hatası verir. Kısayollar `src/lib/shortcuts` registry'sindedir.
- Mantık test edilebilir `*.ts` modüllerinde tutulur. Ön yüz testleri `mockIPC`, Rust testleri `tempfile` kullanır. Kod yorumları Türkçedir.
- Test yalnızca davranış, mantık, veri bütünlüğü ve güvenlik için yazılır. Salt görsel ayrıntı (sıra, sınıf/stil, animasyon zamanlaması, tooltip metni, piksel ölçümü) test edilmez; böyle bir test kırılırsa silinir. E2E yalnızca kritik akışları kapsar.
- Birincil platform Windows'tur ama kod macOS/Linux'ta da derlenmelidir. Windows'a özgü kod derlenebilir bir yedekle `#[cfg(windows)]` arkasında tutulur. Yollar `PathBuf`/`path.join` ile birleştirilir.
- `tasks/` gitignore'dadır: yerel plan, ajan brief'leri ve `tasks/design/` referansları burada durur.
