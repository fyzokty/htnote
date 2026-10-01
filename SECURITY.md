# Güvenlik

## Tehdit modeli

Not paketleri kullanıcı JavaScript'i içerebilir. Kötü niyetli bir not, kendi iframe'inde script çalıştırabilir, diğer notlarla veri paylaşmayı deneyebilir veya ana uygulamaya sahte köprü mesajları gönderebilir.

## İzolasyon

Notlar ana uygulamanın DOM'una eklenmez; ayrı `htnote-note` origin'inden sandbox'lı iframe içinde yüklenir. `main` capability'si yalnızca ana pencereye ve uygulamanın kendi origin'ine uygulanır; not origin'ine veya uzak URL'lere IPC izni verilmez. Ana uygulamanın CSP'si script, bağlantı ve iframe kaynaklarını sınırlar. Köprü mesajları yalnızca istektir; yetkili işlem sayılmaz ve ana uygulamada doğrulanmalıdır.

## Kabul edilen riskler

- Bütün notlar aynı origin'i paylaşır. Bir notun script'i başka bir notun dosyalarını isteyebilir ve `localStorage` alanını paylaşır.
- Kötü niyetli not, köprü mesajlarını taklit edebilir. Ana uygulama mesajları güvenilmez girdi olarak ele almalıdır.
- T703 kapsamında eklenecek gizli PDF penceresi ayrı ve izinsiz bir capability alacaktır.

## Güvenlik açığı bildirimi

Güvenlik açığı ve yeniden üretme adımlarını herkese açık issue'da paylaşmayın. Depo barındırıcısının özel güvenlik bildirimi (Security Advisory) kanalından bakımcıya iletin; bu kanal yoksa bakımcıyla özel iletişim kurun.
