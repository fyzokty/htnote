# HTNote — Canlı Kartlar tasarım dili

Bu belge HTNote arayüzünün görsel spesifikasyonudur. Arayüzle çeliştiğinde bu belge esas alınır; davranış, veri modeli ve güvenlik sınırları mimari karar kaydına tabidir. Renklerin uygulamadaki tek kaynağı `src/index.css` içindeki `--app-*` token'larıdır. Özel başlık çubuğu ve aşağıda tanımlanan bileşen düzenleri sonraki uygulama adımları için hedeftir; ilk temel aşamasında mevcut bileşen düzenleri korunur.

## 1. Kimlik ve ilkeler

Canlı Kartlar aydınlık, dingin bir çalışma alanıdır: lavantadan naneye hafifçe geçen zemin üzerinde yüzen kartlar, temiz tipografi ve kontrollü indigo vurgu. Koyu tema aynı hiyerarşiyi koyu indigo ve arduvaz yüzeylerle sürdürür. Windows 11 yerel hissi; ölçülü cam etkisi, yuvarlak köşeler, belirgin klavye odağı ve sağ üstte pencere düğmeleriyle kurulur. İkonlar lucide-react'ten gelir.

Not içeriği kabuğun parçası değildir. Kullanıcının HTML/CSS'i, içeriğindeki başlıklar, tablolar, callout'lar ve renkler uygulama tarafından yeniden tasarlanmaz. Uygulama yalnızca kartı, araçları ve varsayılan görünüm köprüsünü sağlar. Mevcut hızlı filtre, sürükle-bırak, bağlam menüleri, geri bağlantılar, dışa aktarma ve sekme işlemleri korunur. Kullanıcıya görünen metinler Türkçe ve İngilizce i18n kaynaklarından gelir.

## 2. Renk token'ları

### Açık tema

| Token | Hex | Rol |
|---|---|---|
| `--app-bg` | `#f8f9ff` | Düz zemin yedeği |
| `--app-gradient-start` | `#eeedff` | Zemin gradyanı: lavanta |
| `--app-gradient-end` | `#eaf6f0` | Zemin gradyanı: nane |
| `--app-surface-light`, `--app-surface` | `#f8f9ff` | İç yüzey ve varsayılan not zemini |
| `--app-card` | `#ffffff` | Opak çalışma alanı kartı |
| `--app-sidebar-glass` | `#ffffffd9` | Cam kenar çubuğu yüzeyi |
| `--app-card-border` | `#e0e3ee` | Dekoratif kart sınırı |
| `--app-text-light`, `--app-text` | `#0d1c2e` | Ana metin |
| `--app-muted` | `#464554` | İkincil metin |
| `--app-border` | `#c7c4d7` | Ayırıcı ve kontrol sınırı |
| `--app-subtle` | `#eff4ff` | İkincil yüzey |
| `--app-hover` | `#e6eeff` | Nötr hover |
| `--app-active`, `--app-selected` | `#e1e0ff` | Basılı / seçili satır |
| `--app-accent` | `#4648d4` | Birincil indigo |
| `--app-accent-hover` | `#393bb8` | Birincil hover |
| `--app-accent-active` | `#2f2ebe` | Birincil basılı |
| `--app-accent-text` | `#ffffff` | Birincil düğme metni |
| `--app-success` | `#006c49` | Başarı |
| `--app-warning` | `#825100` | Uyarı |
| `--app-danger` | `#ba1a1a` | Tehlike |
| `--app-danger-hover` | `#93000a` | Tehlike hover |
| `--app-danger-text` | `#ffffff` | Tehlike düğme metni |
| `--app-focus` | `#4648d4` | Odak halkası |
| `--app-backdrop` | `#00000080` | Modal örtüsü; pencere gradyanı değildir |
| `--app-shadow` | `#00000026` | Mevcut bileşen gölge rengi |
| `--app-code-html` | `#c2410c` | HTML dosya vurgusu |
| `--app-code-css` | `#2563eb` | CSS dosya vurgusu |
| `--app-code-js` | `#a16207` | JS dosya vurgusu |
| `--app-scrollbar-light`, `--app-scrollbar` | `#c1c6d0` | Kaydırma tutamağı |
| `--app-scrollbar-hover-light`, `--app-scrollbar-hover` | `#8b93a2` | Kaydırma hover |

