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
| Stil | Tailwind CSS v4 (`dark` class stratejisi), `lucide-react` ikonlar, paketlenmiş değişken Plus Jakarta Sans (latin + latin-ext) |
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
- **Kural (widget):** D30 üst seviye metin kutusu biçimi yalnız izinli preset değerli tek isteğe bağlı `data-htnote-bg` özniteliğini de kabul eder. Bilinmeyen/boş değer, yinelenen veya ek öznitelikler kayıpsız `htmlBlock` kalır.
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
- **İlk tarama arka plandadır:** pencere ve açılış ekranı taramayı beklemez. Sıra: watcher kurulur ve olayları
  biriktirir → kök taranır → arama indeksi başlatılır → indeks hazır işaretlenir; biriken olaylar ancak sonra dolu
  indekse uygulanır (tarama sırasındaki değişiklik kaybolmaz, eski tarama sonucu yeninin üstüne yazılmaz). İndekse
  bağlı komutlar ve not sunucusu hazır olmayı ana iş parçacığı dışında bekler; senkron komutlar beklemez. Tarama
  başarısızsa indeks boş kalır ve uygulama yine açılır. Açılış ekranı ilk not ağacı yüklenene kadar kalır.
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
- **Karar:** Not arka planı `<body data-ht-bg="sepia|mint|rose|sky|lavender|charcoal">` ve `style#htnote-appearance` içinde saklanır. Açık/koyu paletler uygulama token'larından alınır ve HTML'e gömülür. Uygulamada `html[data-ht-theme]`, dışa aktarımda `prefers-color-scheme` varyantı seçer. Varsayılan seçim bu özniteliği kaldırır; yönetilen stil yalnız preset arka planlı widget da yoksa kaldırılır. Widget preset’leri aynı açık/koyu `--app-note-*` paletini kullanır ve gövde preset’i olmasa da `htnote-appearance` içine gömülür.
- **Kural:** Varsayılan not zemini/metni `--app-surface` / `--app-text` ile aynıdır; bridge düşük özgüllükte `:where(html)` kullanır ve not fontunu da varsayılan olarak uygular. Yazar CSS'i kazanır; dışa aktarım bridge içermediğinden tarayıcı varsayılan fontunu kullanır. Görsel editör yüzeyi aynı preset token'larını kullanır. Görünüm düzenleme modunda taslak değişikliğidir; okuma modunda mevcut hash denetimli `save_note` hattında anında kaydedilir. Hata durumunda taslak korunur.
- **Karar:** Yazı rengi TipTap TextStyle + Color ile `span[style]` içinde korunur. Hazır renkler `--ht-color-*` değişkenlerini taşınabilir renk yedeğiyle kullanır; özel renk sabit hex'tir. Görsel/kod geçişlerinde renk ve diğer span öznitelikleri korunur; kayıpsız temsil edilemeyen iç içe span'ler ham HTML olarak kalır.

## D28 — Testlerde işletim sistemi açılışları
- **Kural:** Yalnızca Windows debug derlemelerinde dolu `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`, wry varsayılanlarıyla başlangıçta tek kez birleştirilip süreçteki tüm WebView2 ortamlarına (`main` ve `pdf-export-*` dahil) aynı değerle açıkça aktarılır; tekrarlanan enable/disable feature listeleri tek bayrakta birleştirilir. Aynı kullanıcı veri klasörünü paylaşan ortamların `AdditionalBrowserArguments` değerleri farklıysa WebView2 `0x8007139F` hatası verir. Pencere yapılandırması ve capabilities korunur; PDF penceresinin izin listesi boş kalır. Diğer platformlar ve release davranışı/komut satırı bu değişiklikten etkilenmez. wry sürümü değiştiğinde debug birleştiricinin varsayılanları kaynak kodla karşılaştırılır.
- **Karar:** URL, asset açma ve klasörde gösterme işlemleri yalnızca Rust `external` modülünden geçer. Ön yüz tipli IPC sarmalayıcıları kullanır; doğrudan opener capability izinleri verilmez. Rust da yalnızca açık `http://`, `https://` ve `mailto:` URL şemalarını kabul eder.
- **Kural:** Yalnızca debug derlemelerinde dolu `HTNOTE_EXTERNAL_OPEN_LOG` dosya yolu, gerçek açılış yerine `{ "kind": "url"|"path"|"reveal", "target": "…" }` JSONL kaydı üretir. Yazma hatası OS açılışına geri düşmez. Release derlemelerinde bu kayıt yolu derlenmez ve ortam değişkeni etkisizdir.
- **Sonuç:** E2E, doküman ekran görüntüleri ve smoke başlatıcıları geçici kayıt yolu sağlar. E2E kayıtları `e2e/logs/external-open.jsonl` konumuna kopyalanır; kayıt doğrulaması uygulamanın sürücü ortamını devraldığını kanıtlar. D08 iframe sandbox/origin/ACL sınırları korunur; yeni komutlar da not ve taslak çerçevelerinden reddedilir.

