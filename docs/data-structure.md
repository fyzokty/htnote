# HTNote - Veri Yapısı ve Depolama Standardı 🗄️

Bu doküman, HTNote uygulamasının yerel disk üzerinde verileri nasıl depolayacağını, dosya ve klasör hiyerarşisini, not paket yapısını ve metadata şemalarını ayrıntılı olarak açıklamaktadır.

> ⚠️ **Karar kaydı önceliklidir:** Bu doküman ile [`decisions.md`](decisions.md) çelişirse `decisions.md` geçerlidir.

---

## 1. Ana Depolama Dizini (Root Directory)

HTNote, verilerini işletim sisteminin standart "Belgeler" (Documents) klasöründe oluşturacağı bir ana dizinde saklar.

| İşletim Sistemi | Standart Depolama Yolu |
|---|---|
| **Windows** | `C:\Users\<Kullanıcı>\Documents\HTNote\` |
| **macOS** | `/Users/<Kullanıcı>/Documents/HTNote/` |
| **Linux** | `/home/<Kullanıcı>/Documents/HTNote/` |

> Kullanıcı isterse "Ayarlar" ekranından bu depolama dizinini değiştirebilir (örneğin harici bir diske veya senkronize olan bir bulut klasörüne taşıyabilir).
>
> Uygulama ayarları (`settings.json`) not dizininde **değil**, işletim sisteminin uygulama config dizininde tutulur (Windows: `%APPDATA%\com.htnote.app\`). Bkz. D03.

---

## 2. Dizin Hiyerarşisi (Klasör Mimarisi)

HTNote, sanal veya karmaşık bir veritabanı yapısı yerine **gerçek disk klasör yapısını** temel alır. Sol paneldeki her klasör, diskte fiziksel bir klasördür.

```text
Documents/HTNote/
├── .trash/                           <-- Dahili Çöp Kutusu (Gizli klasör)
│   └── Eski Not__20260330-194500/
│       ├── .htnote-trash.json        <-- Orijinal yol, silinme zamanı
│       ├── metadata.json
│       ├── index.html
│       └── assets/
├── Yazılım/                          <-- Kullanıcı Klasörü
│   ├── Web Geliştirme/               <-- Alt Klasör
│   │   └── React Hooks Notları/      <-- Not Paketi (Klasör)
│   │       ├── metadata.json
│   │       ├── index.html
│   │       ├── style.css
│   │       ├── script.js
│   │       └── assets/
│   │           ├── hook-flow.png
│   │           └── anlatim.mp3
│   └── Rust Öğreniyorum/             <-- Not Paketi
│       ├── metadata.json
│       └── index.html
└── Günlük Fikirler/                  <-- Not Paketi (Kök dizinde)
    ├── metadata.json
    └── index.html