### Koyu tema

Tema mevcut `.dark` sınıf stratejisiyle seçilir. Açık/koyu not yüzeyi ve metin değerleri her iki temada da erişilebilir sabitlerdir; etkin `--app-surface` ve `--app-text` bunlara başvurur.

| Token | Hex | Rol |
|---|---|---|
| `--app-bg` | `#0d1220` | Düz zemin yedeği |
| `--app-gradient-start` | `#17162e` | Koyu indigo gradyan başlangıcı |
| `--app-gradient-end` | `#0d2023` | Koyu arduvaz gradyan sonu |
| `--app-surface-dark`, `--app-surface` | `#101623` | İç yüzey ve varsayılan not zemini |
| `--app-card` | `#101623` | Opak çalışma alanı kartı |
| `--app-sidebar-glass` | `#101623e6` | Cam kenar çubuğu yüzeyi |
| `--app-card-border` | `#303647` | Dekoratif kart sınırı |
| `--app-text-dark`, `--app-text` | `#f1f5f9` | Ana metin |
| `--app-muted` | `#a8b6cc` | İkincil metin |
| `--app-border` | `#414b60` | Ayırıcı ve kontrol sınırı |
| `--app-subtle` | `#182131` | İkincil yüzey |
| `--app-hover` | `#222c40` | Nötr hover |
| `--app-active`, `--app-selected` | `#27274a` | Basılı / seçili satır |
| `--app-accent` | `#a5a6ff` | Küçük metinde de okunabilen indigo |
| `--app-accent-hover` | `#c0c1ff` | Birincil hover |
| `--app-accent-active` | `#e1e0ff` | Birincil basılı |
| `--app-accent-text` | `#07006c` | Birincil düğme metni |
| `--app-success` | `#6ffbbe` | Başarı |
| `--app-warning` | `#ffb95f` | Uyarı |
| `--app-danger` | `#fb929e` | Tehlike |
| `--app-danger-hover` | `#ffb3bc` | Tehlike hover |
| `--app-danger-text` | `#4a0010` | Tehlike düğme metni |
| `--app-focus` | `#a5a6ff` | Odak halkası |
| `--app-backdrop` | `#00000099` | Modal örtüsü |
| `--app-shadow` | `#00000040` | Mevcut bileşen gölge rengi |
| `--app-code-html` | `#fb923c` | HTML dosya vurgusu |
| `--app-code-css` | `#60a5fa` | CSS dosya vurgusu |
| `--app-code-js` | `#facc15` | JS dosya vurgusu |
| `--app-scrollbar-dark`, `--app-scrollbar` | `#48566b` | Kaydırma tutamağı |
| `--app-scrollbar-hover-dark`, `--app-scrollbar-hover` | `#718198` | Kaydırma hover |

`--app-window-gradient`, `linear-gradient(135deg, var(--app-gradient-start), var(--app-gradient-end))` değerindedir. Kart gölgelerinin tam değerleri şekil ve derinlik bölümündedir. Renkler bileşenlerde sabit hex ile tekrar edilmez.

### Etiket renk noktaları ve not görünüm paletleri

Mevcut dokuz semantik renk adı korunur. Renk noktası tek başına anlam taşımaz; yanında etiket adı ve kullanım sayısı bulunur. Bu renkler taşınabilir yazı rengi paletinin de kaynağıdır.

