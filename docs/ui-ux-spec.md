# HTNote - UI / UX Tasarım Spesifikasyonu 🎨

Bu doküman, HTNote uygulamasının kullanıcı arayüzü düzenini, ekran yerleşimlerini (wireframe), etkileşim modellerini ve klavye kısayollarını tanımlar.

> D29 uyarınca güncel görsel kaynak [`DESIGN.md`](../DESIGN.md) belgesidir. Özel başlık çubuğu sekmeleri ve pencere düğmelerini taşır; başlık çubuğundaki arama düğmesi tam metin aramayı açar, hızlı filtre kenar çubuğundadır. Kenar çubuğu ve çalışma alanı yuvarlak kartlardır. Arama buzlu örtülü, sonuç pill’leri ve klavye ipuçları olan bir diyalogdur. Ayarlar Depolama, Görünüm ve Hakkında olmak üzere üç karttır; tema segmentleri, dil listesi, sekme/içerik genişliği kontrolleri ve etiket renkleri korunur. Aşağıdaki wireframe işlevsel yerleşimi özetler.

> ⚠️ **Karar kaydı önceliklidir:** Bu doküman ile [`decisions.md`](decisions.md) çelişirse `decisions.md` geçerlidir.

---

## 1. Genel Ekran Düzeni (Wireframe)

Uygulama arayüzü 3 ana bölgeden oluşur: **Sol Kenar Çubuğu (Sidebar)**, **Üst Sekme Çubuğu (Tab Bar)** ve **Ana Çalışma Alanı (Viewport)**.

```text
+---------------------------------------------------------------------------------------+
|  [☰]             [Not 1 x] [Not 2 * x] [+]                     [_] [口] [X] (Window)|
+-------------------+-------------------------------------------------------------------+
| [Hızlı Filtre..]  |  Not Başlığı (h1)                [⭐] [Dışa Aktar v] [ Düzenle ✏️ ] |
|-------------------|-------------------------------------------------------------------|
| ⭐ Favoriler      |                                                                   |
| > 📁 Yazılım      |                                                                   |
|   v 📁 Web        |                                                                   |
|     📄 React Notu |                                                                   |
|   📄 Rust Notu    |                    ANA ÇALIŞMA ALANI                              |
| > 📁 Günlük       |                                                                   |
|                   |           (Görüntüleme Modu: Sandboxed Iframe)                     |
|                   |           (Düzenleme Modu: TipTap veya Split View)                 |
|                   |                                                                   |
|                   |                                                                   |
+-------------------+                                                                   |
| 🗑️ Çöp Kutusu     |                                                                   |
| ⚙️ Ayarlar        |                                                                   |
+-------------------+-------------------------------------------------------------------+
```

---

## 2. Bölge Detayları ve Etkileşimler

