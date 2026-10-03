# HTNote - Mimari Karar Kaydı (Decision Log) 🧭

> **Bu doküman yetkili kaynaktır.** Diğer dokümanlarla (`architecture.md`, `data-structure.md`,
> `features.md`, `ui-ux-spec.md`, `roadmap.md`) çelişki olursa **bu dosyadaki karar geçerlidir.**
> Her karar kısa tutulur: *Karar* + gerekirse *Gerekçe* ve *Sonuç / Kural*.

---

## D01 — Hedef platform
- **Karar:** v1.0 geliştirme ve test ortamı **Windows**. Kod cross-platform yazılır; macOS/Linux build ve
  platforma özel davranışlar son fazda ele alınır.
- **Kural:** Yol birleştirmede her zaman `PathBuf`/`path.join` kullanılır; `\` veya `/` sabit yazılmaz.
  Windows'a özgü kod `#[cfg(windows)]` arkasında tutulur ve diğer platformlar için derlenebilir bir yedek sunulur.

## D02 — Teknoloji yığını (ekler dahil)
| Alan | Seçim |
|---|---|
| Masaüstü | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript (strict) + Vite |
| Stil | Tailwind CSS v4 (`dark` class stratejisi), `lucide-react` ikonlar |
| State | **Zustand** |
| Görsel editör | TipTap (güncel kararlı major) |
| Kod editörü | CodeMirror 6 (`lang-html`, `lang-css`, `lang-javascript`) |
| Sürükle-bırak (uygulama içi) | **@dnd-kit** (pointer tabanlı; bkz. D15) |
| i18n | **i18next + react-i18next** (TR/EN) |
| Rust crate'leri | `serde`, `serde_json`, `uuid`, `thiserror`, `notify` + `notify-debouncer-full`, `lol_html` (HTML head yeniden yazımı), `scraper` (düz metin çıkarma), `zip`, `base64`, `mime_guess`, `chrono`, `dirs`; dev: `tempfile` |
| Tauri eklentileri | `tauri-plugin-dialog`, `tauri-plugin-opener` |
| Windows PDF | `webview2-com` (WebView2 `PrintToPdf`) |
| Paket yöneticisi | npm |

## D03 — Depolama konumları
- Not kök dizini varsayılanı: `Documents/HTNote/` (ilk açılışta yoksa oluşturulur). Ayarlardan değiştirilebilir.
- **Uygulama ayarları not dizininde tutulmaz.** `settings.json` Tauri'nin app config dizinindedir
  (Windows: `%APPDATA%\com.htnote.app\settings.json`). Böylece kök dizin değiştirilebilir (tavuk-yumurta sorunu yok).
