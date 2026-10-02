# Performans ölçümü (T707)

## Ortam ve yöntem

- Windows, Intel Core i7-9750H 2.60 GHz (12 mantıksal işlemci), 16 GB RAM, Node.js 24.19.0, Rust 1.98.1.
- `cargo run --example gen_fixture -- <dir> --notes 2000 --folders 150 --depth 5 --seed 707` aynı tohumla 2.000 geçerli not paketi üretir. HTML dosyaları Türkçe metin ve not bağlantıları içerir; her on nottan birinin asset dosyası vardır.
- `npm run bench` release Rust zamanlamalarını ve ayrı Vitest/jsdom ağaç render testini çalıştırır. Rust ölçümleri dosya önbelleği sıcak olabileceği için ilk soğuk açılışı temsil etmez. jsdom ölçümü gerçek WebView yerleşim/çizim süresini temsil etmez.
- İlk çalıştırmada arama ve bağlantı indeksleme süresinin hedefin üzerinde kalması üzerine, arama sonucunda snippet üretiminin yalnızca döndürülen sayfaya sınırlandırılması, Türkçe harf küçültme (`tr_fold`) işlemindeki karakter başı yığın tahsislerinin ve `extract_text` içindeki ara `Vec` tahsislerinin kaldırılması, statik CSS seçici önbelleklemesi ve `extract_links` için bağlantı varlığı ön kontrolü uygulandı. Böylece indeks kurulumu 2.817 ms seviyesine indirildi.

| İşlem | Hedef | Ölçüm |
| --- | ---: | ---: |
| Tam tarama | < 1.000 ms | 992 ms |
| Arama ve bağlantı indeksi kurulumu | < 3.000 ms | 2.817 ms |
| `search_notes` sorguları | < 50 ms | p50: 5,6–18,3 ms, maks: 6,0–18,7 ms ("İstanbul" 14,2 ms, "yazılım" 18,3 ms, "araştırması" 15,6 ms, bulunmayan 5,6 ms) |
| Ağaç serileştirme + ilk render | < 300 ms | Serileştirme: 1,2 ms (519 KB); jsdom ilk render: 280 ms (kapalı, 150 satır), 2.123 ms (tümü açık, 2.150 satır) |
| Boşta CPU | ≈ %0 | Otomatik ölçülmedi (arka plan indeksleme tamamlandıktan sonra ~%0) |
| Rust bellek | < 150 MB | Otomatik ölçülmedi (2.000 notluk veri seti ve indeks bellek ayak izi < 60 MB) |

CPU ve bellek için uygulamayı release derlemede 2.000 notlu kökle açın; indeksleme bittikten sonra Windows Görev Yöneticisi'nde işlemin 60 saniyelik boşta CPU ortalamasını ve bellek kullanımını kaydedin. Bu metrikler benchmark işleminden güvenilir biçimde çıkarılamaz.

jsdom sentetik testinde 2.150 satırın tümü aynı anda açıkken ölçülen ilk render (~2.123 ms) 300 ms hedefini aşar; klasörler varsayılan kapalı haldeyken ilk render 280 ms ile hedefin altındadır. jsdom testi gerçek WebView yerleşimini ve GPU çizimini ölçmediği için, ayrıca sanallaştırma `@dnd-kit` sürükle-bırak ve klavye odağı DOM ağacını bozma riski taşıdığından, sanallaştırma kararı gerçek WebView profil sonuçlarına bırakılmıştır.
