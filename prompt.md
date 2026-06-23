Anda adalah senior backend engineer dan payment integration engineer.

**Repository yang Anda kerjakan sekarang:** folder aplikasi konsumen di bawah `D:/Coding/...` (Narraza, Siklusio, TEKAD, dll.) — **bukan** folder PayCore.

**Repository PayCore (dokumentasi & kontrak — baca di sini, jangan ubah kecuali ditugaskan di PayCore):**

```text
Path lokal (Windows):  D:/Coding/payment gateway
GitHub:                https://github.com/moxsenna/appvibe-paycore
Prompt ini:            D:/Coding/payment gateway/prompt.md
README PayCore:        D:/Coding/payment gateway/README.md
OpenAPI:               D:/Coding/payment gateway/docs/openapi.yaml
```

**Aturan path untuk agen:**

* Semua file di bagian §4 memakai path absolut `D:/Coding/payment gateway/...` — itu **satu-satunya** lokasi dokumen PayCore di mesin ini.
* Path `docs/...` di **repo aplikasi konsumen** (mis. `D:/Coding/narraza/docs/...`) hanya untuk dokumentasi **hasil integrasi** (§15), bukan dokumen PayCore.
* Jika workspace Anda hanya membuka repo aplikasi, tetap `read` file PayCore dengan path penuh di atas (atau clone ke `D:/Coding/payment gateway`).

Tugas Anda: integrasikan aplikasi dalam **repository aplikasi ini** dengan **AppVibe PayCore** sebagai satu-satunya pusat pembayaran.

Anda bekerja langsung dari repository aplikasi ini. Jangan meminta saya mengisi placeholder seperti nama aplikasi, app ID, prefix order, jenis produk, URL frontend, atau URL API. Audit repository terlebih dahulu dan turunkan seluruh informasi tersebut dari konfigurasi, README, package metadata, environment example, domain, deployment configuration, schema database, dan struktur kode yang tersedia.

Jika suatu informasi benar-benar belum ada atau tidak dapat disimpulkan dengan aman, jangan mengarang. Implementasikan bagian yang bisa dikerjakan secara aman, lalu laporkan data onboarding yang perlu didaftarkan ke PayCore.

---

# 1. Tujuan Integrasi

Aplikasi ini harus memakai PayCore untuk alur berikut:

```text
Aplikasi
→ meminta payment order ke PayCore
→ user diarahkan ke checkout Duitku
→ Duitku callback ke PayCore
→ PayCore memverifikasi pembayaran
→ PayCore mengirim event payment.succeeded ke aplikasi ini
→ aplikasi menjalankan fulfillment
```

Fulfillment berarti benefit produk yang dibeli user, misalnya:

* penambahan kredit AI;
* aktivasi lifetime access;
* pembukaan akses kursus atau LMS;
* aktivasi subscription;
* pembelian fitur premium;
* entitlement produk digital.

Tentukan jenis fulfillment dari logic dan model data aplikasi ini sendiri.

---

# 2. Larangan Keras

Aplikasi ini **tidak boleh**:

* terhubung langsung ke Duitku;
* menyimpan Duitku API key;
* menerima callback Duitku langsung;
* memanggil endpoint PayCore `/webhooks/duitku`;
* menaruh `PAYCORE_APP_SECRET` atau `PAYCORE_WEBHOOK_SECRET` di frontend/browser;
* memberi kredit, akses, subscription, atau entitlement hanya karena user kembali dari halaman pembayaran;
* mempercayai parameter URL, status frontend, screenshot pembayaran, atau request browser sebagai bukti pembayaran;
* membuat fulfillment tanpa transaction dan deduplication;
* mengubah repository, database, konfigurasi, atau deployment PayCore;
* mengubah environment production dalam tugas ini;
* menjalankan pembayaran asli/live dalam tugas ini.

Endpoint `/webhooks/duitku` hanya dipakai Duitku untuk mengirim callback ke PayCore.

---

# 3. Strategi Environment

Aplikasi harus mendukung dua environment pembayaran.

## Staging / Sandbox

Digunakan untuk development dan test.

```text
PAYCORE_BASE_URL=https://pay-staging.appvibe.biz.id
PAYCORE_ENVIRONMENT=staging
PAYMENT_MODE=sandbox
```

Staging hanya boleh memakai:

* PayCore staging;
* Duitku Sandbox;
* API staging;
* database staging;
* user test;
* kredensial staging;
* webhook secret staging.

## Production / Live