- Taslaklar (D11) app data dizininde tutulur: `%APPDATA%\com.htnote.app\drafts\<note-id>.json`.
- Kök dizinde `.config/` klasörü **yoktur** (`data-structure.md`'deki eski tasarım iptal).
- Depolama dizini değiştirildiğinde veriler taşınmaz; uygulama yeni dizini kullanmaya başlar (kullanıcı uyarılır).

## D04 — Not / klasör tespiti
- İçinde `metadata.json` bulunan dizin bir **nottur** ve ağaçta yapraktır. Notun alt dizinleri (ör. `assets/`) ağaçta gösterilmez.
- `metadata.json` içermeyen dizin bir **klasördür**.
- Adı `.` ile başlayan dizinler (`.trash`, `.git` vb.) taranmaz ve ağaçta gösterilmez.
- Kökteki veya klasörlerdeki serbest dosyalar (`.txt`, `.pdf`...) yok sayılır.
- `metadata.json` bozuksa (parse edilemiyorsa): not yine listelenir. Başlık klasör adından türetilir, yeni `id` üretilir
  ve bozuk dosya `metadata.json.bak` olarak yedeklendikten sonra onarılmış metadata diske yazılır.

## D05 — Başlık ↔ klasör adı
- **Klasör adı = başlığın dosya sistemi için güvenli hali** (`sanitize(title)`).
- `sanitize` kuralları: `< > : " / \ | ? *` ve kontrol karakterleri `-` ile değiştirilir; baştaki/sondaki boşluk ve nokta
  kırpılır; Windows'ta ayrılmış adlar (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`) sonuna `_` eklenerek çözülür;
  en fazla 120 karakter; boş sonuç `Adsız Not` olur.
- Aynı klasörde çakışma olursa ` (2)`, ` (3)` … eklenir.
- Görüntülenen başlığın kaynağı **`metadata.title`**'dır (sanitize edilmemiş, orijinal hali).
- Uygulama içinden yeniden adlandırmada klasör taşınır, `metadata.title` ve `<title>` güncellenir.
- Klasör **dışarıdan** (Explorer) yeniden adlandırılırsa ve `sanitize(metadata.title) != klasör adı` ise başlık klasör adına eşitlenir.
- Klasörler (not olmayan dizinler) için başlık doğrudan klasör adıdır.

## D06 — Not kimliği ve indeks
- `metadata.id` = UUID v4. Linkler ve sekmeler notu **id** ile tanır, yol ile değil.
- Rust tarafında bellek içi `NoteIndex` tutulur: `id → göreli yol`, `id → metadata`. Tarama (scan) ve watcher ile güncellenir.
- **Kopya id:** Explorer'dan kopyalanan bir not aynı id'yi taşır. Bu durumda indekste zaten kayıtlı olan yol id'yi korur,
  yeni bulunan kopyaya yeni id atanır ve diske yazılır.

## D07 — Notlar arası link formatı
- Format: **`htnote://note/<uuid>`**.
- Görüntüleme modunda hedef not yeni sekmede açılır (zaten açıksa o sekmeye geçilir) ve sol ağaçta seçilir.
- Hedef bulunamazsa "Not bulunamadı" bildirimi gösterilir.
- Linkler tarayıcıda (uygulama dışında) çalışmaz; bu kabul edilmiştir.

## D08 — Görüntüleme izolasyonu (güvenlik) ⚠️
- Notlar `127.0.0.1` üzerinde rastgele portta dinleyen HTTP sunucusundan sunulur.
  URL yapısı: `http://127.0.0.1:<port>/<note-id>/<dosya-yolu>`.
  Göreli `./assets/...`, `./style.css` ve `./script.js` yolları bu sayede doğal olarak çözülür.
- `srcdoc` **kullanılmaz** (göreli yollar çözülemez). `dangerouslySetInnerHTML` **asla** kullanılmaz.
- iframe: `sandbox="allow-scripts allow-forms allow-same-origin allow-modals"`. `allow-top-navigation*`, `allow-popups*`
  ve `allow-downloads` **verilmez**.
- Notlar ana uygulamadan (`tauri.localhost`) **farklı bir origin**'dedir. Bu nedenle `allow-same-origin` sandbox'ı delmez;
  not script'i `window.parent`'ın DOM'una veya `__TAURI__` / `__TAURI_INTERNALS__` nesnelerine erişemez.
- Tauri 2.12 kayıtlı özel URI şemalarını `Origin::Local` sayıp alt iframe'e IPC enjekte ettiği için önceki `htnote-note` tasarımı güvenli değildi. HTTP not origin'i `Origin::Remote` sayılır; capability uzak origin tanımlamaz.
- Ana uygulamanın CSP'si: `frame-src http://127.0.0.1:*` (diğer frame kaynakları kapalı).
- Üretim CSP'si: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: http://127.0.0.1:*; media-src 'self' data: blob: http://127.0.0.1:*; frame-src http://127.0.0.1:*; connect-src ipc: http://ipc.localhost`.
  Tauri'nin stil nonce/hash eklemesi `unsafe-inline` ihtiyacını geçersiz kılmasın diye yalnızca `style-src` için asset CSP değişikliği kapatılır.
  Ayrı `devCsp`, Vite'nin `http://localhost:1420` ve `ws://localhost:1420` HMR bağlantısına, geliştirme script'leri için `unsafe-eval` kullanımına izin verir.
  `freezePrototype` şimdilik `false` tutulur; TipTap/CodeMirror eklendiğinde uyumluluk testiyle yeniden değerlendirilir.
- HTTP sunucusu yalnızca loopback'e bağlanır ve `Host` başlığı dinlenen `127.0.0.1:<port>` ile tam eşleşmedikçe 403 döndürür. Yalnızca indeksteki bir notun dizini altındaki dosyalar sunulur (canonicalize + prefix
  kontrolü, `..` reddi). Bilinmeyen id için 404. Audio/video seek için **HTTP Range** desteklenir. MIME `mime_guess` ile belirlenir.
