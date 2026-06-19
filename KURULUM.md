# Piyasa Terminali Kurulum Kılavuzu

Bu paket GitHub deposunun ana dizinine koyulacak şekilde hazırlandı. Ana giriş dosyasının adı kesinlikle `index.html` olmalı.

## 1. GitHub dosyalarını değiştir

1. GitHub deponu aç.
2. Eski uygulama dosyalarını kaldır veya bu paketteki dosyalarla değiştir.
3. Aşağıdaki dosya ve klasörlerin depo ana dizininde olduğundan emin ol:
   - `index.html`
   - `api/report.js`
   - `api/scheduled-report.js`
   - `package.json`
   - `vercel.json`
   - `supabase.sql`
   - `.gitignore`
   - `KURULUM.md`
4. Dosyayı yanlışlıkla `index(1).html`, `index(2).html` veya `index(3).html` adıyla yükleme. Vercel ana sayfayı yalnızca `index.html` olarak bekler.
5. Değişiklikleri commit et. Vercel GitHub deposuna bağlıysa commit sonrasında otomatik yayın başlar.

## 2. Vercel Environment Variables

Dünya Raporu tarayıcıdan değil, Vercel Serverless Function üzerinden üretilir. Bu yüzden OpenAI anahtarı GitHub'a yazılmaz.

1. Vercel Dashboard'a gir.
2. İlgili projeyi aç.
3. `Settings` menüsüne gir.
4. `Environment Variables` ekranını aç.
5. `Name` alanına `OPENAI_API_KEY` yaz.
6. `Value` alanına kendi OpenAI API anahtarını gir.
7. `Production`, `Preview` ve gerekiyorsa `Development` ortamlarını seç.
8. `Save` düğmesine bas.
9. İsteğe bağlı olarak `OPENAI_MODEL` ekleyebilirsin. Boş bırakırsan uygulama varsayılan modeli kullanır.
10. Environment Variable ekledikten sonra yeni deployment gerekir. Vercel genelde sonraki commit ile otomatik yayınlar; gerekirse `Deployments` ekranından son deployment için `Redeploy` kullan.

Not: Vercel dokümanına göre environment variable değişiklikleri eski deployment'lara uygulanmaz; yeni deployment gerekir.

## 3. Supabase kurulumu

1. Supabase Dashboard'da projenizi aç.
2. `SQL Editor` ekranına gir.
3. `New query` oluştur.
4. Bu paketteki `supabase.sql` dosyasının tamamını yapıştır.
5. `Run` düğmesine bas.

Bu SQL şunları kurar:

- `public.watchlists` tablosu
- Kullanıcı bazlı Row Level Security politikaları
- `updated_at` güncelleme tetikleyicisi
- Realtime yayını için tablo ayarı

Uygulama içindeki Supabase alanlarına şunları gir:

1. `Project URL`: Supabase projesindeki URL.
2. `Publishable key`: Supabase Dashboard içinde `Settings > API Keys` bölümündeki publishable key. Eski projelerde client tarafı için `anon` key kullanılabilir.

Secret key veya service role key kullanma. Bunlar tarayıcıya yazılmamalı.

## 4. Finnhub API anahtarı

1. [Finnhub](https://finnhub.io/) hesabı oluştur.
2. Dashboard içinden API anahtarını al.
3. Uygulamada `Piyasa İzleme > Finnhub > API anahtarı` alanına gir.
4. `Kaydet` düğmesine bas.

Finnhub anahtarı kullanıcının tarayıcısındaki `localStorage` alanında saklanır. Kaynak koda gömülmez.

## 5. Uygulamayı kullanma

- `Piyasa İzleme`: Sembol ekle, sil, yukarı/aşağı taşı veya sürükle. `Fiyatları yenile` düğmesi Finnhub üzerinden güncel fiyatları alır.
- `AI Radar`: Aday listesini tarar, skor üretir ve öne çıkan sembolleri izleme listesine tek düğmeyle ekler.
- `Dünya Raporu`: `/api/report` Vercel fonksiyonu OpenAI ve web aramasıyla güncel, kaynaklı rapor üretir. Başarısız olursa son başarılı rapor tarayıcıda gösterilir.

## 6. Güvenlik notları

- GitHub'a gerçek API anahtarı yazma.
- `.env` dosyaları `.gitignore` içinde tutulur.
- Supabase tarafında RLS açık kalmalı.
- Uygulamaya yalnızca Supabase publishable/anon key girilmeli.
- OpenAI anahtarı yalnızca Vercel Environment Variables içinde tutulmalı.

## 7. Yerel kontrol

Sözdizimi kontrolü için:

```bash
npm run check
```

Vercel fonksiyonlarını yerelde denemek için Vercel CLI gerekir:

```bash
npx vercel dev
```

Yerel testte de OpenAI anahtarını `.env` dosyasına koyabilirsin; `.env` GitHub'a gönderilmez.