## D29 — Canlı Kartlar arayüz dili ve özel başlık çubuğu
- **Karar:** Canlı Kartlar arayüz dili kökteki `DESIGN.md` belgesinde tanımlanır; UI ile çelişirse görsel tasarımda `DESIGN.md` esas alınır. Sistem başlık çubuğu yerine özel başlık çubuğu kullanılır.
- **Kural:** Windows'ta pencere düğmeleri sağ üstte, sekmeler başlık çubuğundadır. Plus Jakarta Sans değişken fontu Türkçe karakterler dahil uygulamayla paketlenir; font CDN'i kullanılmaz.
- **Kural (platform):** Windows ve Linux'ta ana pencere `decorations: false` (Windows'ta `shadow: true` ile gölge, yuvarlak köşe ve kenarlardan yeniden boyutlandırma) kullanır; Küçült, Ekranı kapla/Önceki boyuta getir ve Kapat düğmelerini uygulama çizer. macOS'ta `tauri.macos.conf.json` sistem trafik ışıklarını korur (`titleBarStyle: "Overlay"`, `hiddenTitle: true`); kendi pencere düğmelerimiz gizlenir. Platform ön yüzde yalnızca `src/lib/platform.ts` ile tespit edilir; kısayol ipuçları da buna göre `Ctrl` veya `⌘` gösterir. Minimum pencere 900×600'dür.
- **Kural (davranış):** Yalnızca başlık çubuğunun boş alanları `data-tauri-drag-region` taşır; sekmeler ve düğmeler sürükleme alanı değildir; arama kenar çubuğu düğmesi veya kısayolla açılır. Kapat düğmesi `close()` çağırır, `destroy()` çağırmaz; böylece kaydedilmemiş değişiklik koruması (`onCloseRequested`) Alt+F4 ile aynı yoldan çalışır. Büyütülmüş durum pencere boyut olaylarından izlenir ve düğme simgesi/etiketi güncellenir.
- **Kural (izinler):** Yalnızca `main` capability'sine `core:window:allow-close`, `allow-minimize`, `allow-toggle-maximize` ve `allow-start-dragging` eklenir; `is-maximized` ve `internal-toggle-maximize` zaten `core:default` içindedir. Not iframe'leri (uzak origin) ve `pdf-export-*` pencereleri bu izinleri almaz.
- **Kural (Snap Layouts):** Windows 11 snap düzeni menüsü için `#[cfg(windows)]` arkasında `snap_layouts.rs`, ana pencereye "Ekranı kapla" düğmesinin tam üzerinde duran, boyama yapmayan aynı süreçte bir alt pencere ekler. WebView2'nin başka süreçteki alt pencereleri istemci alanında isabet testini kazandığı için üst pencerenin `WM_NCHITTEST` yanıtı tek başına yeterli değildir; katman `HTMAXBUTTON` döndürür, tıklamada üst pencereye `SC_MAXIMIZE`/`SC_RESTORE` gönderir ve hover/basılı durumunu `titlebar:maximize-state` olayıyla ön yüze bildirir. Katman Tauri'nin kenar boyutlandırma penceresinin altında, WebView'in üstünde tutulur; `WM_SIZE`/`WM_DPICHANGED` ile 46×48 CSS px geometrisine (`--app-caption-button-width`, `--app-titlebar-height`) göre yeniden konumlanır. Yeni bağımlılık eklenmez; diğer platformlarda katman derlenmez. Klavye ve WebDriver tıklamaları HTML düğmesindeki `toggleMaximize()` yolunu kullanır. Win+Z her durumda çalışır.
- **Sonuç:** Renk, tipografi, yüzey ve kart düzeni ortak token'larla uygulanır; mevcut güvenlik ve not görünümü sınırları korunur. Minimum genişlik 900px olduğundan dar snap bölgeleri (ör. üçte bir) küçük ekranlarda pencereyi sığdıramayabilir. Geometri sabitleri CSS ile Rust arasında elle eşitlenir.