- **Bilinen kabul:** Loopback portuna diğer yerel süreçler ve tarayıcı sayfaları erişebilir; rastgele port, tam Host denetimi ve tahmin edilemez UUID v4 not kimlikleri kullanılır. Tüm notlar aynı origin'i paylaşır. Bir notun script'i başka bir notun dosyalarını `fetch` edebilir
  ve `localStorage`'ı paylaşır. Bridge, anahtar çakışmasını önlemek için `window.htnote.noteId` değerini sunar.
- Canlı önizleme (taslak): `http://127.0.0.1:<port>/<note-id>/__draft/<rev>/index.html`. `__draft/<rev>/` altındaki
  `index.html`, `style.css` ve `script.js` bellekteki taslaktan, diğer her şey (assets) diskten sunulur. `rev` cache kırmak içindir.

## D09 — Bridge (köprü) script'i ve postMessage protokolü
- Protokol handler, HTML yanıtlarının `<head>` başına `<script src="/__htnote/bridge.js"></script>` enjekte eder
  (disk üzerindeki dosya değişmez; enjeksiyon yalnızca uygulama içi sunumda yapılır).
- **iframe → host** mesajları:
  | type | payload | Anlam |
  |---|---|---|
  | `HTNOTE_READY` | `{ noteId }` | Bridge yüklendi |
  | `HTNOTE_OPEN_NOTE` | `{ id }` | `htnote://note/<id>` linki tıklandı |
  | `HTNOTE_OPEN_EXTERNAL` | `{ url }` | `http(s):`/`mailto:` linki tıklandı → sistem tarayıcısında açılır |
  | `HTNOTE_OPEN_ASSET` | `{ relPath }` | Notun `assets/` eki → kayıtlı frame'in not kimliğiyle Rust'ta yol ve uzantı denetlenir, sistem uygulamasında açılır |
  | `HTNOTE_SHORTCUT` | `{ key, ctrl, shift, alt, meta }` | Uygulama kısayolu iframe odaktayken basıldı (D16) |
- **host → iframe** mesajları:
  | type | payload | Anlam |
  |---|---|---|
  | `HTNOTE_THEME` | `{ vars: Record<string,string>, mode, audioLabels }` | `--ht-*` CSS değişkenlerini ve host i18n kaynaklı ses oynatıcı etiketlerini uygular |
  | `HTNOTE_HIGHLIGHT` | `{ query }` | Metni işaretler ve ilk eşleşmeye kaydırır |
- Host yalnızca `event.source === iframe.contentWindow` **ve** `event.origin` protokol origin'i olan mesajları işler.
  Payload'lar doğrulanır; tanınmayan `type` yok sayılır.
- Diğer tüm linkler (`javascript:`, `file:` vb.) engellenir.

## D10 — Editör modeli (TipTap ↔ serbest HTML)
- Yeni notların `index.html`'i içeriği `<main id="htnote-content">…</main>` içinde tutar.
- **Görsel editör (TipTap) yalnızca `main#htnote-content`'in içini düzenler.** `<head>`, `main` dışındaki body
  içeriği, `style.css` ve `script.js` görsel editörde hiç dokunulmadan korunur.
- İçerik TipTap'e verilmeden önce `main`'in **üst seviye çocukları** tek tek incelenir. TipTap şemasının kayıpsız
  temsil edemeyeceği bir çocuk (kendisi veya bir alt öğesi desteklenmeyen etiket ya da öznitelik içeriyorsa: `script`,
  `style`, `canvas`, `iframe`, `svg`, `div`, `form`, `input` vb.) **`htmlBlock` atom node'u**na dönüştürülür. Bu node ham
  `outerHTML`'i birebir saklar. Editörde "HTML Bloğu" etiketli, salt okunur bir kod önizlemesi olarak görünür ve
  kod modunda düzenlenir.
- Desteklenen öğelerde `class`, `id`, `style` ve `data-*` öznitelikleri korunur (global attribute extension).
- `main#htnote-content` yoksa (ör. kullanıcı kod modunda sildiyse) görsel editör devre dışı kalır ve bir açıklama
  gösterilir. Kod modu her zaman kullanılabilir.
