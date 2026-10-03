# Not yazarlığı

Bir not, kök dizindeki kendi klasöründe `metadata.json`, `index.html` ve isteğe bağlı `style.css`, `script.js`, `assets/` dosyalarından oluşur. Medya için `./assets/resim.png` gibi göreli yollar kullanın. HTML içindeki stil ve script dosyalarını da göreli yollarla ekleyin.

## Tema ve yerel veri

Not iframe'inin kök öğesine tema değişkenleri aktarılır: `--ht-bg`, `--ht-text`, `--ht-accent`, `--ht-font`, `--ht-muted`, `--ht-border`, `--ht-code-bg`. Örneğin `body { background: var(--ht-bg); color: var(--ht-text); font-family: var(--ht-font); }`. Açık/koyu tema geçişine uyum için bu değişkenleri kullanın.

Köprü scripti `window.htnote.noteId` alanında notun UUID'sini sağlar. Notlar aynı origin'i paylaştığı için `localStorage` anahtarlarını bu kimlikle ayırın. Örnek: `localStorage.setItem("checklist:" + window.htnote.noteId, "done")`. Bu veri not klasörünün parçası değildir; dışa aktarma veya kopyalama sırasında taşınmaz.

## Bağlantılar ve güvenlik

Başka bir nota `<a href="htnote://note/<uuid>">Not</a>` biçiminde bağlanın; `<uuid>` hedef notun kimliğidir. `https:`, `http:` ve `mailto:` bağlantıları sistem tarayıcısına yönlendirilir. Not JavaScript'i ayrı origin'li sandbox iframe'inde çalışır: popup açamaz, ana pencereye geçiş yapamaz ve Tauri IPC'ye erişemez. `window.open` harici adresler için sistem tarayıcısı isteği gönderir, yeni iframe penceresi oluşturmaz.

PDF oluşturulurken not `?print=1` ile yüklenir. Bu mod açık temayı uygular; yazdırmada gizlenecek etkileşimli kontroller için kendi `@media print` kurallarınızı ekleyin.

## Video ve ses

Uygulama içinde köprü `:where(video,img)` ile `max-width: 100%; height: auto` ve `:where(video)` ile `max-height: 75vh` uygular. Daha özgül yazar CSS'i veya inline stiller bu temel sınırları geçersiz kılabilir.

`<audio controls src="./assets/kayit.wav" title="Görüşme kaydı"></audio>` kompakt, erişilebilir ses oynatıcısıyla gösterilir. Başlık verilmezse dosya adı kullanılır. Space oynatır/duraklatır; sağ/sol oklar beş saniye ileri/geri gider. İlerleme çubuğuna tıklayarak veya sürükleyerek konum seçebilirsiniz; Home/End başlangıca/sona gider. Dikey çubuklar dekoratiftir, gerçek dalga formu değildir; azaltılmış hareket tercihinde animasyon kapanır. Kaynak audio öğesi yerinde ve gizli kalır; script'ler aynı öğeyi kullanabilir. `controls` içermeyen ses öğelerine özel oynatıcı eklenmez.

Native ses kontrollerini korumak için `<audio controls data-ht-native src="./assets/kayit.wav"></audio>` kullanın. Özel oynatıcı Shadow DOM içinde `ht-audio-*` sınıflarını ve ana uygulamanın tema token'larını kullanır. Kontrol etiketleri uygulama dili değiştiğinde güncellenir.

Tüm ses/video kontrollerinde indirme seçeneği uygulama içinde kapatılır; video bağlam menüsü de engellenir. Bu bir dosya erişim güvenliği önlemi değildir. Değişiklikler yalnızca sunum sırasında yapılır; diskteki HTML'e yazılmaz. Tek HTML ve ZIP dışa aktarımları bridge içermez ve native kontrolleri korur.

## Yazı rengi ve not arka planı

Görsel araç çubuğundaki **Yazı rengi** seçimi `<span style="color: …">` olarak kaydedilir. Hazır renkler `var(--ht-color-red, #b02d3c)` gibi tema değişkenleri ve dışa aktarım için renk yedeği kullanır. `gray`, `red`, `orange`, `yellow`, `green`, `teal`, `blue`, `purple`, `pink` paletleri vardır. Özel renk hex olarak saklanır; **Varsayılan (renk yok)** renk işaretini kaldırır ve metin belge rengini devralır.

Not başlığındaki **Görünüm** seçicisi `body` üzerinde `data-ht-bg` kullanır: `sepia` (Kâğıt), `mint` (Nane), `rose` (Gül), `sky` (Gök), `lavender` (Lavanta), `charcoal` (Kömür). `style#htnote-appearance`, tema token'larından alınan açık/koyu paletleri not HTML'inde taşır. `--ht-note-<preset>` etkin preset rengi, `--ht-note-bg` sayfa zemini, `--ht-bg` body zemini ve `--ht-text` metin rengidir. Uygulamada `html[data-ht-theme="light|dark"]`, bağımsız HTML'de `prefers-color-scheme` kullanılır. Tek HTML ve ZIP dışa aktarımlarında öznitelik ve stil korunur; PDF açık varyantı kullanır.

Varsayılan seçimi yönetilen öznitelik/stili kaldırır. Uygulama bu durumda `--ht-bg` ve `--ht-text` değerlerini kendi yüzey/metin token'larından verir. Bridge'in temel `:where(html)` kuralı düşük özgüllüktedir; `body { background: … }` gibi kendi CSS'iniz önceliklidir. Görünüm düzenleme modunda kaydet/iptal işlemlerine dahil edilir, okuma modunda anında kaydedilir.

Etiket renkleri normalize etiket adına göre globaldir ve uygulama ayarlarında saklanır. Not başına farklılaşmaz ve not klasörüyle taşınmaz; kenar çubuğundaki renk noktasından veya Ayarlar → Etiket renkleri bölümünden değiştirilir.