```

---

## 3. Not Paketi Yapısı (Note Bundle Specification)

Her not, kendi adını taşıyan bir **dizin (klasör)** olarak var olur. Bu sayede her not tamamen bağımsız, taşınabilir ve izoledir.

- İçinde `metadata.json` olan dizin nottur (ağaçta yaprak). Olmayan dizin klasördür. `.` ile başlayan dizinler yok sayılır (D04).
- Klasör adı başlığın dosya sistemi için güvenli halidir (D05). Görüntülenen başlığın kaynağı `metadata.title`'dır.

Bir not klasörünün içerebileceği standart dosyalar:

| Dosya / Klasör | Durum | Açıklama |
|---|---|---|
| `metadata.json` | **Zorunlu** | Notun meta bilgilerini (başlık, tarihler, favori vb.) tutan JSON dosyası. |
| `index.html` | **Zorunlu** | Notun asıl içeriğini barındıran geçerli HTML5 dokümanı. |
| `style.css` | *Opsiyonel* | Kullanıcının nota özel yazdığı ek CSS kuralları (varsa `index.html`'e bağlanır). |
| `script.js` | *Opsiyonel* | Kullanıcının nota özel yazdığı JavaScript fonksiyonları (varsa `index.html`'e bağlanır). |
| `assets/` | *Opsiyonel* | Nota eklenen resimler, sesler, videolar veya belgeler. |

---

## 4. `metadata.json` Şeması

Tauri/Rust arka planının dosyaları hızla taraması, sol ağacı oluşturması ve arama indekslerini kurması için JSON formatı kullanılır:

```json
{
  "id": "3f6c2a9e-8b1d-4c57-9e0a-2d4b7f1c5e88",
  "title": "React Hooks Notları",
  "createdAt": "2026-03-15T09:30:00.000Z",
  "updatedAt": "2026-03-30T19:45:00.000Z",
  "isFavorite": false,
  "tags": ["react", "frontend", "javascript"],
  "hasCustomCss": true,
  "hasCustomJs": true
}
```

---

## 5. `index.html` Standardı ve Senkronizasyon

`index.html`, HTNote uygulamasından bağımsız olarak herhangi bir standart tarayıcıda (Chrome, Safari, Firefox) açıldığında da kusursuz çalışacak şekilde biçimlendirilir.

### Örnek `index.html` İçeriği:
```html
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!-- Metadata Eşleşmesi (Taşınabilirlik için) -->
  <title>React Hooks Notları</title>
  <meta name="htnote-created-at" content="2026-03-15T09:30:00.000Z">
  <meta name="htnote-updated-at" content="2026-03-30T19:45:00.000Z">
  <meta name="htnote-tags" content="react,frontend,javascript">
  
  <!-- Temel Varsayılan Stiller (Tarayıcıda düzgün görünmesi için) -->
  <style>
    body {
      font-family: var(--ht-font, system-ui, -apple-system, sans-serif);
      color: var(--ht-text, #222);
      background-color: var(--ht-bg, #fff);
      line-height: 1.6;
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem 1rem;
    }
    img { max-width: 100%; height: auto; border-radius: 8px; }
    audio { width: 100%; margin: 1rem 0; }
  </style>

  <!-- Varsa Nota Özel Stiller -->
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <!-- Görsel editörün düzenlediği bölge (D10) -->
  <main id="htnote-content">
    <h1>React Hooks Notları</h1>
    <p>React'ta hook kullanımı bileşen mantığını ayırmamıza yarar.</p>

    <!-- Medya Öğesi Örneği -->
    <img src="./assets/hook-flow.png" alt="Hook Akışı" />

    <!-- Ses Öğesi Örneği -->
    <audio controls src="./assets/anlatim.mp3"></audio>

    <!-- Not İçi Link Örneği (id tabanlı, D07) -->
    <p>Daha fazla detay için <a href="htnote://note/9a1b3c5d-0000-4000-8000-123456789abc">Rust Notuna Bak</a>.</p>
  </main>

  <!-- Varsa Nota Özel JavaScript -->
  <script src="./script.js"></script>
</body>
</html>
```

### Senkronizasyon Kuralı:
Not düzenleme modunda kaydedildiğinde:
1. `metadata.json` dosyası güncellenir.
2. `index.html` dosyasının `<head>` bloğundaki `<title>` ve `<meta name="htnote-...">` etiketleri otomatik olarak `metadata.json` ile senkronize edilir.

---

## 6. `.trash/` Yönetimi ve Kurtarma Mekanizması

1. **Silme İşlemi:** Kullanıcı bir notu sildiğinde ilgili not klasörü `Documents/HTNote/.trash/<NotAdi>__<yyyyMMdd-HHmmss>/` altına taşınır ve içine orijinal göreli yolu tutan `.htnote-trash.json` yazılır (D23).
2. **Kurtarma (Restore):** Not silinmeden önceki orijinal göreceli yoluna (relative path) tekrar taşınır.
3. **Kalıcı Temizleme:** Kullanıcı "Çöpü Boşalt" dediğinde `.trash/` altındaki tüm içerik işletim sistemi komutlarıyla güvenli şekilde silinir.