- **Kod modu:** HTML sekmesi tam `index.html`'i, CSS sekmesi `style.css`'i, JS sekmesi `script.js`'i düzenler.
- Kayıt sırasında CSS/JS içeriği boşsa ilgili dosya silinir ve `hasCustomCss/hasCustomJs` alanı `false` olur. Dosya
  doluysa `index.html` içindeki `<link href="./style.css">` / `<script src="./script.js">` etiketleri Rust tarafında
  garanti edilir, boşsa kaldırılır.
- `<head>` senkronizasyonu (`<title>`, `meta[name^=htnote-]`) **Rust tarafında** `lol_html` ile yapılır. Metadata dışındaki
  head içeriğine dokunulmaz. `<head>` yoksa oluşturulur.

## D11 — Kaydetme modeli
- **Manuel kayıt:** `Ctrl+S` veya "Kaydet". Kaydedilmemiş sekmede `•` göstergesi.
- Yazımlar atomiktir: önce geçici dosyaya yazılır, sonra rename yapılır.
- **Taslak kurtarma:** Kaydedilmemiş değişiklik olan her sekme için 5 sn debounce ile app data `drafts/<id>.json`'a
  taslak yazılır. Kayıt ve iptalde silinir. Uygulama açılışında veya not açılırken, notun `updatedAt`'inden yeni bir
  taslak varsa "Kurtar / Yok say" diyaloğu gösterilir.
- Kaydedilmemiş sekme veya uygulama kapatılırken **Kaydet / Kaydetme / İptal** diyaloğu gösterilir.
- **Favori ve etiket değişiklikleri düzenleme modunu gerektirmez.** `update_metadata` ile anında kaydedilir.

