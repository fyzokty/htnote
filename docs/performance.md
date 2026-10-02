# Performans ölçümü (T707)

## Ortam ve yöntem

- Windows, Intel Core i7-9750H 2.60 GHz (12 mantıksal işlemci), 16 GB RAM, Node.js 24.19.0, Rust 1.98.1.
- `cargo run --example gen_fixture -- <dir> --notes 2000 --folders 150 --depth 5 --seed 707` aynı tohumla 2.000 geçerli not paketi üretir. HTML dosyaları Türkçe metin ve not bağlantıları içerir; her on nottan birinin asset dosyası vardır.
- `npm run bench` geçici dizinde aynı tohumla veri setini üretir, release Rust zamanlamalarını ve ayrı Vitest/jsdom ağaç render testini çalıştırır; geçici dizin test sonunda silinir. Rust ölçümleri dosya önbelleği sıcak olabileceği için ilk soğuk açılışı temsil etmez. jsdom ölçümü gerçek WebView yerleşim/çizim süresini temsil etmez.
- `get_note_tree` ölçümü, komutun kullandığı `scan_and_replace` yolunu ve ardından ağaç JSON serileştirmesini kapsar. Tauri IPC aktarım maliyeti ölçülmemiştir.
- İlk çalıştırmada arama ve bağlantı indeksleme süresinin hedefin üzerinde kalması üzerine, arama sonucunda snippet üretiminin yalnızca döndürülen sayfaya sınırlandırılması, Türkçe harf küçültme (`tr_fold`) işlemindeki karakter başı yığın tahsislerinin ve `extract_text` içindeki ara `Vec` tahsislerinin kaldırılması, statik CSS seçici önbelleklemesi ve `extract_links` için bağlantı varlığı ön kontrolü uygulandı. Yeniden ölçülen indeks kurulumu 1.479 ms'dir.

| İşlem | Hedef | Ölçüm |
| --- | ---: | ---: |
| Tam tarama | < 1.000 ms | 960 ms |
| Arama ve bağlantı indeksi kurulumu | < 3.000 ms | 1.479 ms |
| `search_notes` sorguları | < 50 ms | p50: 5,38–16,97 ms, maks: 5,69–17,06 ms ("İstanbul" 12,78 ms, "yazılım" 16,97 ms, "araştırması" 15,00 ms, bulunmayan 5,38 ms) |
| `get_note_tree` komut eşdeğeri + serileştirme + ilk render | < 300 ms | Yeniden tarama ve indeks farkı: 776,53 ms; serileştirme: 0,90 ms (519 KB); jsdom kapalı render: 202,38 ms; toplam yaklaşık 979,81 ms. Tümü açık render: 1.462,41 ms. IPC hariç. |
| Boşta CPU | ≈ %0 | Otomatik ölçülmedi; aşağıdaki manuel yöntem gerekir. |
| Rust bellek | < 150 MB | Otomatik ölçülmedi; aşağıdaki manuel yöntem gerekir. |

CPU ve bellek için uygulamayı release derlemede 2.000 notlu kökle açın; indeksleme bittikten sonra Windows Görev Yöneticisi'nde işlemin 60 saniyelik boşta CPU ortalamasını ve bellek kullanımını kaydedin. Bu metrikler benchmark işleminden güvenilir biçimde çıkarılamaz.

`get_note_tree` toplamı 300 ms hedefini aşar; ölçümün 776,53 ms'si tazelik için yapılan disk taramasına aittir. Varsayılan kapalı ağaç render süresi tek başına hedefin altındadır. jsdom sentetik testinde 2.150 satırın tümü açıkken render 1.462,41 ms sürer; jsdom testi gerçek WebView yerleşimini ve GPU çizimini ölçmediği, sanallaştırma da `@dnd-kit` sürükle-bırak ve klavye odağı DOM ağacını etkileyeceği için sanallaştırma kararı gerçek WebView profil sonuçlarına bırakılmıştır.