## D30 — Metin kutusu widget'ı
- **Karar:** Sürüm 1 biçimi `<div class="htnote-textbox" data-htnote-widget="textbox"><div class="htnote-textbox-title">Başlık</div><textarea class="htnote-textbox-input" spellcheck="false" rows="3">içerik</textarea></div>` olur. Boş başlık öğesi de daima yazılır. Metin HTML olarak kaçırılır; ilk LF, HTML’in ilk satır sonunu atlamasına karşı bir ek LF ve sayısal entity ile, CR ise sayısal entity ile korunur. Kökte isteğe bağlı `data-htnote-bg="sepia|mint|rose|sky|lavender|charcoal"` desteklenir; varsayılanda öznitelik yazılmaz ve mevcut v1 notları değişmez. Diğer yeni sürüm/öznitelikler ayrı tanıma kuralı gerektirir.
- **Kural (D10):** Yalnız bu üst seviye biçim (iki öğe, yalnız belirtilen öznitelikler, düz başlık/içerik, tam kapanışlar) `textBox` olarak tanınır. Sapmalar, fazladan öğeler/öznitelikler ve onarılmış HTML kayıpsız `htmlBlock` kalır. Değiştirilmemiş kutunun özgün kaynak HTML'i birebir korunur. Geçici `htnote-textbox-node` taşıyıcısı yalnız editör boru hattında kullanılır ve kayıtta taşınabilir biçime açılır.
- **Karar (D11):** Tiptap atom node'u başlık/içerik/arka plan öznitelikleri ve gerçek React input/textarea kontrolleri kullanır. `stopEvent` ve `ignoreMutation` yerel yazımı ProseMirror DOM işlemlerinden ayırır. Her değişiklik öznitelik transaction'ı oluşturur; mevcut dirty/taslak/kayıt hattına katılır. Ctrl+Z/ileri al node geçmişini, Ctrl+S mevcut uygulama kısayolunu kullanır; biçim kısayolları alana uygulanmaz. Başlıkta Enter içeriğe geçer; içerik sınırında oklarla komşu paragrafa çıkılır. Son kutunun arkasında boş paragraf bulunur. Seçim tutamağı blok seçimine/sürüklemeye izin verir.
- **Karar (D08/D09):** Görüntüleme kontrolleri yalnız `bridge.js` tarafından iframe DOM'una eklenir. Başlık salt okunur, textarea değişiklikleri geçicidir; sıfırlama `value = defaultValue` kullanır. `HTNOTE_THEME.labels` içindeki `copy`, `copied`, `copyFailed`, `reset` host i18n kaynaklarından alınır. Mesaj türleri, host doğrulaması, sandbox ve izinler değişmez; widget JS'i ana origin'de çalışmaz.
- **Kural:** Kullanıcı tıklamasında iframe `navigator.clipboard.writeText` denenir; başarısızsa textarea seçimiyle `execCommand("copy")` yedeği kullanılır, önceki odak/seçim/kaydırma geri yüklenir. Sonuç 1,5 saniye gösterilir. MutationObserver sonradan eklenen kutuları da geliştirir.
- **Kural:** Bridge temel görünümü düşük özgüllüklü `:where(...)` ve widget’a özel `--ht-widget-*` token’larıyla uygular; yazar CSS'i önceliklidir. Alan tam genişlikte, en az üç satır ve `field-sizing: content` ile büyür; destek yoksa scrollHeight yedeği vardır. Yazdırma/PDF düğmeleri gizler, geçici pre aynasında tam güncel metni kaydırmasız gösterir. HTML/ZIP dışa aktarımı bridge içermez; preset’li widget için D27 yönetilen stili kart/alan temel görünümünü ve açık/koyu arka plan paletini taşır.