| Token | Açık hex | Koyu hex |
|---|---|---|
| `--app-color-gray` | `#4c586b` | `#b3bece` |
| `--app-color-red` | `#b02d3c` | `#fb929e` |
| `--app-color-orange` | `#984512` | `#f6b078` |
| `--app-color-yellow` | `#78560c` | `#e8cc72` |
| `--app-color-green` | `#206b3e` | `#86d3a0` |
| `--app-color-teal` | `#126767` | `#74ceca` |
| `--app-color-blue` | `#2859aa` | `#91bafa` |
| `--app-color-purple` | `#7142a3` | `#c2a0f0` |
| `--app-color-pink` | `#a02d70` | `#f09ec9` |

| Etkin token | Açık sabit token / hex | Koyu sabit token / hex |
|---|---|---|
| `--app-note-sepia` | `--app-note-sepia-light`: `#faf3e5` | `--app-note-sepia-dark`: `#302b23` |
| `--app-note-mint` | `--app-note-mint-light`: `#eaf5ee` | `--app-note-mint-dark`: `#23352b` |
| `--app-note-rose` | `--app-note-rose-light`: `#faedf1` | `--app-note-rose-dark`: `#35252d` |
| `--app-note-sky` | `--app-note-sky-light`: `#edf4fc` | `--app-note-sky-dark`: `#243043` |
| `--app-note-lavender` | `--app-note-lavender-light`: `#f2eefb` | `--app-note-lavender-dark`: `#2e2940` |
| `--app-note-charcoal` | `--app-note-charcoal-light`: `#e9edf2` | `--app-note-charcoal-dark`: `#171d25` |

D27 ilişkisi korunur: varsayılan not zemini `--app-surface`, metni `--app-text` olur. Bridge, `:where(html)` ile düşük özgüllükte uygular; yazar CSS'i kazanır. Not görünümü seçimleri uygulama gradyanından bağımsızdır, taşınabilir açık/koyu sabitler HTML'e gömülür. Kabuk fontu not iframe'ine zorlanmaz.

## 3. Tipografi

Arayüz fontu paketlenmiş, değişken **Plus Jakarta Sans** (200–800 ağırlık aralığı) olur; paketteki CSS aile adı `"Plus Jakarta Sans Variable"` olarak kullanılır. Latin ve Türkçe karakterleri içeren latin-ext alt kümeleri yerel font dosyaları olarak dağıtılır; CDN ve çalışma anında font indirme yoktur. Yedek yığın: `"Segoe UI Variable", "Segoe UI", system-ui, sans-serif`. Kod mevcut `ui-monospace, SFMono-Regular, Consolas, monospace` yığınını, 13px / 1.6 satır yüksekliğini korur.

| Ölçek | Boyut (px) | Satır yüksekliği (px) | Ağırlık | Harf aralığı |
|---|---:|---:|---:|---|
| display | 40 | 48 | 700 | -0.03em |
| headline-lg | 30 | 38 | 600 | -0.025em |
| headline-md | 24 | 32 | 600 | -0.02em |
| headline-sm | 20 | 28 | 600 | -0.015em |
| title | 18 | 26 | 600 | -0.01em |
| body-lg | 16 | 26 | 400 | -0.005em |
| body-md | 14 | 22 | 400 | 0 |
| body-sm | 12 | 18 | 400 | 0.005em |
| label-lg | 14 | 20 | 600 | 0.01em |
| label-md | 12 | 16 | 600 | 0.02em |
| label-sm | 11 | 14 | 700 | 0.04em |

Bu ölçek kabuğa aittir; kullanıcı notunun display başlığı uygulama tarafından üretilmez. Büyük başlıklar ayarlar ve boş durumlarda kullanılabilir. Bölüm etiketlerinde label-sm, durum çubuğunda body-sm tercih edilir.

## 4. Şekil ve derinlik

| Token / ölçü | Değer | Kullanım |
|---|---|---|
| `--app-radius-control` | 8px | Düğme, alan, ağaç satırı |
| `--app-radius-card` | 16px | Ana kartlar; iç kartlar 12–16px |
| `--app-radius-pill` | 9999px | Etiket, kısayol ve durum pill'leri |
| `--app-shadow-card` (açık) | `0 10px 25px -4px #4755690f, 0 4px 10px -2px #6366f10a` | Hafif kart ayrımı |
| `--app-shadow-card` (koyu) | `0 10px 25px -4px #00000040, 0 4px 10px -2px #00000026` | Hafif kart ayrımı |