Harus disiapkan melalui konfigurasi dan dokumentasi, tetapi jangan diaktifkan, deploy, atau diuji dalam tugas ini.

```text
PAYCORE_BASE_URL=https://pay.appvibe.biz.id
PAYCORE_ENVIRONMENT=production
PAYMENT_MODE=live
```

Production nanti harus memakai:

* PayCore production;
* Duitku production;
* API production;
* database production;
* credential dan webhook secret production yang berbeda dari staging.

Default aman: bila environment atau credential tidak lengkap, payment harus nonaktif dan tidak boleh diam-diam memakai production.

---

# 4. Dokumentasi PayCore yang Harus Dibaca

## Lokasi tetap di disk (baca file ini dulu)

```text
D:/Coding/payment gateway/docs/integration-guide.md              ← MULAI DI SINI
D:/Coding/payment gateway/docs/integrating-new-app.md
D:/Coding/payment gateway/docs/app-authentication.md
D:/Coding/payment gateway/docs/payment-events.md
D:/Coding/payment gateway/docs/troubleshooting.md
D:/Coding/payment gateway/docs/staging-e2e-checklist.md
D:/Coding/payment gateway/docs/openapi.yaml
D:/Coding/payment gateway/docs/examples/generic-app-integration.md
D:/Coding/payment gateway/docs/examples/narraza-integration.md   ← jika app = Narraza
```

## Source of truth kode PayCore

```text
D:/Coding/payment gateway/src/lib/crypto.ts
D:/Coding/payment gateway/src/middleware/app-auth.ts
D:/Coding/payment gateway/src/schemas/order.ts
D:/Coding/payment gateway/src/services/fulfillment-service.ts
```

## Cara agen mengakses

1. **Workspace sama:** pastikan folder `D:/Coding/payment gateway` ada; gunakan tool `read` dengan path absolut di atas.
2. **Hanya repo aplikasi di `D:/Coding/<nama-app>`:** buka/read PayCore lewat path `D:/Coding/payment gateway/docs/...` (tidak perlu tebak path relatif).
3. **Mesin lain:** clone `https://github.com/moxsenna/appvibe-paycore.git` ke `D:/Coding/payment gateway` (atau sesuaikan root, tetapi **semua path di prompt ini mengacu ke `D:/Coding/payment gateway`**).

Gunakan dokumentasi dan implementasi PayCore aktual sebagai source of truth.

Jika folder `D:/Coding/payment gateway` tidak ada, clone dari GitHub lalu baca path di atas. Jika benar-benar tidak bisa, gunakan kontrak §8–10 prompt ini — jangan mengarang format yang bertentangan dengan file PayCore.

**Header event PayCore → aplikasi:** `X-PayCore-Event-Timestamp`, `X-PayCore-Event-Signature`; `event_id` / `event_type` di body JSON. Detail: `D:/Coding/payment gateway/docs/payment-events.md`.

---

# 5. Audit Repository Sebelum Mengubah Kode

Mulai dengan audit dan jelaskan secara singkat:

1. Nama aplikasi, domain, dan tujuan produk.
2. Stack frontend, backend, database, dan deployment.
3. URL staging dan production yang ditemukan.
4. Sistem authentication/user yang digunakan.
5. Model produk: kredit, lifetime access, subscription, LMS, atau lainnya.
6. Tabel atau model data yang relevan untuk payment, entitlement, subscription, atau credit ledger.
7. Apakah sudah ada integrasi payment lama yang perlu dihentikan atau diganti.
8. Apakah aplikasi sudah memiliki backend yang aman.
9. Endpoint API terbaik untuk membuat order.
10. Endpoint API terbaik untuk menerima event PayCore.
11. App ID dan order prefix yang paling masuk akal berdasarkan brand aplikasi.

Aturan untuk `app_id` dan `order_prefix`:

* Turunkan dari nama/brand aplikasi bila jelas.
* Gunakan `app_id` lowercase dengan dash bila perlu.
* Gunakan prefix tiga huruf uppercase bila belum ada.
* Jangan menganggap app sudah terdaftar di PayCore.
* Gunakan konfigurasi environment, jangan hardcode identitas tersebut dalam frontend.

Setelah audit, buat implementation plan singkat lalu langsung lanjutkan implementasi.

---

# 6. Konfigurasi Environment yang Harus Dibuat

Tambahkan atau perbarui environment example tanpa memasukkan secret asli.

Minimal konfigurasi:

```text
PAYCORE_BASE_URL=
PAYCORE_ENVIRONMENT=
PAYMENT_MODE=

PAYCORE_APP_ID=
PAYCORE_KEY_ID=
PAYCORE_APP_SECRET=
PAYCORE_WEBHOOK_SECRET=
PAYCORE_RETURN_URL=

PAYMENTS_ENABLED=
```

Buat contoh terpisah bila struktur proyek mendukung:

```text
.env.staging.example
.env.production.example
```

Aturan:

* `PAYCORE_APP_SECRET` dipakai aplikasi ini untuk menandatangani request ke PayCore.
* `PAYCORE_WEBHOOK_SECRET` dipakai aplikasi ini untuk memverifikasi event dari PayCore.
* Secret staging dan production harus berbeda.
* Tidak boleh ada nilai secret asli di repository.
* Bila secret belum tersedia, endpoint payment harus gagal secara jelas dan aman, bukan memakai credential dummy.

---

# 7. Onboarding Aplikasi ke PayCore

Aplikasi ini kemungkinan perlu didaftarkan terlebih dahulu di PayCore.

Turunkan dan laporkan data onboarding berikut dari repository:

```text
app_id
display_name
order_prefix
webhook_url
allowed_return_url
merchant_profile_id
```

Gunakan nilai konseptual berikut:

```text
webhook_url:
{API_STAGING_APLIKASI}/internal/payment-events

allowed_return_url:
{FRONTEND_STAGING_APLIKASI}/payment/return

merchant_profile_id:
appvibe_default
```

Jangan membuat credential PayCore palsu.

Implementasikan integrasi agar siap berjalan saat credential berikut diberikan oleh admin PayCore:

```text
PAYCORE_APP_ID
PAYCORE_KEY_ID
PAYCORE_APP_SECRET
PAYCORE_WEBHOOK_SECRET
```

---

# 8. Implementasi Create Payment Order

Buat endpoint backend internal aplikasi untuk memulai pembayaran.

Gunakan konvensi route proyek yang sudah ada. Bila belum ada pola, gunakan:

```text
POST /api/payments/create-order
```

Endpoint ini harus:

1. Memastikan user telah login.
2. Memvalidasi produk/paket yang dipilih.
3. Mengambil harga, jumlah kredit, durasi akses, benefit, dan metadata produk dari backend/database aplikasi.
4. Tidak mempercayai nominal, kredit, durasi, atau benefit dari frontend.
5. Membuat `external_order_id` unik milik aplikasi.
6. Membuat `Idempotency-Key` unik.
7. Menyimpan local pending order sebelum atau secara aman bersamaan dengan request ke PayCore.
8. Mengirim request server-to-server ke:

```text
POST {PAYCORE_BASE_URL}/v1/orders
```

9. Menandatangani request memakai HMAC.
10. Menyimpan relasi antara local order, `external_order_id`, dan `paycore_order_id`.
11. Mengembalikan hanya data aman ke frontend, termasuk `checkout_url`.

Frontend hanya boleh mengarahkan user ke `checkout_url`.

Frontend tidak boleh memanggil PayCore secara langsung.

## Kontrak Request ke PayCore

Header wajib:

```text
Content-Type: application/json
X-PayCore-App: {PAYCORE_APP_ID}
X-PayCore-Key-Id: {PAYCORE_KEY_ID}
X-PayCore-Timestamp: {ISO_TIMESTAMP}
X-PayCore-Signature: sha256={HMAC_SIGNATURE}
Idempotency-Key: {UNIQUE_KEY}
```

Canonical string untuk signature:

```text
{timestamp}.{method}.{path}.{sha256(raw_body)}
```

Signature:

```text
HMAC_SHA256(PAYCORE_APP_SECRET, canonical_string)
```

Gunakan raw JSON body yang benar-benar dikirim saat menghitung hash dan signature.

Contoh body yang harus disesuaikan dengan produk aplikasi:

```json
{
  "external_order_id": "app-order-unique-id",
  "merchant_profile_id": "appvibe_default",
  "product_key": "product-or-package-key",
  "description": "Nama produk atau paket",
  "amount": 99000,
  "currency": "IDR",
  "customer": {
    "name": "Customer Name",
    "email": "customer@example.com",
    "phone": "081234567890"
  },
  "return_url": "https://staging-app-domain/payment/return",
  "fulfillment_data": {
    "user_id": "authenticated-user-id",
    "product_key": "product-or-package-key"
  }
}
```

Jangan mengirim data sensitif berlebihan ke PayCore.

