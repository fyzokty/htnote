# HTNote - Geliştirme Yol Haritası (Roadmap) 🚀

Bu doküman, projeyi gelecekte kodlamaya karar verdiğinde sıfırdan çalışan bir MVP'ye (Minimum Viable Product) ve nihai sürüme ulaştırmak için takip edeceğin adım adım geliştirme planıdır.

> ℹ️ Bu yüksek seviyeli bir özettir. Uygulanabilir görev dökümü yerel `tasks/` klasöründedir (gitignore'da). v1.0 kapsamı 7 fazın tamamı ile favoriler, etiketler ve geri bağlantılardır (D24). Çelişkide [`decisions.md`](decisions.md) geçerlidir.

---

## 📍 Aşama 1: Temel İskelet ve Proje Kurulumu
> **Hedef:** Boş bir Tauri v2 + React projesi ayağa kaldırmak ve pencereyi çalıştırmak.

- [ ] `npm create tauri-app@latest` ile Tauri v2, React, TypeScript ve Vite şablonunu oluşturmak.
- [ ] Tailwind CSS kütüphanesini ve temel ikon setini (`lucide-react`) projeye dahil etmek.
- [ ] Rust tarafında `Documents/HTNote/` dizinini otomatik oluşturan başlangıç fonksiyonunu yazmak.
- [ ] Windows, macOS ve Linux pencere çerçevesi ve minimum pencere boyutlarını yapılandırmak (`tauri.conf.json`).

---

## 📍 Aşama 2: Dosya Sistemi & Sol Ağaç Mimarisi
> **Hedef:** Diskteki klasörleri ve notları okuyup sol panelde listelemek.

- [ ] Rust tarafında `get_note_tree` komutunu yazmak (klasörleri ve altındaki `metadata.json`'ları tarayan özyinelemeli fonksiyon).
- [ ] React tarafında sol kenar çubuğu ve ağaç görünümü bileşenini oluşturmak (`react-arborist` veya özel Tailwind ağaç bileşeni).
- [ ] Rust'ta `create_folder` ve `create_note` (boş `index.html` + `metadata.json` üreten) IPC komutlarını eklemek.
- [ ] Rust `notify` crate'i ile dosya izleyiciyi (File Watcher) kurmak ve diskte bir dosya değiştiğinde React'a event fırlatmak.

---

## 📍 Aşama 3: İzole Görüntüleme Modu (Viewer)
> **Hedef:** Seçilen bir notu güvenli bir iframe içinde tüm CSS ve JS yetenekleriyle çalıştırmak.

- [ ] `htnote-note` özel protokolünü kurmak (notlar ayrı origin'den sunulur, D08).
- [ ] Sol ağaçta bir nota tıklandığında üstte yeni sekme (Tab) açma mekanizmasını kurmak.
- [ ] Rust tarafında `read_note` komutunu yazarak `index.html`, `style.css` ve `script.js` içeriklerini ön yüze taşımak.
- [ ] `<iframe>` bileşenini oluşturmak ve notu protokol URL'sinden `sandbox="allow-scripts allow-forms allow-same-origin allow-modals"` ile render etmek.
- [ ] Iframe içine hafif köprü scriptini enjekte edip `htnote://...` link tıklamalarını `postMessage` ile yakalayarak yeni not sekmesi açmayı sağlamak.

---

## 📍 Aşama 4: Çift Modlu Editör (Görsel + Kod)
> **Hedef:** Notları hem görsel hem de kod düzeyinde düzenleyip diske kaydedebilmek.

- [ ] "Düzenle" butonuna tıklandığında aktif sekmenin düzenleme moduna geçmesini sağlamak.
- [ ] **Görsel Editör:** TipTap editörünü entegre etmek; başlık, liste, kalın, italik, tablo gibi temel uzantıları eklemek.
- [ ] **Kod Editörü (Split View):** CodeMirror 6 editörünü eklemek (`@codemirror/lang-html`, `@codemirror/lang-css`, `@codemirror/lang-javascript`).
- [ ] Sol kod editörü ile sağ canlı önizleme iframe'i arasında anlık senkronizasyonu kurmak.
- [ ] `save_note` IPC komutu ile değişiklikleri diske yazmak ve `metadata.json` ile `index.html` `<head>` etiketlerini senkronize etmek.

---

## 📍 Aşama 5: Medya & Ek Dosya Desteği (Assets)
> **Hedef:** Resim ve ses dosyalarını sürükleyip bırakarak nota eklemek.

- [ ] Tauri `onDragDropEvent` ile işletim sisteminden bırakılan dosyaları yakalamak (D15).
- [ ] Dosya sürüklendiğinde Rust'a `copy_asset` komutunu göndererek dosyanın notun `assets/` klasörüne kopyalanmasını sağlamak.
- [ ] Editöre göreceli yol ile `<img src="./assets/...">` veya `<audio controls src="./assets/...">` bloğu eklemek.
- [ ] Görüntüleme modunda yerel ses çaların kusursuz çalıştığını test etmek.

---

## 📍 Aşama 6: Arama ve Çöp Kutusu (`.trash`)
> **Hedef:** Hızlı arama ve veri güvenliği sağlamak.

- [ ] Sol panelin üstündeki arama kutusuyla ağaç elemanlarını anlık filtreleme.
- [ ] `Ctrl + Shift + F` ile açılan genel tam metin arama modalını tasarlamak.
- [ ] Rust tarafında HTML etiketlerinden arındırılmış metinlerde hızlı arama yapan `search_notes` fonksiyonunu yazmak.
- [ ] Silinen notları `.trash/` klasörüne taşıyan ve Çöp Kutusu panelinden geri yükleme/kalıcı silme yeteneği sunan mekanizmayı tamamlamak.

---

## 📍 Aşama 7: Dışa Aktarma & Son Dokunuşlar
> **Hedef:** Notları paylaşılabilir hale getirmek ve kullanıcı deneyimini parlatmak.

- [ ] **Single HTML:** Notun HTML, CSS, JS ve Base64'e dönüştürülmüş görsellerini tek bir bağımsız `.html` dosyasında birleştiren ihracat motorunu yazmak.
- [ ] **PDF:** Tauri webview yazdırma API'si ile notu PDF olarak kaydetmek.
- [ ] **ZIP:** Not klasörünü sıkıştırıp kullanıcıya indirtmek.
- [ ] Koyu / Açık tema geçişini tamamlamak ve klavye kısayollarını (`Ctrl+S`, `Ctrl+E`, `Ctrl+W` vb.) aktifleştirmek.
- [ ] Windows (.msi / .exe), macOS (.dmg) ve Linux (.deb / .AppImage) derleme (build) testlerini gerçekleştirmek.