## D31 — Ortak widget altyapısı
- **Karar:** `widgets/widgetBackground.ts` not preset listesini paylaşan saf doğrulama/serileştirme modülüdür. Widget kökünde `data-htnote-bg` kullanılır; gövdenin `data-ht-bg` özniteliğinden bağımsızdır. Varsayılan özniteliksizdir. Değiştirilmemiş metin kutusunun kaynak HTML’i birebir korunur.
- **Kural:** Yeni widget’lar ortak `WidgetHeader` bileşenini kullanır: küçük ikon, host i18n tür etiketi, `WidgetBackgroundButton` / `ColorPicker` ve klavyeyle kullanılabilen seçim tutamağı; seçim Tiptap öznitelik transaction’ı üzerinden dirty/taslak/geri al hattına girer. “Widget ekle” menüsüne ekleme tek kayıt dizisiyle yapılır; mevcut klavye menüsü ve araç çubuğu taşması paylaşılır.
- **Karar:** `getNoteThemeVars` mevcut `HTNOTE_THEME.vars` içinde `--ht-widget-*` ve `--ht-note-*` token’larını iletir. Bridge ortak `:where([data-htnote-widget][data-htnote-bg="..."])` kurallarını güvenli açık/koyu yedeklerle uygular. Notun genel `--ht-accent` değeri ve D08/D09 güvenlik sınırı değişmez. D27 stili görsel düzenleme sırasında senkronlanır; gövde veya widget preset’i yoksa gereksiz stil eklenmez.
- **Kural:** Kartlar 12px köşeli, düzenlenebilir içerik alanları içe gömük yüzeyli ve 1px görünür sınırlıdır; başlık görüntüleme/dışa aktarımda zeminsiz ve kenarlıksız kalın metin, editörde hover zemini ve odak halkası olan kenarlıksız input’tur; odak ve kopyalandı geri bildirimi proje indigo’sudur. Açık sınır `#7b8598`, koyu sınır `#78849b`; mevcut kart/alan/preset komşuluklarında en az 3:1 kontrast sağlar. Yazdırma ve geçici görüntüleme içeriği kuralları D30’da kalır.

- **Kural (ortak başlık satırı):** Bridge `createWidgetHeader` ile ikon (createElementNS SVG), tür etiketi ve eylemleri tek satırda ekler; etiket `HTNOTE_THEME.labels.textboxType` ile host i18n’den gelir, yalnız string ve ≤200 karakter kabul edilir, textContent kullanılır. Tekrarlanan geliştirmede satır çoğalmaz; dışa aktarılan HTML’de tür etiketi bulunmaz. Menü kayıtları isteğe bağlı `ContextMenu.icon` kullanır. Arka plan örneği seçili renkle dolu, varsayılanda boş daire ve her temada görünür 1px sınırlıdır. İç ayırıcı token’ı `--ht-widget-divider` açık `#e0e3ee`, koyu `#303647` değerlerini taşır.