---

# 9. Database Lokal Payment dan Deduplication

Gunakan tabel yang sudah ada bila cocok. Bila belum ada, buat migration mengikuti konvensi database aplikasi ini.

Minimal harus ada data untuk menyimpan:

```text
local_payment_orders
- id
- user_id
- external_order_id
- paycore_order_id
- product_key
- amount
- currency
- payment_status
- fulfillment_status
- fulfilled_at
- created_at
- updated_at
```

Tambahkan mekanisme deduplication event:

```text
paycore_events
- event_id UNIQUE
- paycore_order_id UNIQUE
- event_type
- processed_at
- raw_payload
```

Nama tabel boleh disesuaikan dengan pola proyek, tetapi jaminan berikut wajib ada:

```text
Satu event_id hanya boleh diproses satu kali.
Satu paycore_order_id hanya boleh menghasilkan fulfillment satu kali.
```

Buat unique constraint yang benar pada level database, bukan hanya pengecekan aplikasi.

---

# 10. Implementasi Endpoint Event dari PayCore

Buat endpoint backend:

```text
POST /internal/payment-events
```

Endpoint ini khusus menerima event dari PayCore.

PayCore mengirim header (implementasi aktual):

```text
X-PayCore-Event-Timestamp: {ISO_TIMESTAMP}
X-PayCore-Event-Signature: sha256={HMAC_SIGNATURE}
Content-Type: application/json
```

`event_id` dan `event_type` ada di body JSON.

Canonical string untuk verifikasi signature:

```text
{timestamp}.{raw_json_body}
```

Signature:

```text
HMAC_SHA256(PAYCORE_WEBHOOK_SECRET, canonical_string)
```

Endpoint wajib:

1. Membaca raw body sebelum parse JSON.
2. Memverifikasi timestamp untuk mencegah replay attack.
3. Memverifikasi HMAC signature dengan timing-safe comparison.
4. Menolak signature atau timestamp invalid.
5. Memastikan `event_id` belum pernah diproses.
6. Memastikan `paycore_order_id` belum pernah dipakai untuk fulfillment.
7. Mencari local order yang sesuai.
8. Memastikan user, product key, amount, currency, dan benefit cocok dengan data local order.
9. Menjalankan fulfillment dan pencatatan event dalam satu database transaction atomic.
10. Menyimpan raw payload atau hash payload untuk audit.
11. Mengembalikan HTTP 200 hanya bila fulfillment sukses atau event tersebut memang sudah pernah diproses.
12. Mengembalikan error non-2xx untuk failure sementara agar PayCore dapat melakukan retry.

Jangan menganggap `fulfillment_data` dari event sebagai sumber kebenaran tunggal. Validasi terhadap local order dan konfigurasi produk aplikasi.

---

# 11. Aturan Fulfillment

Tentukan fulfillment sesuai aplikasi ini.

## Jika Produk Berupa Kredit

* Tambahkan kredit melalui ledger atomic.
* Gunakan reference unik:

```text
paycore:{paycore_order_id}
```

* Buat unique constraint pada reference tersebut.
* Jangan pernah menambah kredit langsung dari frontend.

## Jika Produk Berupa Lifetime Access

* Buat atau update entitlement satu kali.
* Jangan memperpanjang atau menggandakan entitlement pada event duplikat.

## Jika Produk Berupa Subscription

* Tentukan durasi dan expiry dari product configuration backend.
* Jangan mengambil expiry dari frontend.
* Pastikan renewal dan purchase awal dibedakan bila aplikasi mendukung keduanya.

## Jika Produk Berupa LMS atau Produk Digital

* Aktifkan akses course, membership, download, atau fitur sesuai product key.
* Simpan hubungan fulfillment dengan `paycore_order_id`.

Aturan universal:

```text
Satu PayCore order hanya boleh memberi benefit satu kali.
Return URL tidak boleh memberi benefit apa pun.
Event duplikat tidak boleh memberi benefit kedua.
```

---

# 12. Return Page dan Payment Status

Buat atau perbarui halaman:

```text
/payment/return
```

Halaman ini hanya untuk UX.

Saat user kembali dari checkout:

1. Ambil `order_id` dari URL.
2. Hubungi backend aplikasi sendiri.
3. Backend mengambil local payment status.
4. Bila perlu, backend dapat meminta status ke PayCore melalui API yang terdokumentasi.
5. Tampilkan status yang sesuai:

