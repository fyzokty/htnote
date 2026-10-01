# Güvenlik

## Tehdit modeli

Not paketleri kullanıcı JavaScript'i içerebilir. Kötü niyetli bir not, kendi iframe'inde script çalıştırabilir, diğer notlarla veri paylaşmayı deneyebilir veya ana uygulamaya sahte köprü mesajları gönderebilir.

## İzolasyon

Notlar ana uygulamanın DOM'una eklenmez; `127.0.0.1` üzerinde rastgele porttan sunulan ayrı HTTP origin'inden sandbox'lı iframe içinde yüklenir. Tauri kayıtlı özel şemaları yerel saydığı için notlar özel protokolden sunulmaz. `main` capability'si yalnızca ana pencereye ve uygulamanın kendi origin'ine uygulanır; not origin'ine veya uzak URL'lere IPC izni verilmez. Sunucu yalnızca loopback'e bağlanır ve Host başlığını tam eşleşmeyle denetler. Köprü mesajları ana uygulamada doğrulanmalıdır.

## Kabul edilen riskler

- Bütün notlar aynı origin'i paylaşır. Bir notun script'i başka bir notun dosyalarını isteyebilir ve `localStorage` alanını paylaşır.
- Diğer yerel süreçler ve tarayıcı sayfaları loopback sunucusuna erişebilir. Rastgele port, Host denetimi ve UUID v4 not kimlikleri bu riski sınırlar.
- Kötü niyetli not, köprü mesajlarını taklit edebilir. Ana uygulama mesajları güvenilmez girdi olarak ele almalıdır.
- T703 kapsamında eklenecek gizli PDF penceresi ayrı ve izinsiz bir capability alacaktır.

## Güvenlik açığı bildirimi

Güvenlik açığı ve yeniden üretme adımlarını herkese açık issue'da paylaşmayın. Depo barındırıcısının özel güvenlik bildirimi (Security Advisory) kanalından bakımcıya iletin; bu kanal yoksa bakımcıyla özel iletişim kurun.