## D32 — Kontrol listesi widget'ı
- **Karar:** Sürüm 1 biçimi `div.htnote-checklist[data-htnote-widget="checklist"]`, ilk çocuk `div.htnote-checklist-title`, ardından `ul.htnote-checklist-items` içinde `li > label > input[type="checkbox"]` ve bir boşlukla ayrılmış düz madde metnidir. `checked` kayıtlı varsayılanı, isteğe bağlı `data-htnote-bg` ortak preset'i taşır. Boş liste kabul edilir; madde metni HTML olarak kaçırılır ve satır sonu içermez.
- **Kural (D10/D11):** Tam biçim ve kapanışlar doğrulanır; sapmalar kayıpsız htmlBlock kalır, değişmemiş kaynak birebir korunur. Atom node başlık ve `{ text, checked }[]` özniteliklerini gerçek kontrollerle düzenler; madde alanları tek satır mantığında, `rows=1` ve `field-sizing: content` ile sarılarak genişleyen textarea'lardır (ortak scrollHeight yedeği). Enter satır ekler, Shift+Enter satır sonu eklemez, boş Backspace siler, oklar satırlar arasında ve widget sınırından paragrafa geçer; çok satırlı yapıştırma maddelere bölünür. Öznitelik transaction'ları taslak, kayıt ve geri alma hattını kullanır.
- **Karar (D08/D09):** Bridge işaretlemeleri geçicidir; sıfırlama `defaultChecked` değerlerine döner. Sessiz sayaç ve erişilebilir ilerleme çubuğu güncellenir; kalan maddeler satır satır kopyalanır. Ortak pano yardımcısı clipboard/execCommand yedeğiyle odak, seçim ve kaydırmayı korur; geri bildirim 1,5 saniyedir. Etiketler yalnız doğrulanmış host i18n mesajından gelir; yeni mesaj veya izin yoktur. MutationObserver yeni widget'ları geliştirir. Yazdırmada eylemler gizlenir, liste tam görünür; bridgesiz dışa aktarım yerel onay kutularını korur.

## D33 — Kopyalanabilir alanlar widget'ı
- **Karar:** Sürüm 1 biçimi `div.htnote-copyfields[data-htnote-widget="copyfields"] > div.htnote-copyfields-title + dl.htnote-copyfields-list`, satırlar `div.htnote-copyfields-row > dt + dd` olur. Başlık boşken de yazılır; boş liste, etiket ve değer kabul edilir. Etiket/değer tek satırdır; yapıştırılmış satır sonları boşluğa çevrilir, metin HTML olarak kaçırılır. Ortak preset arka plan desteklenir.
- **Kural (D10/D11):** Kontrol listesiyle paylaşılan katı biçim doğrulaması tam kapanışları ve yalnız izinli öznitelikleri kabul eder; sapmalar kayıpsız htmlBlock kalır. Değişmemiş kaynak birebir korunur. Atom node sarılan, `rows=1` ve `field-sizing: content` ile genişleyen tek satır mantığında etiket/değer textarea'ları, Enter/Backspace/ok gezinmesi, ortak başlık ve seçim tutamağı kullanır; değişiklikler transaction/taslak/kayıt/geri alma hattındadır.
- **Karar (D08/D09):** Bridge değerleri seçilebilir monospace metin olarak gösterir; ikon düğmesi ve çift tıklama aynı ortak pano/geri bildirim yardımcısını kullanır. Satır geri bildirimi 1,5 saniye sürer; kayıtlı dt/dd değişmez. Tümünü kopyala yalnız dolu değerleri `Etiket: değer` (boş etikette yalnız değer) biçiminde birleştirir. Boş etikette erişilebilir ad değer kısaltması veya satır numarasıdır. Etiketler doğrulanmış host i18n mesajından gelir; yeni mesaj/izin yoktur. MutationObserver yeni widget ve satırları geliştirir. Yazdırmada eylemler gizlenir; bridgesiz HTML/ZIP dışa aktarımında varsayılan arka planda da kalın etiket ve monospace, sarılan değer stili taşınır.

## D34 — Widget boş yazım satırları
- **Karar (D10/D11):** Yalnız değişmiş widget için üretilen yeni HTML'de, kırpılmış etiket ve değeri boş kopyalanabilir alan satırları ile kırpılmış metni boş kontrol maddeleri atılır. Diğer metinlerin boşlukları korunur; değişmemiş özgün HTML boş satırlarıyla birlikte birebir kalır. Editör yazım satırlarını serileştirme sırasında silmez; kaydedilmiş boş listeyi özniteliklerini değiştirmeden bir boş yazım satırıyla gösterir.
- **Kural (D08/D09):** Bridge dış HTML'deki boş değerlerde satır kopyalama eylemini göstermez, tümünü kopyalamaya bu değerleri katmaz. Boş kontrol maddeleri gizlenir ve sayaç, ilerleme, sıfırlama ve kalanları kopyalama işlemlerinden çıkarılır; içerik dolunca MutationObserver görünümü yeniden geliştirir. Kayıt biçimi, ortak pano yardımcısı ve güvenlik sınırı korunur.