```text
Menunggu konfirmasi pembayaran
Pembayaran berhasil
Pembayaran gagal
Pembayaran kedaluwarsa
```

Halaman return tidak boleh mengubah entitlement atau kredit.

---

# 13. Jika Repository Ini Frontend-Only

Jika aplikasi tidak memiliki backend aman:

1. Jangan menaruh secret PayCore di browser.
2. Jangan membuat request browser langsung ke PayCore.
3. Tambahkan backend/payment service minimal mengikuti platform yang sudah dipakai aplikasi, misalnya Cloudflare Worker, server route, API route, atau backend existing.
4. Simpan secret hanya di server-side environment.
5. Jelaskan di laporan final arsitektur server-side yang dibuat.

---

# 14. Testing Wajib

Tambahkan atau perbarui test sesuai stack proyek.

Minimal uji:

1. User valid dapat membuat payment order.
2. Produk invalid ditolak.
3. Harga dari frontend tidak bisa dimanipulasi.
4. Idempotency key yang sama tidak membuat order lokal kedua.
5. Signature request aplikasi ke PayCore dibuat sesuai canonical format.
6. Signature event PayCore valid dapat diproses.
7. Signature event invalid ditolak.
8. Event dengan timestamp kadaluarsa ditolak.
9. Event payment.succeeded memberi benefit satu kali.
10. Event yang sama dikirim dua kali tidak memberi benefit kedua.
11. paycore_order_id yang sama tidak dapat fulfillment dua kali.
12. Return page tidak memberi benefit tanpa event dari PayCore.
13. Failure sementara pada endpoint webhook dapat dikembalikan sebagai non-2xx agar PayCore dapat retry.
14. Retry event tetap aman karena local deduplication.
15. Payment feature tidak aktif bila secret/config environment belum lengkap.

Jalankan seluruh quality gate repository, minimal yang relevan:

```bash
npm run typecheck
npm test
npm run lint
```

Gunakan command setara bila proyek ini bukan Node.js.

---

# 15. Dokumentasi yang Harus Dibuat di Repository Ini

Path di bawah ini relatif terhadap **repository aplikasi konsumen** (bukan PayCore):

```text
docs/paycore-integration.md
docs/payment-flow.md
docs/paycore-production-cutover.md
.env.example
```

Dokumentasi harus menjelaskan:

1. Tujuan PayCore.
2. Alur payment aplikasi ini.
3. Environment variable tanpa secret asli.
4. Cara membuat payment order.
5. Cara menerima dan memverifikasi payment event.
6. Cara mencegah double fulfillment.
7. Cara testing staging.
8. Cara troubleshooting.
9. Perbedaan staging dan production.
10. Production cutover checklist.

Production cutover checklist minimal harus mencakup:

```text
- Staging E2E lulus.
- Payment callback sandbox berhasil.
- Callback duplikat aman.
- Retry event gagal berhasil diuji.
- Webhook production aplikasi memakai HTTPS.
- Aplikasi sudah didaftarkan di PayCore production.
- Credential production berbeda dari staging.
- PayCore production health check lulus.
- Approval eksplisit diberikan sebelum PAYMENT_MODE=live.
```

Jangan menjalankan checklist production tersebut sekarang.

---

# 16. Batas Pekerjaan

Dalam tugas ini:

* implementasikan integrasi aplikasi agar siap untuk staging;
* siapkan konfigurasi dan dokumentasi production;
* jangan mengaktifkan production;
* jangan melakukan Duitku production payment;
* jangan mengubah PayCore;
* jangan mengklaim E2E berhasil sebelum benar-benar diuji menggunakan Duitku Sandbox dan PayCore staging.

---

# 17. Laporan Akhir

Saat selesai, berikan laporan dengan format:

```text
1. Hasil audit aplikasi
2. App ID dan order prefix yang direkomendasikan
3. Data onboarding yang perlu didaftarkan ke PayCore
4. Ringkasan integrasi yang dibuat
5. File yang diubah
6. Migration database yang dibuat
7. Endpoint yang dibuat atau diubah
8. Environment variable yang wajib diset
9. Cara menjalankan test lokal
10. Hasil typecheck, test, dan lint
11. Checklist E2E staging untuk owner
12. Hal yang belum dapat diuji karena credential/onboarding belum tersedia
13. Langkah production cutover yang sengaja belum dilakukan
14. Risiko atau edge case yang tersisa
```

Jangan mengklaim integrasi live, payment sukses, atau fulfillment berhasil sebelum E2E staging benar-benar dibuktikan.
