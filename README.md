# HTNote 📝

> **HTML Temelli, İnteraktif ve Yerel-Öncelikli (Local-First) Masaüstü Not Alma Uygulaması**

HTNote; kullanıcıların notlarını açık standart olan **HTML, CSS ve JavaScript** ekosisteminde saklayan, modern, hafif ve tamamen internetsiz (offline) çalışan masaüstü not alma uygulamasıdır. Sıradan not defterlerinden farklı olarak notların içerisinde JavaScript çalıştırabilir, interaktif araçlar, hesaplamalar, ses kayıtları ve dinamik tablolar barındırabilirsiniz.

---

## 🌟 Temel Felsefe ve Öne Çıkan Özellikler

- **Açık Standart ve Veri Bağımsızlığı:** Notlarınız özel (proprietary) bir veritabanında değil; doğrudan diskinizde (`Belgeler/HTNote/`) standart `.html` dosyaları ve ilgili `assets/` klasörlerinde saklanır. Yarın bu uygulamayı silseniz bile notlarınızı herhangi bir web tarayıcısında çift tıklayarak görüntüleyebilirsiniz.
- **İnteraktif Notlar (HTML + CSS + JS):** Notlar sadece statik metin değildir. Notun içine JavaScript kodu ekleyebilir, mini hesap makineleri, dinamik grafikler veya interaktif kontrol listeleri oluşturabilirsiniz.
- **İzole & Güvenli Görüntüleme (Iframe Sandbox):** Not içindeki JavaScript kodları güvenli bir `<iframe>` havuzunda çalışır; ana masaüstü uygulamanıza veya işletim sisteminize zarar veremez.
- **Çift Modlu Çalışma:**
  - **Görüntüleme Modu (Varsayılan):** Notlar açıldığında salt okunur ve çalıştırılabilir web sayfası olarak açılır.
  - **Düzenleme Modu:** "Düzenle" butonuna tıklandığında açılır. Varsayılan olarak zengin görsel editör (WYSIWYG), istendiğinde ise canlı önizlemeli (Split View) HTML/CSS/JS kod editörü sunar.
- **Zengin Medya Desteği:** Resim, ses (`.mp3`, `.wav`) ve videoları sürükleyip bırakarak notun kendi `assets/` klasörüne otomatik kopyalama ve oynatma.
- **İç Linkleme (Notlar Arası Köprü):** Notların birbirine `htnote://note/<id>` formatında link verebilmesi, linke tıklandığında ilgili notun anında açılması ve geri bağlantıların (backlinks) görülebilmesi.
- **Favoriler ve Etiketler:** Notları favorilere ekleme, etiketleme ve etikete göre süzme.
- **Çoklu Sekme (Tab) Arayüzü:** Birden fazla notu aynı anda sekmeler halinde açık tutabilme.
- **İki Kademeli Arama:** Sol menüde anlık başlık/klasör filtreleme ve tüm notlar genelinde derinlemesine tam metin (Full-Text) araması.
- **Dosya Sistemi Senkronizasyonu (Zero-Cost Watcher):** İşletim sistemi dosya yöneticisinden (Explorer/Finder) yapılan klasör ve dosya değişikliklerini anlık olarak yakalama.
- **Dahili Çöp Kutusu (`.trash`):** Silinen notların kaybolmasını önleyen uygulama içi geri dönüşüm alanı.
- **Dışa Aktarma:** Notları tek dosya HTML, PDF veya ZIP paketi olarak dışa aktarabilme.

---

## 🛠️ Teknoloji Yığını (Tech Stack)

| Katman | Teknoloji | Seçim Sebebi |
|---|---|---|
| **Masaüstü Altyapısı** | **Tauri v2 (Rust)** | Minimum RAM kullanımı (~30-50MB), küçük dosya boyutu, yüksek güvenlik ve native OS API erişimi. |
| **Frontend Framework** | **React 18/19 + TypeScript + Vite** | Geniş kütüphane ekosistemi, güçlü tip güvenliği ve hızlı geliştirme döngüsü. |
| **Stil / Arayüz** | **Tailwind CSS** | Sıfır çalışma zamanı yükü (zero-runtime), modern ve esnek tasarım kabiliyeti. |
| **Görsel Editör (WYSIWYG)** | **TipTap (ProseMirror)** | Saf HTML çıktısı üretimi, genişletilebilir blok mimarisi, zengin metin deneyimi. |
| **Kod Editörü** | **CodeMirror 6** | Monaco'ya kıyasla aşırı hafif (~500KB), modüler, anında yüklenen HTML/CSS/JS editörü. |
| **Dosya İzleyici** | **Rust `notify` Crate** | İşletim sisteminin yerel dosya olaylarını (FSEvents, inotify, ReadDirectoryChangesW) CPU harcamadan dinleme. |
| **State** | **Zustand** | Hafif, az boilerplate. |
| **Sürükle-Bırak** | **@dnd-kit** | Pointer tabanlı; Tauri'nin dosya bırakma davranışıyla çakışmaz. |
| **i18n** | **i18next** | Türkçe / İngilizce arayüz. |

---

## 📚 Dokümantasyon İndeksi

Bu mimari planlama serisi projenin tüm yönlerini ele alan modüler dokümanlardan oluşur:

0. 🧭 [Mimari Karar Kaydı](docs/decisions.md) - **Yetkili kaynak**; diğer dokümanlarla çelişkide bu geçerlidir.
1. 📋 [Özellikler ve Fonksiyonel Spesifikasyon](docs/features.md) - Uygulamanın tüm yetenekleri, kullanıcı akışları ve iş kuralları.
2. 🗄️ [Veri Yapısı ve Depolama Standardı](docs/data-structure.md) - Not paket formatı, `metadata.json`, HTML `<head>` eşleşmesi ve dizin hiyerarşisi.
3. 🏗️ [Teknik Mimari ve Güvenlik](docs/architecture.md) - Tauri/Rust backend, React frontend, IPC haberleşmesi, iframe sandbox ve `postMessage` protokolü.
4. 🎨 [UI / UX Spesifikasyonu](docs/ui-ux-spec.md) - Arayüz bileşenleri, layout yerleşimi, split-view kodlama ve klavye kısayolları.
5. 🚀 [Uygulama Yol Haritası (Roadmap)](docs/roadmap.md) - Sıfırdan çalışan bir MVP'ye adım adım geliştirme aşamaları.