## D35 — Şablon doldurucu widget'ı
- **Karar (D10/D11):** Sürüm 1 biçimi `div.htnote-template[data-htnote-widget="template"] > div.htnote-template-title + textarea.htnote-template-source[spellcheck="false"][rows="3"]` olur; ortak preset isteğe bağlıdır. Metin kutusuyla ortak katı tanıma/kaçırma ve ilk satır sonu koruması kullanılır. Sapmalar kayıpsız htmlBlock kalır; değişmemiş kaynak birebir korunur. Atom node ortak textarea editörü, başlık, çipler, öznitelik transaction'ları ve klavye geçmişi/gezinmesi kullanır.
- **Karar:** Saf ayrıştırıcı `src/bridge/templateEngine.js` klasik script'inde tek kaynaktır; TS yan etki içe aktarımı ve tip bildirimiyle, Rust `concat!(include_str!(...), ...)` ile aynı dosyayı kullanır. Adlar kırpılır, 1–40 Unicode karakter ve en fazla 30 benzersiz değişken kabul edilir; küçük harfe dönüştürülerek eşleştirilir, ilk yazım ve ilk açık varsayılan korunur. Hatalı/fazla değişkenler düz metindir; dinamik kod çalıştırma yoktur.
- **Kural (D08/D09):** Bridge yalnız etiketli tek satır girdiler, metin düğümleri ve span'lardan önizleme üretir. Girdiler geçicidir; sıfırlama varsayılanlara döner, düz metin kopyalamada boş değişken boş dizedir. Ortak başlık/pano/etiket doğrulaması ve MutationObserver kullanılır; mesajlar/izinler değişmez. Kaynak yalnız bridge ile gizlenir; HTML/ZIP'te okunur textarea kalır. Yazdırmada yalnız tam önizleme metni görünür.

## D36 — Hesap defteri widget'ı ve motor izolasyonu
- **Karar (D10/D11):** Sürüm 1 biçimi `div.htnote-calc[data-htnote-widget="calc"] > div.htnote-calc-title + textarea.htnote-calc-input[spellcheck="false"][rows="3"]` olur. Metin kutusu ve şablonla katı tanıma, kaçırma, ilk satır sonu koruması, ortak textarea atom editörü ve öznitelik transaction'ları paylaşılır. Sapmalar kayıpsız htmlBlock kalır, değişmemiş kaynak birebir korunur; arka plan ve ikonlu başlık ortaktır.
- **Karar:** `src/bridge/calcEngine.js` tek saf özyinelemeli iniş değerlendiricisidir; TS ve Rust aynı klasik script'i kullanır. Öncelik üs (sağa birleşir), tekli işaret, çarpma/bölme, toplama/çıkarma olur. Yalnız doğrudan `A ± %n` artış/azalıştır; diğer yüzde bağlamları kesirdir. Toplam adıyla etiketlenen veya toplam/total kullanan satırlar toplama yeniden katılmaz; önceki/prev son başarılı sonuçtur (başlangıçta sıfır). Hatalı satır değişkenleri ve toplamı değiştirmez. Dil tr/en, bilinmeyen dil tr; gösterim en fazla altı ondalık ve para sembolsüzdür.
- **Kural:** En fazla 500 satır, satır başına 500 karakter, iç içe 64 işlem kabul edilir. Aşırı satır/kaynak bütünü reddedilir, kısmi toplam gösterilmez; aşırı uzun/derin tek satır hata olup sonraki satırlar çalışır. Yanlış binlik gruplama tek ayırıcıysa ondalık kabul edilir, birden fazla veya karışık hatalı ayırıcı reddedilir.
- **Kural (D08/D09):** Bridge başlangıcında şablon ve hesap motorlarını yerel referanslara alır ve iframe global adlarını siler; not JS'inin sonradan bu adları değiştirmesi widget'ları etkilemez. Editör global motorları korunur. Host yalnız doğrulanmış etiket ve tr/en dilini mevcut tema mesajıyla iletir; yeni mesaj/izin yoktur. Görüntüleme yazımları geçicidir, sıfırlama defaultValue'ya döner, ortak pano yardımcısı biçimlendirilmiş toplamı kopyalar. Yazdırmada eylemler gizlenir, tam güncel ifadeler ve sonuçlar görünür; bridgesiz dışa aktarım okunur textarea taşır.