### 2.1. Sol Kenar Çubuğu (Sidebar)
- **Genişlik:** 260px (kullanıcı kenardan tutup genişliği yeniden boyutlandırabilir veya `Ctrl + \` ile gizleyebilir; `Ctrl+B` editörde kalın için ayrılmıştır).
- **Üst Eylem Alanı:**
  - `[+ Not]` : Seçili klasörün içinde anında yeni boş not oluşturur.
  - `[+ Klasör]` : Yeni klasör açar.
  - `[🔍 Ara]` : Genel tam metin arama penceresini (`Ctrl+Shift+F`) tetikler.
- **Hızlı Filtre Çubuğu:** Kenar çubuğundaki alana girilen anahtar kelime sol ağaçtaki başlıkları anlık olarak süzer.
- **Favoriler Bölümü:** Ağacın üstünde, favori notların düz listesi (daraltılabilir).
- **Etiketler Bölümü:** Ağacın altında etiket listesi; tıklanan etiket ağacı süzer.
- **Klasör Ağacı:**
  - Klasörlerin açılır/kapanır okları (`> / v`).
  - Sürükle-bırak ile klasör veya not yerini değiştirme.
  - Sağ tık menüsü (Context Menu): *Yeniden Adlandır*, *Çöpe At*, *Dosya Gezgininde Göster*.
- **Sabit Alt Alan:**
  - **🗑️ Çöp Kutusu (`.trash`):** Silinen notların listesini açar.
  - **⚙️ Ayarlar:** Depolama dizini seçimi, Koyu/Açık tema değişimi ve genel tercihler.

### 2.2. Üst Sekme Çubuğu (Tab Bar)
- Tarayıcı veya VS Code mantığında çalışır.
- Her sekmede notun adı, kaydedilmemişse uyarı noktası (`•`) ve kapatma ikonu (`×`) yer alır.
- Sekmeler arası sürükle-bırak ile sıralama yapılabilir.
- `+` butonuna basıldığında aktif klasörde yeni bir sekme/not açılır.

---

## 3. Çalışma Alanı Modları (Viewer & Editor)

### 3.1. Görüntüleme Modu (View Mode)
- **Üst Araç Çubuğu:**
  - Sol tarafta notun başlığı, son kaydedilme zamanı ve altında etiket çipleri (`+ etiket`).
  - Sağ tarafta:
    - `⭐ Favori` ikonu.
    - `📤 Dışa Aktar` (PDF, Single HTML, ZIP seçenekleri bulunan açılır menü).
    - `✏️ Düzenle` butonu (Tıklandığında not Düzenleme Moduna geçer).
- **Gövde:** Saf HTML5, CSS ve JavaScript çıktısını çalıştıran tam ekran izole `<iframe>`.
- **Geri Bağlantılar Paneli:** Gövdenin altında daraltılabilir "Bu nota bağlanan notlar" listesi.

### 3.2. Düzenleme Modu (Edit Mode)

Kullanıcı "Düzenle" butonuna bastığında arayüz düzenleme moduna geçer:
- Üst araç çubuğu değişir:
  - `💾 Kaydet (Ctrl+S)` ve `❌ İptal` butonları gelir.
  - Mod Seçici Buton: `[📝 Görsel Editör]` | `[💻 Kod / Split View]`

#### A. Görsel Editör Görünümü:
- TipTap editör çubuğu: Başlıklar, Kalın, İtalik, Listeler, Tablo Ekle, Görsel/Ses Ekleme butonları.
- Belgeler gibi akıcı, modern, sade zengin metin yazma alanı.

#### B. Kod Düzenleme Görünümü (Split View):
```text
+-----------------------------------------------------------------------------------+
| [💾 Kaydet] [❌ İptal]       [HTML] [CSS] [JS]               [🔄 Canlı Önizleme]  |
+---------------------------------------------------+-------------------------------+
| 1 <!DOCTYPE html>                                 |                               |
| 2 <div class="card">                              |       CANLI ÖNİZLEME          |
| 3   <h2>Hesap Makinesi</h2>                       |                               |
| 4   <input id="num1" type="number" />             |   Sol tarafta yazılan kodlar  |
| 5   <button onclick="topla()">Topla</button>      |   anında burada çalışır       |
| 6 </div>                                          |   ve test edilir.             |
|                                                   |                               |
| (CodeMirror 6 Editörü - %50 Genişlik)             | (İzole Iframe - %50 Genişlik) |
+---------------------------------------------------+-------------------------------+
```

---

## 4. Klavye Kısayolları (Keyboard Shortcuts)

Uygulamanın kullanım hızını artıracak varsayılan kısayol haritası:

| Kısayol (Win / Linux) | Kısayol (macOS) | İşlem |
|---|---|---|
| `Ctrl + N` | `Cmd + N` | Yeni boş not oluştur |
| `Ctrl + Shift + N` | `Cmd + Shift + N` | Yeni klasör oluştur |
| `F2` | `F2` | Seçili öğeyi yeniden adlandır |
| `Ctrl + S` | `Cmd + S` | Açık notu kaydet |
| `Ctrl + E` | `Cmd + E` | Görüntüle / Düzenle modu arasında geçiş yap |
| `Ctrl + Shift + F` | `Cmd + Shift + F` | Genel tam metin arama penceresini aç |
| `Ctrl + W` | `Cmd + W` | Aktif sekmeyi kapat |
| `Ctrl + Tab` | `Ctrl + Tab` | Sonraki sekmeye geç (`Cmd+Tab` işletim sistemine aittir) |
| `Ctrl + Shift + Tab` | `Ctrl + Shift + Tab` | Önceki sekmeye geç |
| `Ctrl + \` veya `Ctrl + Shift + B` | `Cmd + \` veya `Cmd + Shift + B` | Sol kenar çubuğunu gizle / göster |
| `Ctrl + /` | `Cmd + /` | Klavye kısayollarını göster |
| `Escape` | `Escape` | Açık modal veya arama pencerelerini kapat |
| `Ctrl + B / I / U / K` | `Cmd + B / I / U / K` | Editörde kalın / italik / altı çizili / not bağlantısı |

---

## 5. Renk Paleti ve Tema Rehberi

Uygulama Tailwind CSS renk semantiğiyle tasarlanır:
- **Koyu Tema (Dark):** Arka plan `slate-900` (#0f172a), kart/panel `slate-800` (#1e293b), metin `slate-100` (#f1f5f9), vurgu (accent) `indigo-500` (#6366f1).
- **Açık Tema (Light):** Arka plan `gray-50` (#f9fafb), kart/panel `white` (#ffffff), metin `gray-900` (#111827), vurgu `indigo-600` (#4f46e5).
