# Geliştirme rehberi

## Gereksinimler ve ilk çalıştırma

Node.js LTS ve npm, Rust stable (`cargo`), Tauri v2'nin platform araçları gerekir. Windows'ta WebView2 Runtime ve C++ derleme araçları kurulu olmalıdır. Linux ve macOS gereksinimleri için [Tauri ön koşullarına](https://v2.tauri.app/start/prerequisites/) bakın. E2E ve ekran görüntüleri için ayrıca `tauri-driver` (`cargo install tauri-driver --locked`) ve Windows'ta WebView2 Runtime ile aynı ana sürümde `msedgedriver` gerekir. Gerekirse `MSEDGEDRIVER_PATH` ortam değişkenini sürücünün mutlak yoluna ayarlayın; ayrıntılar [E2E rehberinde](../e2e/README.md).

Depoyu klonlayıp kökte `npm ci` çalıştırın. Geliştirme penceresini `npm run tauri dev` ile açın; bu komut izlemeye devam eder. Tek seferlik açılış kontrolü için `npm run smoke:app` kullanın. İlk açılışta varsayılan not kökü `Documents/HTNote/` altında oluşturulur; ayarlardan değiştirilebilir.

## Komutlar

| Komut | Amaç |
|---|---|
| `npm run tauri dev` | Tauri ve Vite geliştirme oturumu |
| `npm run smoke:app` | Masaüstü uygulamasının açılış kontrolü |
| `npm run verify:analyze` | Sürüm eşitliği, ESLint, TypeScript, Clippy |
| `npm run verify:test` | Vitest ve Rust testleri |
| `npm run verify:build` | Vite ve Cargo derlemesi |
| `npm run test:e2e` | Debug Tauri uygulamasıyla WebdriverIO akışları |
| `npm run bench` | Rust ve Vitest performans ölçümleri |
| `npm run version:check` | Paket ve uygulama sürümlerini karşılaştırır |
| `npm run docs:screenshots` | Fixture kökünde belgeler için ekran görüntüleri |
| `npm run tauri build` | Platform kurulum paketleri |
| `npm run build:windows` | Windows kurulum paketlerini (.exe, .msi) ve özetlerini üretir |

## Kod düzeni ve testler

`src/app` ana kabuk; `src/features` kullanıcı özellikleri; `src/components` ortak bileşenler; `src/stores` Zustand durumları; `src/lib` IPC, tipler ve yardımcılar; `src/locales` çevirilerdir. `src-tauri/src/commands` IPC girişlerini, diğer Rust modülleri notlar, indeks, protokol, arama, çöp kutusu, dışa aktarma ve ayarları uygular. `e2e/` fixture ve WebdriverIO senaryolarını, `docs/` tasarım ve kullanım belgelerini içerir.

Ön yüzde iş mantığı için Vitest ve Testing Library testleri; Rust dosya işlemleri için geçici klasörlü birim testleri kullanılır. `verify:*` yerel temel denetimlerdir; `test:e2e` gerçek debug uygulamasında ayrı çalışır. Ekran görüntüsü spec'i yalnızca `docs:screenshots` ile çalışır, `test:e2e` kapsamına girmez.

## Platform ve sürüm akışı

Windows geliştirme ve E2E için birincil platformdur. Kodun diğer platformlarda derlenebilir kalması gerekir; platforma özgü işlevleri koşullu derleyin. CI doğrulamasından sonra `package.json`, Cargo ve Tauri sürümlerini eşitleyip `npm run version:check` çalıştırın. Üretilen Windows paketleri imzasızdır, SmartScreen uyarısı beklenir; NSIS kullanıcı kapsamında (`currentUser`) kurar, WebView2 yoksa bootstrapper indirir. `v*` etiketiyle tetiklenen [release iş akışı](../.github/workflows/release.yml) Windows, macOS ve Linux paketlerini **taslak** GitHub sürümüne ekler; yayımlama ayrı inceleme gerektirir.

## Katkı kuralları

Mimari kararların yetkili kaynağı [karar kaydıdır](decisions.md); arayüz dili (renk, tipografi, bileşenler) kökteki [`DESIGN.md`](../DESIGN.md) içindedir. Her değişiklik `NNNN-tür(kapsam)-kisa-aciklama` biçimli bir dalda yapılır (ör. `0150-fix(e2e)-harici-acmalari-engelle`), `verify:*` ve gerekiyorsa `test:e2e` yerelde geçtikten sonra PR ile birleştirilir. Commit mesajı İngilizce küçük harfli tür/kapsam ve Türkçe açıklama kullanır: `fix(editor): Kayıt sırasında bekleyen görsel değişikliğin kaybolması önlendi.`