## D37 — Serbest pano
- **Blok taşıma (3, D15):** Blok doc veya boardCell'in doğrudan çocuğudur; tek delege RAF hover ve ortak GripVertical kullanır, widget kendi başlık tutamağını aynı pointer capture mekanizmasına bağlar. Widget/medya/ham HTML için HTML5 draggable kapalıdır; OS dosya ve kod bırakma hattı değişmez. Sürüklemede transaction yoktur; küçük tür/içerik çipi, geçici kaynak opaklığı, otomatik kaydırma ve kaydırma alanına kırpılan accent göstergeler kullanılır. Escape/pointercancel iptal eder; bırakma tek transaction/geri alma adımıdır, değişmeyen konum işlem üretmez.
- **Hedefler:** Doc/hücre blokları arasında yatay çizgi; üst seviye pano olmayan bloğun kenarında yan yana iki hücreli `1 6 1`/`7 6 1` pano; hücre bloğunun kenarında boş aralık veya hedef genişliği bölünerek komşu hücre; boş ızgarada en fazla altı sütunlu hayalet hücre. 48 hücre sınırı ve iç içe pano yasağı hedefte de uygulanır; pano bloğu yalnız üst seviye aralara taşınır. Panodan çıkan bloğun kaynak hücresi boşsa kaldırılır ve satırlar sıkıştırılır; son boş hücreyle pano da kalkar, tek blok kalan hücre korunur. Alt+Shift+↑/↓ kapsayıcı içinde taşır, hücre sınırında panonun hemen üstüne/altına çıkar.
- **Fare (2a, D15):** Tek paylaşılan katmandaki grip ve iki kenar tutamağı pointer capture kullanır; hover tek delege, hareketler RAF ile kısılır. Izgara başlangıçta ölçülüp önbelleklenir, kaydırmada yeniden ölçülür. Taşıma transform, boyutlandırma grid stilleri ve çakışma çözümü yalnız canlı önizlemedir; araya/sona satır eklenebilir. Bırakma ortak komutla tek transaction/geri alma adımıdır; değişmeyen konum transaction üretmez, Escape/pointercancel tüm stilleri geri alır. Pano dışına taşıma hücreyi çıkarmaz. Dar widget alanları kapsayıcıya uyar; 360px altındaki hesap ifadeleri sarılır ve sonuçlar alt sıraya geçer; kayıt biçimi değişmez.
- **Biçim (v1):** `div.htnote-board[data-htnote-layout="board"]` içinde yalnız `div.htnote-board-cell[data-htnote-cell="col span row"]`; 12 sütun, sütun/genişlik 1–12, sağ sınır ≤12, satır 1–100, en fazla 48 hücre. Her iki öğenin inline CSS’i kanoniktir ve bridge/yönetilen stil olmadan yerleşim sağlar. Boş hücre `<p></p>` içerir. Hücreler kayıt/DOM’da `(satır, sütun)` sırasındadır; satırlar 1’den başlayıp boşluksuzdur ve aralıklar çakışmaz.
- **Katı tanıma (D10/D30):** Ek/bilinmeyen öznitelik, yanlış sınıf veya kanonik olmayan stil, eksik kapanış, hücreler arasında boşluk dışı içerik, geçersiz/çakışan/sırasız hücre ve iç içe pano dış bloğun tamamını kayıpsız `htmlBlock` yapar. Hücre içi rich, medya, tüm widget ve ham HTML aynı özyinelemeli boru hattını kullanır; değişmemiş widget kaynağı birebir korunur. İç içe pano editörde de yasaktır. Hücre widget ile bitebilir; altındaki boş paragraf Backspace ile silinince widget seçilir. Seçili widget'ta Enter paragraf açar; oklar ve hücrenin alt boşluğuna tıklama gapcursor üzerinden yazmayı sağlar. İlk blok başındaki Backspace hücreyi korur; ilk boş paragrafın arkasında başka blok varsa paragraf silinip sonraki blok seçilir. Belge sonundaki pano/widget için D30 paragraf kuralı sürer.
- **Komutlar:** Eklemede `1 7 1` ve `8 5 1`; ortak hücre araçlarında ekle/kaldır/çöz ve `Ctrl+Alt+L` (macOS `Cmd+Alt+L`) ile yerleşim kipi. Oklar taşır, Shift+yatay ok sağ kenarı değiştirir, Enter/Escape içerik imlecine döner. Çakışmada etkin hücre kalır, diğerleri deterministik olarak aşağı itilir; boş satırlar sıkıştırılır ve DOM yeniden sıralanır. Kaldırma/çözme içeriği korur; her komut/tuş tek transaction ve tek geri alma adımıdır.
- **Görüntüleme (D08/D09/D27):** Bridge’e yalnız düşük özgüllüklü CSS eklenir; 560px altında ekran media query’si inline `display` değerini gerekçeli `!important` ile ezer, yazdırmada grid korunur. Editör container query kullanır. Yeni mesaj, izin, sandbox veya yönetilen görünüm stili yoktur; mevcut belge genelindeki widget geliştirmesi hücrelerde çalışır.
- **Performans (1–5):** (1) Pano/hücre React NodeView değildir; hücre yalnız değişen style/öznitelikleri güncelleyen vanilla NodeView’dur; hücre başına kök/gözlemci/dinleyici yoktur. Araçlar/çerçeve/aria-live tek ortak React bileşenidir; widget girdilerinin odağı/kısayolu editör düzeyindeki iki ortak dinleyiciyle izlenir. (2) Sıra değişmediğinde yalnız değişen hücrelere `setNodeMarkup`; ölçümler RAF içinde önce okunup sonra yazılır, yalnız etkin hücre/yerleşim değişimi veya kaydırma/yeniden boyutlandırmada konumlanır. (3) Saf yerleşim mantığı sabit 12 sütun bit maskeleri, sınırlı satır araması ve O(n log n) sıralama kullanır; 48’de ekleme kapanır. (4) `onUpdate` yalnız bekleyen değişiklik bayrağı/zamanlayıcı kurar; `getHTML()` ortak `flush` içinde alınır; kayıt, kod modu, NodeView, kapanış ve taslak aynı hattı kullanır. (5) Görüntülemede pano JS’i, gözlemci veya ölçümü yoktur.

