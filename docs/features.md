# HTNote - Özellikler ve Fonksiyonel Spesifikasyon 📋

Bu dokümanda **HTNote** uygulamasının sahip olacağı tüm temel yetenekler, kullanıcı senaryoları ve çalışma kuralları detaylandırılmıştır.

> ⚠️ **Karar kaydı önceliklidir:** Bu doküman ile [`decisions.md`](decisions.md) çelişirse `decisions.md` geçerlidir.

---

## 1. Mod Yönetimi (View vs Edit)

HTNote'un en belirgin karakteristiklerinden biri notların iki ayrı aşamada var olmasıdır:

### 1.1. Görüntüleme Modu (View Mode - Varsayılan)
- Sol ağaçtan bir nota tıklandığında veya yeni bir sekme açıldığında not **Görüntüleme Modu**nda açılır.
- Bu modda not bir web sayfası gibi çalıştırılır.
- Varsa JavaScript kodları icra edilir (etkileşimli butonlar, canvas çizimleri, grafikler, sayaçlar vb. çalışır durumda olur).
- Metin alanları kazara düzenlemelere karşı kilitlidir (salt okunur).
- Kullanıcı dilerse sağ üstteki belirgin **"Düzenle" (Edit / Kalem ikonu)** butonuna basarak düzenleme moduna geçer.

### 1.2. Düzenleme Modu (Edit Mode)
Düzenleme moduna girildiğinde kullanıcıya iki farklı deneyim sunulur:

#### A. Görsel Editör (Varsayılan Düzenleme Ekranı)
- TipTap kütüphanesi ile güçlendirilmiş Word / Google Docs benzeri zengin metin düzenleyici.
- Başlıklar (H1-H6), kalın, italik, altı çizili, liste (sıralı/sırasız), alıntı, kod bloğu, tablo ve ayraç çizgileri.
- Resim ve ses dosyalarını doğrudan metnin arasına sürükleyip bırakabilme.
- Üst araç çubuğunda sağda yer alan **"HTML / Kod Modu"** butonuna basılarak kod editörüne geçiş yapılabilir.
- Görsel editör yalnızca `<main id="htnote-content">` içini düzenler. Kod modunda yazılmış özel HTML parçaları (script, canvas, div vb.) görsel editörde silinmez; **"HTML Bloğu"** olarak korunur ve kod modunda düzenlenir (D10).

#### B. Canlı Kod Editörü (Split View)
- Kullanıcı "Kod Düzenle"ye bastığında ekran ikiye bölünür (Split View):
  - **Sol Panel:** CodeMirror 6 ile çalışan kod editörü. `HTML`, `CSS` ve `JavaScript` sekmeleri bulunur.
  - **Sağ Panel:** Sol tarafta yazılan kodun anlık (canlı) olarak render edildiği önizleme ekranı.
- Kullanıcı doğrudan saf HTML etiketlerini, özel CSS stillerini veya JavaScript fonksiyonlarını yazar ve sağ tarafta canlı sonucunu görür.
- "Kaydet" veya "Düzenlemeyi Bitir" butonuna basıldığında not kaydedilir ve Görüntüleme Moduna dönülür.
- Kaydedilmemiş değişiklikler çökmeye karşı periyodik olarak taslak olarak saklanır ve bir sonraki açılışta kurtarılabilir (D11).

---

## 2. Dosya, Klasör ve Ağaç Hiyerarşisi

- **Sol Panel Klasör Ağacı:** Kullanıcı iç içe sınırsız derinlikte klasör açabilir (`Klasör A > Alt Klasör B > Not C`).
- **Sürükle & Bırak ile Taşıma:** Notlar veya klasörler ağaç içerisinde sürüklenip başka bir klasörün altına taşınabilir.
- **Her Zaman Boş Not:** Yeni not ekleme butonuna basıldığında kullanıcıya şablon seçimi dayatılmaz; doğrudan temiz, boş bir not paketi oluşturulur.
- **Yeniden Adlandırma & Silme:** Ağaç üzerindeki elemanlara sağ tıklanarak (bağlam menüsü - context menu) yeniden adlandırma veya silme işlemi yapılabilir.

---

## 3. Dahili Çöp Kutusu (`.trash`)

- Bir not veya klasör silindiğinde diskten doğrudan kalıcı olarak yok edilmez.
- Ana depolama dizini altındaki gizli `.trash/` klasörüne taşınır.
- Sol panelin en altında sabit bir **"Çöp Kutusu" (Trash)** alanı bulunur.
- Kullanıcı çöp kutusuna tıklayarak silinmiş notları görebilir:
  - **Geri Yükle (Restore):** Notu eski bulunduğu orijinal konumuna geri taşır.
  - **Kalıcı Olarak Sil (Delete Permanently):** Dosyayı diskten tamamen temizler.
  - **Çöp Kutusunu Boşalt:** Tüm silinmiş notları tek seferde yok eder.

---

## 4. Medya ve Ek Dosya Yönetimi (Assets)

- **Otomatik İçe Aktarma:** Editör açıkken dışarıdan bir görsel (`.png`, `.jpg`, `.svg`, `.webp`), ses (`.mp3`, `.wav`, `.ogg`) veya video (`.mp4`, `.webm`) editöre sürüklendiğinde:
  1. Tauri arka planı bu dosyayı notun altındaki `assets/` klasörüne kopyalar (örn: `assets/ses-kaydi.mp3`).
  2. Editör içerisine ilgili HTML elemanı yerleştirilir:
     - Görseller için: `<img src="./assets/diyagram.png" alt="Diyagram" />`
     - Sesler için: `<audio controls src="./assets/ses-kaydi.mp3"></audio>`
     - Videolar için: `<video controls src="./assets/video.mp4"></video>`