Gölge görsel hiyerarşiyi destekler; kalın veya renkli glow kullanılmaz. Cam/mica benzeri yüzey yalnız kabukta, özellikle kenar çubuğunda 12px backdrop-blur ile kullanılır; işletim sisteminin gerçek Mica API'sine bağlı değildir. Çalışma kartı opaktır. Bulanıklık desteği yoksa opak `--app-card` kullanılır. `prefers-reduced-transparency: reduce` ve kökte `data-reduced-transparency="true"` olduğunda cam opaklaşır, backdrop-filter kapanır; ikinci yol düşük güç ortamı için açık bir entegrasyon noktasıdır, otomatik güç algılama veya yeni kullanıcı ayarı değildir.

## 5. Yerleşim

Ölçüler 4/8px ızgaraya oturur. Hedef özel başlık çubuğu 48px, alt durum çubuğu 32px yüksekliğindedir. Kenar çubuğu varsayılan 260px; mevcut 200–480px yeniden boyutlandırma aralığı korunur. Kart iç boşlukları 16–20px, yoğun araç satırlarında 8–12px; ana kartların kenarlara uzaklığı ve aralarındaki boşluk 8px olur. Not başlık satırı en az 64px yüksekliğinde, gerektiğinde erişilebilir satırlara sarılır.

İlk temel aşamasında mevcut 40px sekme şeridi çalışma kartının dışında kalır; kenar çubuğunun mevcut iç başlığı korunur. Özel başlık çubuğuna taşıma ayrı bir adımdır. Çalışma alanı, not başlık satırı, içerik ve mevcut durum çubuğunu tek yuvarlak kartta taşır. Kenar çubuğu kartı kendi iç kaydırma alanlarını korur; tutamak kartlar arasındaki boşlukta erişilebilir kalır. Kenar çubuğu gizlenince çalışma alanı boşluğu doldurur, saklanan genişlik geri açılışta korunur.

Minimum pencere **900×600**'dür. Bu ölçüde kart boşluğu korunur; çalışma alanı `min-width: 0` ve `min-height: 0` ile kalan alanı kullanır. Uzun sekmeler yatay kayar, uzun başlıklar kısalır ve tam ad tooltip/erişilebilir adla sunulur. Araçlar içerik üzerine taşmaz; dar alanlarda satır sarma veya mevcut taşma menüsü kullanılır. Not, ağaç, ayarlar ve arama sonuçları kendi alanlarında kayar; pencere bütünü kaydırılmaz. Kod/önizleme bölücüsü mevcut sınırları korur; kenar çubuğunu gizleme ve önizlemeyi kapatma daha fazla alan sağlar.

## 6. Bileşenler

