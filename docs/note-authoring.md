# Not yazarlığı

Bir not, kök dizindeki kendi klasöründe `metadata.json`, `index.html` ve isteğe bağlı `style.css`, `script.js`, `assets/` dosyalarından oluşur. Medya için `./assets/resim.png` gibi göreli yollar kullanın. HTML içindeki stil ve script dosyalarını da göreli yollarla ekleyin.

## Tema ve yerel veri

Not iframe'inin kök öğesine tema değişkenleri aktarılır: `--ht-bg`, `--ht-text`, `--ht-accent`, `--ht-font`, `--ht-muted`, `--ht-border`, `--ht-code-bg`. Örneğin `body { background: var(--ht-bg); color: var(--ht-text); font-family: var(--ht-font); }`. Açık/koyu tema geçişine uyum için bu değişkenleri kullanın.

Köprü scripti `window.htnote.noteId` alanında notun UUID'sini sağlar. Notlar aynı origin'i paylaştığı için `localStorage` anahtarlarını bu kimlikle ayırın. Örnek: `localStorage.setItem("checklist:" + window.htnote.noteId, "done")`. Bu veri not klasörünün parçası değildir; dışa aktarma veya kopyalama sırasında taşınmaz.

## Bağlantılar ve güvenlik

Başka bir nota `<a href="htnote://note/<uuid>">Not</a>` biçiminde bağlanın; `<uuid>` hedef notun kimliğidir. `https:`, `http:` ve `mailto:` bağlantıları sistem tarayıcısına yönlendirilir. Not JavaScript'i ayrı origin'li sandbox iframe'inde çalışır: popup açamaz, ana pencereye geçiş yapamaz ve Tauri IPC'ye erişemez. `window.open` harici adresler için sistem tarayıcısı isteği gönderir, yeni iframe penceresi oluşturmaz.

PDF oluşturulurken not `?print=1` ile yüklenir. Bu mod açık temayı uygular; yazdırmada gizlenecek etkileşimli kontroller için kendi `@media print` kurallarınızı ekleyin.