- **Görüntüleme Modunda Oynatma:** Ses ve video oynatıcılar HTML5 yerel oynatıcı yetenekleriyle sorunsuz şekilde yürütülür.

---

## 5. İç Linkleme (Notlar Arası Köprüler)

- Notlar arasında karşılıklı referans vermek mümkündür.
- Standart bağlantı formatı: `<a href="htnote://note/<not-id>">Not 2'ye Git</a>` (id tabanlı; not taşınsa veya yeniden adlandırılsa da kırılmaz, D07).
- Kullanıcı görsel editörde metin seçip "Not Bağla" butonuna bastığında, arama açılır ve kullanıcı bağlanmak istediği hedef notu seçer.
- Görüntüleme modunda linke tıklandığında:
  - Sayfa yenilenmez.
  - Üstte yeni bir sekme olarak (veya aktif sekmede) hedef not açılır.
  - Sol ağaçta ilgili not seçili duruma gelir.

---

## 6. Arama Mekanizması

HTNote iki kademeli ve birbirinden bağımsız arama mekanizması sunar:

### 6.1. Hızlı Ağaç Filtreleme (Quick Filter)
- Sol ağacın en üstünde yer alan arama çubuğu.
- Sadece klasör ve not başlıklarında gerçek zamanlı filtreleme yapar.
- Harf girildikçe ağaçta eşleşmeyen dallar gizlenir, sadece eşleşen notlar listelenir.

### 6.2. Genel Tam Metin Araması (Global Full-Text Search)
- `Ctrl + Shift + F` (Mac: `Cmd + Shift + F`) kısayolu ile veya arama sekmesinden açılır.
- Tüm notların `index.html` dosyalarındaki metin içeriklerini (HTML etiketlerinden arındırılmış temiz metinleri) tarar.
- Arama sonuçlarında:
  - Hangi notta bulunduğu,
  - Eşleşen kelimenin öncesi ve sonrasındaki metin parçası (snippet / context) listelenir.
- Sonuca tıklandığında not açılır ve ilgili kelimeye odaklanılır.

---

## 7. Sekmeli Arayüz (Tabs)

- Birden çok not aynı anda açık kalabilir.
- Sekmeler sürüklenerek sırası değiştirilebilir.
- Değişiklik yapılmış ancak henüz kaydedilmemiş notların sekmelerinde "kaydedilmedi" noktası (`•`) gösterilir.
- Sekme kapatma butonları (`x`), `Ctrl + W` ile aktif sekmeyi kapatma, `Ctrl + Tab` ile sekmeler arası geçiş.

---

## 8. Dışa Aktarma (Export)

Kullanıcı bir notu paylaşmak istediğinde 3 farklı yöntem sunulur:

1. **PDF Olarak Dışa Aktar:** Notun o anki CSS stillerini ve yazı tipini koruyarak sayfa yapısına uygun A4 PDF belgesi oluşturur.
2. **Tek Dosya HTML Olarak Dışa Aktar (Single HTML):** Not klasöründeki `style.css` ve `script.js`'i tek bir `index.html` içine gömer. `assets/` klasöründeki tüm resim ve sesleri `Base64 Data URI` formatına çevirerek tek parça, her cihazda internet gerektirmeden çalışan bağımsız bir HTML dosyası üretir.
3. **ZIP Paketi:** Notun klasörünü (`index.html`, `style.css`, `script.js`, `metadata.json` ve `assets/` klasörü) sıkıştırılmış `.zip` arşivi olarak dışa aktarır.

---

## 9. Favoriler, Etiketler ve Geri Bağlantılar (D24)

- **Favoriler:** Görüntüleme araç çubuğundaki ⭐ ile işaretlenir; sidebar'da ağacın üstündeki "Favoriler" bölümünde listelenir.
- **Etiketler:** Görüntüleme araç çubuğunda başlığın altında eklenip çıkarılır; anında kaydedilir (düzenleme modu gerekmez).
- **Etikete göre filtre:** Sidebar'daki etiket listesinden bir etiket seçildiğinde ağaç o etiketi taşıyan notlara süzülür.
- **Geri bağlantılar:** Görüntüleyicideki "Bu nota bağlanan notlar" paneli, bu nota `htnote://note/<id>` linki veren notları listeler.

---

## 10. Tema ve Özelleştirme

- **Uygulama Teması:** Koyu (Dark) ve Açık (Light) tema seçeneği (sistem temasını takip etme opsiyonlu).
- **CSS Değişkenleri Enjeksiyonu:** Uygulama, notun görüntülendiği iframe içerisine genel tema değişkenlerini otomatik tanımlar:
  ```css
  :root {
    --ht-bg: #1e1e1e;
    --ht-text: #f0f0f0;
    --ht-accent: #3b82f6;
    --ht-font: system-ui, -apple-system, sans-serif;
  }
  ```
- **Kullanıcı Müdahalesi:** Not yazarının kendi `style.css` dosyasında veya `index.html` `<style>` etiketlerinde yazdığı kurallar bu değişkenleri ezebilir (override). Böylece kullanıcı dilerse tek bir notunu sarı post-it görünümüne, terminal/hacker temasına veya renkli bir bültene dönüştürebilir.