- **Başlık çubuğu, sekmeler ve pencere düğmeleri:** Sistem başlık çubuğu yerine özel çubuk kullanılır. Windows'ta küçült/büyüt veya geri yükle/kapat sağ üsttedir. Sekmeler başlık çubuğundadır; seçili sekme kart/pill yüzeyiyle ayrılır. Sekme kapatma ve bağlam menüsü korunur. Sürükleme alanı etkileşimli düğmelerle çakışmaz; native pencere davranışının ayrıntıları özel başlık çubuğu adımında kesinleşir.
- **Kenar çubuğu:** Üstte HTNote kimliği, birincil indigo “Yeni not” düğmesi ve Ctrl+N rozeti; altında ikincil klasör ve arama düğmeleri. Hızlı filtre korunur. FAVORİLER/KLASÖRLER/ETİKETLER bölüm etiketleri küçük ve düzenlidir. Ağaç satırlarında girinti, açma oku, ikon, ad ve mevcut eylemler; seçili satırda `--app-selected` kullanılır. Etiket satırında dokuz renk paletinden nokta, etiket adı ve sağda sayaç vardır. Alt menüde Çöp Kutusu ve Ayarlar bulunur; mevcut işlevler korunur.
- **Not başlık satırı:** Solda klasör/not breadcrumb'ı ve son kaydedilme zamanı; yanında etiket pill'leri. Sağda favori yıldızı, “Dışa aktar” menüsü ve birincil “Düzenle” + Ctrl+E. Uzun içerik, eylemleri ekran dışına itmez. Not başlığı yeniden adlandırma, etiket düzenleme ve tüm dışa aktarma seçenekleri korunur.
- **Düzenleme oturumu:** Başlık düzeninde “Kaydedilmedi” uyarı pill'i, Görsel | Kod segmentli kontrolü, “İptal” ve birincil “Kaydet” + Ctrl+S bulunur. Okuma eylemleriyle gereksiz kalabalık oluşturulmaz. Kayıt, iptal, taslak kurtarma ve dış değişiklik akışları aynı kalır.
- **Yüzen biçimlendirme araç çubuğu:** Görsel editör içinde 12px köşeli küçük yüzey; paragraf, metin biçimi, liste, alıntı, kod, tablo, medya, bağlantı ve renk araçları mevcut işlevleriyle sürer. İçerik kayarken erişilebilir kalır; not HTML'ine kaydedilmez. Araç grupları ince ayırıcılarla ayrılır.
- **Kod modu:** index.html, style.css ve script.js dosya sekmeleri monospace etiketler ve semantik dosya renkleri kullanır. Yanındaki canlı önizleme kartı ayrı başlık ve mevcut kontrollerle sunulur; bölücü sürükleme davranışı korunur. Önizleme sandbox'lı not iframe'i olarak kalır.
- **Arama diyaloğu:** Ortalanmış 12–16px köşeli kart, en fazla 800px ve pencere kenarlarından en az 16px boşluk. Başlık, büyük arama alanı, kaydırılabilir sonuçlar ve klavye ipuçları. Seçili sonuç indigo seçili yüzey, başlık, yol ve snippet taşır; eşleşmeler belirginleştirilir. Ctrl+K hedef ipucu olarak kullanılır; kısayol değişikliği merkezi registry ve bridge ile birlikte ilgili adımda yapılır. R1 mevcut kısayolu değiştirmez.
- **Ayarlar kartları:** Depolama, Görünüm ve Hakkında grupları, 12–16px köşeli opak kartlarda. Etiket ve açıklama solda, kontrol sağda; dar alanda alt satıra geçer. Mevcut seçenekler, sürüm bilgisi ve bağlantılar korunur; sürüm ayrı bir rozet haline getirilmez.
- **Durum çubuğu:** Kartın altında solda “Diske kaydedildi” / “Kaydedilmedi”, UTF-8 ve HTML; sağda kelime ve karakter sayısı. Küçük metin, ince üst ayırıcı; durum yalnız renk ile anlatılmaz.
- **Kısayol rozeti (`kbd`):** 4px iç boşluk, 8px veya pill köşe; nötr düğmede ikincil yüzey, birincil düğmede kontrastı koruyan vurgu yüzeyi. Windows biçimi Ctrl+N, Ctrl+K, Ctrl+E, Ctrl+S, Ctrl+,; macOS'ta platforma göre ⌘ gösterilir. İpucu gerçek registry eylemiyle eşleşir.
- **Bağlam menüsü:** Opak kart, 8–12px köşe, hafif gölge; ikon, etiket ve varsa kısayol. Silme gibi tehlikeli eylemler semantik tehlike rengi kullanır. Sekme, ağaç, etiket ve not menüleri korunur.
- **Diyalog:** Modal örtüsü üzerinde opak kart; anlamlı başlık, açıklama ve hizalı eylemler. Başlangıç odağı, odak tuzağı, Escape ve tetikleyiciye odak iadesi korunur. Kaydet/Kaydetme/İptal ayrı ve açık eylemlerdir.
- **Toast:** Kabuk üzerinde içerik ve eylemleri kapatmayacak konumda küçük opak kart. Başarı/uyarı/tehlike ikon ve metinle belirtilir; erişilebilir canlı bölge ve mevcut kapanma davranışı korunur.