## D38 — Otomatik kaydetme
- **Karar:** `settings.json` içindeki `autoSave` varsayılan olarak açıktır; alanı olmayan eski ayarlar da açık gelir. Ayarlardaki Açık/Kapalı seçimi anında uygulanır.
- **Kural:** Yalnız düzenleme modundaki kirli sekmeler son değişiklikten yaklaşık 2 sn sonra Ctrl+S ile aynı `saveTab` hattından diske kaydedilir; görsel editörün bekleyen içeriği D37 ortak `flush` ile alınır. Düzenleme modu korunur, mevcut kayıt durumu güncellenir.
- **Kural:** Aynı sekmede eşzamanlı kayıt başlatılmaz; başarılı kayıt sırasında yeni düzenleme varsa kayıt bitince zamanlayıcı yeniden kurulur. Temizlenen, kapatılan veya düzenlemesi iptal edilen sekmenin zamanlayıcısı kaldırılır; ayar kapalıyken zamanlayıcı kurulmaz.
- **Kural:** Dış değişiklik/hash çakışması üzerine yazılmaz; mevcut çakışma akışı çözülene kadar otomatik kayıt durur. Hata taslağı korur ve yeni değişiklik gelene kadar yeniden denenmez.
- **Sonuç:** D11 kurtarma taslakları ve kaydedilmemiş değişiklikler için okuma/kapanış uyarı akışı sürer.