## D12 — Dosya izleyici
- `notify-debouncer-full`, 250 ms, kök dizinde recursive çalışır. Değişiklikte `NoteIndex` ve arama indeksi güncellenir,
  ardından frontend'e `fs-change` event'i gönderilir (payload: etkilenen göreli yollar ve id'ler).
- Başlangıçta tam tarama yapılır. Olaylarda etkilenen alt ağaç yeniden taranır; belirsiz durumda tam taramaya düşülür.
- Uygulamanın kendi yazımları da event üretir. Açık notta "dış değişiklik" tespiti için son kaydedilen içerik hash'i
  tutulur. Diskteki hash farklıysa değişiklik dıştandır.
- Dış değişiklik: sekme temizse sessizce yeniden yüklenir. Sekme kirliyse "Dosya dışarıda değişti" uyarısı gösterilir
  (Diskten yükle / Benimkini koru).

## D13 — Tam metin arama
- Bellek içi indeks: her not için `{ id, title, tags, text }`. `text`, `index.html`'den `script`/`style` hariç düz metin
  olarak çıkarılır.
- Normalizasyon: **Türkçe kurallı küçük harf** (`İ→i`, `I→ı`) + boşluk sadeleştirme. Eşleşme substring'tir.
- Sıralama: önce başlık eşleşmeleri, sonra içerikteki eşleşme sayısına göre. En fazla 100 sonuç. Snippet eşleşmenin ±60 karakteri.
- Watcher ile artımlı güncellenir.

## D14 — Frontend mimarisi
- Zustand store'ları: `settingsStore`, `treeStore`, `tabsStore` (sekme + belge durumu), `uiStore` (modal, toast, sidebar).
- **IPC yalnızca `src/lib/ipc.ts` içindeki tipli sarmalayıcılar üzerinden çağrılır.** Bileşenler `invoke`'u doğrudan çağırmaz.
- Rust ↔ TS tipleri elle eşlenir ve `src/lib/types.ts`'de tutulur. Serde `rename_all = "camelCase"` kullanılır.
- Klasör yapısı (öneri): `src/app`, `src/features/<özellik>/`, `src/components/ui`, `src/lib`, `src/stores`, `src/locales`.
  Rust: `src-tauri/src/{commands,notes,index,watcher,protocol,search,trash,export,settings,error}.rs|/`.

## D15 — Sürükle-bırak
- Tauri'de `dragDropEnabled: true` iken Windows'ta HTML5 sürükle-bırak olayları güvenilir değildir ve dışarıdan
  bırakılan dosyaların yolu HTML5 ile alınamaz. Bu nedenle:
  - Ağaç ve sekme sıralaması: **@dnd-kit** (pointer olayları).
  - İşletim sisteminden bırakılan dosyalar: Tauri `onDragDropEvent` (yol + pozisyon) kullanılır. Hedef bölge, pozisyon ile hit-test edilerek bulunur.
- `react-arborist` kullanılmaz (react-dnd HTML5 backend'ine bağımlı).
- Görsel editörde Tauri enter/over konumu fiziksel pikselden CSS pikseline çevrilir; `posAtCoords`
  hem 2px accent bırakma imlecini hem ekleme konumunu belirler. Leave, drop ve editör kaldırıldığında imleç temizlenir.
- Medya blokları kendi genişliği kadar yer kaplar; metin sarma kullanılmaz. Sol/orta/sağ hizalama
  `data-align` ve taşınabilir inline CSS ile kaydedilir; görüntüleme ve dışa aktarmada bridge gerekmez.
  Genişlik yüzdeleri dış medya sarmalayıcısına uygulanır; araçlar yalnız seçili medyada görünür.
  SVG asset'leri loopback sunucusundan `image/svg+xml` olarak ve editörde yalnız `<img>` ile gösterilir.
- Medyanın görsel sınırları dışındaki satır tıklaması `mousedown` aşamasında yakalanır ve varsayılan
  tarayıcı seçimi engellenir; imleç komşu metne veya medya önündeki/arkasındaki gapcursor konumuna yerleşir.
  `handleClick` aşaması (`mouseup`) bunun için geçtir; WebView2 en yakın atomik medyayı seçebilir.
  E2E kontrolü gerçek WebDriver pointer eylemleriyle basma/bırakma konumlarını ve buraya yazmayı doğrular.

## D16 — Klavye kısayolları (güncellenmiş)
| Kısayol | İşlem |
|---|---|
| `Ctrl+N` | Yeni not |
| `Ctrl+Shift+N` | Yeni klasör |
| `Ctrl+S` | Kaydet |
| `Ctrl+E` | Görüntüle / Düzenle |
| `Ctrl+Shift+F` | Genel arama |
| `Ctrl+W` | Sekmeyi kapat |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Sonraki / önceki sekme (macOS'ta da Ctrl; Cmd+Tab işletim sistemine ait) |
| **`Ctrl+\`** | Sidebar gizle/göster (**`Ctrl+B` editörde kalın için ayrılmıştır**) |
| `Escape` | Modal kapat |
- macOS'ta `Ctrl` yerine `Cmd` kullanılır (Tab geçişi hariç).
- Uygulama kısayolları TipTap ve CodeMirror'dan **önce** yakalanır. iframe odaktayken bridge bu kısayolları `HTNOTE_SHORTCUT` ile iletir.
- Kısayollar tek bir merkezi registry'de tanımlanır.

## D17 — Uluslararasılaştırma
- `src/locales/tr.json` ve `src/locales/en.json`. Tüm UI metinleri `t()` üzerinden alınır, kodda sabit metin bulunmaz.
- Dil seçimi: önce ayar, yoksa sistem dili (`tr*` → tr, diğerleri → en).
- Rust hata **metin** değil **kod** döndürür (D18). Metne çevirme frontend'de yapılır.

## D18 — Hata sözleşmesi
- Rust komutları `Result<T, AppError>` döndürür. `AppError` `{ code: string, message: string }` olarak serileşir
  (ör. `NOTE_NOT_FOUND`, `NAME_CONFLICT`, `INVALID_NAME`, `IO_ERROR`, `PATH_OUTSIDE_ROOT`).
- Frontend `code`'u i18n anahtarına (`errors.<CODE>`) eşleyip toast gösterir. `message` yalnızca log/ayrıntı içindir.

## D19 — Dışa aktarma
- **Tek HTML:** `style.css` `<style>`, `script.js` `<script>` olarak gömülür. `src`/`href`/CSS `url()` içindeki göreli asset
  yolları Base64 data URI'ye çevrilir. Bridge dahil edilmez. 20 MB üzeri çıktıda kullanıcı uyarılır.
- **ZIP:** Not klasörünün tamamı.
- Video boyut sınırları, `nodownload`, video bağlam menüsü engeli ve özel ses oynatıcı yalnızca uygulama içi çalışma anında uygulanır; kayıtlı HTML değişmez. Tek HTML ve ZIP dışa aktarımları bridge içermez, native medya kontrollerini korur.
- **PDF (Windows):** Gizli bir WebView penceresi notu protokol URL'sinden yükler. `load` + 500 ms beklendikten sonra WebView2
  `PrintToPdf` ile A4 ve arka plan dahil PDF üretilir. Diğer platformlarda ileride `window.print()` yedeği kullanılacak.
- Hedef dosya `tauri-plugin-dialog` kaydetme diyaloğuyla seçilir.

## D20 — Test stratejisi (testleri agent'lar yazar)
- **Rust:** `cargo test` (birim testleri ve `tempfile` ile gerçek dosya sisteminde entegrasyon testleri). Dosya işlemleri,
  sanitize, head senkronizasyonu, indeks, arama, çöp kutusu ve export mutlaka test edilir.
- **Frontend:** Vitest + Testing Library + jsdom; IPC `@tauri-apps/api/mocks` (`mockIPC`) ile taklit edilir. Store'lar,
  içerik bölgesi ayrıştırıcısı, TipTap round-trip ve kısayol registry'si mutlaka test edilir.
- **E2E:** WebdriverIO + `tauri-driver` (Windows, msedgedriver). Güvenlik izolasyonu testleri ve smoke senaryoları.
  `npm run test:e2e` ile çalışır. orch'un görev başı doğrulamasına **dahil değildir** (yavaş). CI'da ve faz sonlarında çalışır.
- **Uygulamayı çalıştırarak doğrulama:** Agent'lar ve otomasyon `tauri dev`'i **kullanmaz** (süresiz çalışır).
  Bunun yerine `npm run smoke:app` kullanılır: debug build alır, uygulamayı başlatır, ana pencerenin açıldığını
  doğrular, kısa süre kararlılığını izler ve uygulamayı kendisi kapatır (süre sınırlı, çıkış kodu 0/1).
- `kind: UI` görevlerde orch politikası gereği test yazılmaz. Mantık bu yüzden UI'dan ayrı, test edilebilir modüllerde tutulur.

## D21 — Doğrulama komutları (orch `commands.json`)
| Adım | Komut | İçerik |
|---|---|---|
| analyze | `npm run verify:analyze` | `eslint .` + `tsc --noEmit` + `cargo clippy --all-targets -- -D warnings` |
| test | `npm run verify:test` | `vitest run` + `cargo test` |
| build | `npm run verify:build` | `vite build` + `cargo build` |

## D22 — Git, CI ve planlama dosyaları
- Repo GitHub'da tutulur. orch `GITHUB` modunda issue, branch, PR ve merge akışını yönetir.
- `tasks/` **gitignore**'dadır (yerel planlama; orch temiz worktree ister).
- CI: GitHub Actions, `windows-latest`, **yalnızca `main`'e push'ta** ve `workflow_dispatch` ile çalışır. Adımlar:
  `verify:analyze` + `verify:test` + `verify:build`; `test:e2e` ayrı bir job'da çalışır. Rust cache ve
  `concurrency: cancel-in-progress` kullanılır. (Public repo ücretsizdir. Private repoda aylık 2000 dk vardır ve
  Windows dakikaları ×2 sayılır.)

## D23 — Çöp kutusu
- Silme: öğe `.trash/<ad>__<yyyyMMdd-HHmmss>/` altına taşınır ve içine `.htnote-trash.json` yazılır:
  `{ originalRelPath, deletedAt, kind: "note"|"folder", title }`.
- Geri yükleme: orijinal üst klasörler yoksa yeniden oluşturulur. İsim çakışırsa ` (2)` eklenir. Manifest silinir.
- Kalıcı silme ve "Çöpü boşalt" onay diyaloğu ister.
- Silinen notun sekmeleri kapatılır. Sekme kirliyse önce onay alınır.
- Klasör silindiğinde içindeki tüm notlar tek bir çöp öğesi olarak taşınır.

## D24 — v1.0 kapsamına eklenen özellikler
- **Favoriler** bölümü (sidebar'da ağacın üstünde).
- **Etiket düzenleme** (görüntüleme araç çubuğunda, anında kayıt).
- **Etikete göre filtre** (sidebar'da etiket listesi).
- **Geri bağlantılar (backlinks):** Rust, notlardaki `htnote://note/<id>` linklerinden bir link indeksi tutar ve
  görüntüleyicide "Bu nota bağlanan notlar" paneli gösterilir.

## D25 — İlk çalıştırma
- Kök dizin boşsa, uygulamanın özelliklerini (iç link, interaktif JS, tema değişkenleri) tanıtan bir **"HTNote'a Hoş Geldiniz"** notu oluşturulur.

## D26 — Bilinçli olarak kapsam dışı (v1.0)
- Bulut senkronizasyonu, çoklu pencere, not versiyon geçmişi, kullanılmayan asset temizliği, şablonlar, eklenti sistemi,
  mobil sürüm.

## D27 — Etiket renkleri ve taşınabilir not görünümü
- **Karar:** Etiket renkleri `settings.json` içindeki geriye uyumlu `tagColors` haritasında, mevcut `normalizeText` etiket eşleştirmesine göre saklanır; değerler dokuz semantik palet adından biridir. D03 gereği kökte ortak yapılandırma klasörü yoktur; `.trash` ve geçici onboarding işareti bu amaç için uygun değildir. Renk bütün notlardaki aynı etikete uygulanır; tek HTML/ZIP not dışa aktarımına uygulama ayarları eklenmez.
- **Kural:** Son etiket kullanımı silindiğinde eşleme temizlenir. Son kullanımın bire bir ad değişiminde, hedefte renk yoksa renk yeni ada taşınır; diğer notların kullandığı adın rengi korunur.
- **Karar:** Not arka planı `<body data-ht-bg="sepia|mint|rose|sky|lavender|charcoal">` ve `style#htnote-appearance` içinde saklanır. Açık/koyu paletler uygulama token'larından alınır ve HTML'e gömülür. Uygulamada `html[data-ht-theme]`, dışa aktarımda `prefers-color-scheme` varyantı seçer. Varsayılan seçim bu özniteliği ve yönetilen stili kaldırır.
- **Kural:** Varsayılan not zemini/metni `--app-surface` / `--app-text` ile aynıdır; bridge düşük özgüllükte `:where(html)` kullanır. Yazar CSS'i kazanır. Görsel editör yüzeyi aynı preset token'larını kullanır. Görünüm düzenleme modunda taslak değişikliğidir; okuma modunda mevcut hash denetimli `save_note` hattında anında kaydedilir. Hata durumunda taslak korunur.
- **Karar:** Yazı rengi TipTap TextStyle + Color ile `span[style]` içinde korunur. Hazır renkler `--ht-color-*` değişkenlerini taşınabilir renk yedeğiyle kullanır; özel renk sabit hex'tir. Görsel/kod geçişlerinde renk ve diğer span öznitelikleri korunur; kayıpsız temsil edilemeyen iç içe span'ler ham HTML olarak kalır.

## D28 — Testlerde işletim sistemi açılışları
- **Karar:** URL, asset açma ve klasörde gösterme işlemleri yalnızca Rust `external` modülünden geçer. Ön yüz tipli IPC sarmalayıcıları kullanır; doğrudan opener capability izinleri verilmez. Rust da yalnızca açık `http://`, `https://` ve `mailto:` URL şemalarını kabul eder.
- **Kural:** Yalnızca debug derlemelerinde dolu `HTNOTE_EXTERNAL_OPEN_LOG` dosya yolu, gerçek açılış yerine `{ "kind": "url"|"path"|"reveal", "target": "…" }` JSONL kaydı üretir. Yazma hatası OS açılışına geri düşmez. Release derlemelerinde bu kayıt yolu derlenmez ve ortam değişkeni etkisizdir.
- **Sonuç:** E2E, doküman ekran görüntüleri ve smoke başlatıcıları geçici kayıt yolu sağlar. E2E kayıtları `e2e/logs/external-open.jsonl` konumuna kopyalanır; kayıt doğrulaması uygulamanın sürücü ortamını devraldığını kanıtlar. D08 iframe sandbox/origin/ACL sınırları korunur; yeni komutlar da not ve taslak çerçevelerinden reddedilir.