Ortak Button, IconButton, Tooltip, SegmentedControl, ContextMenu ve ConfirmDialog primitifleri kullanılır; genişletmeler geriye uyumlu olur. İkon-only düğmelerde aria-label ve tooltip bulunur.

## 7. Etkileşim ve hareket

Nötr hover `--app-hover`, basılı durum `--app-active`; birincil hover ve basılı durum kendi accent token'larını kullanır. Seçili durum hover'dan ayrılır, aria-selected/aria-pressed ile bildirilir. `:focus-visible` 2px `--app-focus` halkası ve 2px dış boşluk kullanır; kırpılan alanlarda halka içeri alınır. Disabled öğeler eylem almaz, uygun HTML/ARIA durumu ve 0.45 opaklıkla gösterilir.

Renk, kenarlık ve gölge geçişleri 120–200ms ease-out; varsayılan 150ms. İçerik geçişleri yaklaşık 160ms, dikkat dağıtan sürekli animasyon yoktur. `prefers-reduced-motion: reduce` altında animasyon ve geçişler kapatılır, kaydırma anlık olur. Yeniden boyutlandırma anlık izlenir; hareket efektleri not iframe'inin yerleşimini veya odağı bozmaz.

## 8. Kullanılmayacaklar

Aşağıdaki dekoratif/uydurma arayüz öğeleri eklenmez:

- “5 gün kaldı”, “görev tamamlandı”, “dk okuma” satırı.
- “aktif” rozeti, sürüm rozeti ve kullanıcı avatarı.
- “Varsayılana dön” ve “Senkronize edildi”.
- Başlık çubuğundaki yıldız ve ⋮ menüsü; notun kendi favori yıldızı ve mevcut bağlam menüleri korunur.
- “Uygulama / Ayarlar” breadcrumb'ı.

Kullanıcının kendi not içeriğindeki benzer ifadeler veya tablolar bu yasağın konusu değildir. Harici font/ikon CDN'i ve notun HTML/CSS'ini kabuk tasarımı adına değiştirme kullanılmaz.

## 9. Erişilebilirlik

Normal metinlerde en az 4.5:1, büyük metinlerde en az 3:1 WCAG AA kontrast hedeflenir. Ana/ikincil metin, semantik metin, etiket adları, birincil ve tehlike düğme metinleri normal, hover ve active yüzeylerine karşı kontrol edilir. Kart sınırları dekoratiftir; kontrol veya odak için tek gösterge olarak kullanılmaz. İşlevsel sınırlar, ikonlar ve odak göstergeleri komşu yüzeye karşı en az 3:1 olmalıdır. Renk, kayıt durumu veya seçim için tek sinyal değildir.

Tam klavye gezinmesi: Tab/Shift+Tab eylemler arasında, ok tuşları ağaç/sekme/menü/segmentli kontrol içinde, Enter/Space etkinleştirme ve Escape kapatma. Hedef odak sırası özel başlık çubuğu ve sekmeler → kenar çubuğu oluşturma/arama/filtre → favoriler/ağaç/etiketler/alt menü → not başlığı ve eylemleri → editör veya iframe içeriği → durum çubuğunda varsa etkileşimli öğeler. Pasif durum metinleri Tab durağı değildir. Görsel konum ile DOM sırası tutarlı kalır.

Diyalog açıldığında odak diyaloğa taşınır, kapanınca tetikleyiciye döner. Arama sonuçları listbox/option, ağaç tree/treeitem, sekmeler tablist/tab ilişkilerini korur. Gizlenen kenar çubuğu odak sırasından çıkar. Etiket noktası ve dekoratif ikonlar yardımcı teknolojilere gereksiz tekrar üretmez; ikon eylemleri açıklayıcı ad taşır. Zoom, uzun çeviriler ve minimum pencere boyutu eylemleri erişilemez hale getirmez.
