# PRD — AppVibe PayCore

## Centralized Payment Callback & Payment Orchestration Hub

**Produk:** AppVibe PayCore
**Domain produksi:** `https://pay.appvibe.biz.id`
**Domain staging:** `https://pay-staging.appvibe.biz.id`
**Versi dokumen:** 1.0
**Tanggal:** 23 Juni 2026
**Status:** Ready for implementation
**Integrasi pertama:** Narraza
**Provider MVP:** Duitku
**Provider berikutnya:** Mayar, Xendit, Midtrans, Tripay, atau provider lain melalui adapter

---

# 1. Ringkasan Produk

AppVibe PayCore adalah layanan payment orchestration terpusat untuk seluruh aplikasi milik AppVibe.

PayCore menjadi satu-satunya sistem yang menerima callback dari payment gateway, memverifikasi pembayaran, mencatat transaksi, mencegah callback ganda, lalu meneruskan event pembayaran ke aplikasi pemilik transaksi.

Seluruh aplikasi AppVibe tidak lagi perlu memiliki callback URL, logic verifikasi signature, retry webhook, log pembayaran, dan routing payment gateway sendiri-sendiri.

Contoh aplikasi yang dapat menggunakan PayCore:

* Narraza
* Siklusio
* LMS TEKAD
* Subscription Tracker
* Produk Gemini Canvas/AppVibe berikutnya
* SaaS client atau white-label product di masa depan

---

# 2. Masalah yang Diselesaikan

Saat setiap aplikasi mengelola payment callback sendiri, muncul beberapa masalah:

1. Logic payment gateway berulang di setiap repository.
2. Callback URL berbeda-beda dan sulit dipantau.
3. Risiko signature verification tidak konsisten.
4. Risiko double credit atau double activation saat callback dikirim ulang.
5. Sulit melakukan audit pembayaran lintas produk.
6. Sulit menambahkan provider baru tanpa mengubah banyak aplikasi.
7. Sulit melakukan retry apabila aplikasi tujuan sedang down.
8. Data transaksi tersebar di banyak database.
9. Sulit membuat dashboard finance dan reconciliation global.

PayCore menyelesaikan masalah tersebut dengan pola:

```text
Payment Gateway
      ↓
pay.appvibe.biz.id
      ↓
Payment Hub
      ↓
Aplikasi pemilik transaksi
      ↓
Kredit / akses / subscription / invoice fulfillment
```

---

# 3. Tujuan Produk

## 3.1 Tujuan Utama

1. Menyediakan satu callback domain untuk seluruh aplikasi AppVibe.
2. Memastikan callback payment gateway diverifikasi secara aman.
3. Menyediakan routing transaksi berdasarkan aplikasi pemilik order.
4. Menjamin fulfillment tidak terjadi dua kali.
5. Menyediakan event delivery dan retry otomatis ke aplikasi tujuan.
6. Menyediakan audit trail lengkap untuk setiap transaksi.
7. Mempermudah penambahan payment gateway baru.
8. Menjadi fondasi dashboard transaksi AppVibe di masa depan.

## 3.2 Target Keberhasilan

| Metrik                              |                            Target |
| ----------------------------------- | --------------------------------: |
| Callback payment tercatat           |                              100% |
| Double fulfillment                  |                                 0 |
| Callback invalid diproses           |                                 0 |
| Payment event berhasil diteruskan   |                              >99% |
| Retry event gagal                   |                          Otomatis |
| Waktu respon callback gateway       |                          <3 detik |
| Waktu pembayaran sampai fulfillment |     <30 detik pada kondisi normal |
| Auditability transaksi              | 100% transaksi memiliki event log |

---

# 4. Keputusan Arsitektur

## 4.1 Domain

```text
Production
https://pay.appvibe.biz.id

Staging
https://pay-staging.appvibe.biz.id
```

## 4.2 Callback URL Provider

Setiap provider memiliki endpoint sendiri, tetapi semua aplikasi memakai domain yang sama.

```text
POST https://pay.appvibe.biz.id/webhooks/duitku
POST https://pay.appvibe.biz.id/webhooks/mayar
POST https://pay.appvibe.biz.id/webhooks/xendit
POST https://pay.appvibe.biz.id/webhooks/midtrans
```

Tidak menggunakan callback URL berbeda untuk Narraza, Siklusio, TEKAD, atau aplikasi lainnya.

## 4.3 Stack Teknis

| Layer                      | Teknologi                           |
| -------------------------- | ----------------------------------- |
| Edge API                   | Cloudflare Workers                  |
| API framework              | Hono + TypeScript                   |
| Database transaksi         | Supabase PostgreSQL                 |
| Database transaction logic | Supabase RPC / PostgreSQL functions |
| Queue event                | Cloudflare Queues                   |
| Retry scheduler            | Cloudflare Cron Trigger             |
| Secret management          | Cloudflare Worker Secrets           |
| Observability              | Cloudflare Logs + Sentry            |
| Admin protection           | Cloudflare Access                   |
| API documentation          | OpenAPI / Swagger                   |

## 4.4 Prinsip Utama

1. Payment Hub tidak mengaktifkan kredit atau subscription secara langsung.
2. Aplikasi pemilik order tetap mengelola logic bisnisnya sendiri.
3. Payment Hub hanya mengelola payment lifecycle, verification, routing, logging, dan retry.
4. Semua callback gateway harus idempotent.
5. Semua internal event ke aplikasi harus idempotent.
6. Return URL pengguna tidak pernah dianggap sebagai bukti pembayaran.
7. Callback server-to-server adalah satu-satunya sumber kebenaran pembayaran.

---

# 5. Scope MVP

## 5.1 Termasuk Dalam MVP

* Registrasi aplikasi internal.
* Registrasi merchant account/provider profile.
* Pembuatan payment order.
* Pembuatan transaksi Duitku.
* Callback endpoint Duitku terpusat.
* Signature verification Duitku.
* Idempotency callback.
* Penyimpanan payment event mentah.
* Update status order secara atomik.
* Dispatch event internal ke aplikasi tujuan.
* Retry event delivery.
* Dead-letter queue untuk event gagal.
* Endpoint cek status payment.
* Redirect return URL ke aplikasi asal.
* Basic internal admin API.
* Audit log transaksi.
* Reconciliation sederhana.
* Integrasi penuh Narraza sebagai aplikasi pertama.

## 5.2 Tidak Termasuk Dalam MVP

* Marketplace multi-vendor.
* Split payment.
* Escrow.
* Refund otomatis ke payment provider.
* Subscription billing otomatis recurring.
* Invoice pajak.
* Affiliate commission otomatis.
* Dashboard finance visual lengkap.
* Multi-currency.
* Payment link publik tanpa aplikasi asal.
* Metode pembayaran luar negeri.
* Top-up wallet internal lintas aplikasi.
* Customer support portal publik.

---

# 6. Aktor Sistem

| Aktor              | Peran                                                    |
| ------------------ | -------------------------------------------------------- |
| Customer           | Membayar produk melalui payment gateway                  |
| Aplikasi AppVibe   | Membuat order dan menerima event pembayaran              |
| Payment Gateway    | Mengirim invoice/payment link dan callback               |
| PayCore            | Memverifikasi, mencatat, routing, dan retry event        |
| Admin AppVibe      | Memantau transaksi, retry fulfillment, investigasi error |
| Developer aplikasi | Mengintegrasikan aplikasi ke PayCore                     |

---

# 7. Konsep Inti

## 7.1 App

Setiap produk yang memakai PayCore harus terdaftar sebagai app.

Contoh:

```text
narraza
siklusio
tekad-lms
subscription-tracker
```

Setiap app memiliki:

```text
app_id
display_name
order_prefix
webhook_url
webhook_secret
allowed_return_urls
status
```

Contoh:

```text
app_id: narraza
display_name: Narraza
order_prefix: NAR
webhook_url: https://api.narraza.web.id/internal/payment-events
allowed_return_urls:
  - https://app.narraza.web.id/payment/return
status: active
```

## 7.2 Merchant Profile

Merchant profile adalah akun payment gateway yang dipakai untuk memproses pembayaran.

Contoh awal:

```text
merchant_profile_id: appvibe_default
provider: duitku
merchant_code: APPVIBE_MAIN
credential_ref: DUITKU_APPVIBE_MAIN
currency: IDR
status: active
```

Credential asli tidak boleh disimpan dalam database.

Credential hanya disimpan dalam Cloudflare Worker Secrets.

## 7.3 Global Order ID

PayCore menghasilkan order ID global yang unik.

Format:

```text
{PREFIX}-{YYYYMMDD}-{RANDOM}
```

Contoh:

```text
NAR-20260623-8H2KQ
SIK-20260623-K9P1M
TEK-20260623-X4A7B
```

Aplikasi tidak boleh menghasilkan merchant order ID sendiri.

Aplikasi hanya boleh mengirim `external_order_id` atau `app_order_id` sebagai referensi internal.

## 7.4 Payment Status

```text
created
pending
paid
failed
expired
cancelled
refunded
manual_review
```

## 7.5 Fulfillment Status

```text
not_required
pending
queued
processing
delivered
failed
manual_review
```

Payment status dan fulfillment status harus dipisahkan.

Contoh:

```text
payment_status: paid
fulfillment_status: failed
```

Artinya customer sudah membayar, tetapi aplikasi tujuan belum berhasil menerima fulfillment event.

---

# 8. User Flow Utama

## 8.1 Flow Pembuatan Pembayaran

```text
Customer klik beli paket
      ↓
Aplikasi backend membuat payment order ke PayCore
      ↓
PayCore membuat global order ID
      ↓
PayCore membuat transaksi ke Duitku
      ↓
Duitku mengembalikan payment URL
      ↓
PayCore mengembalikan checkout URL ke aplikasi
      ↓
Aplikasi membuka payment page untuk customer
```

## 8.2 Flow Callback Pembayaran

```text
Customer menyelesaikan pembayaran
      ↓
Duitku mengirim callback ke PayCore
      ↓
PayCore memverifikasi signature
      ↓
PayCore memverifikasi merchant order ID
      ↓
PayCore memverifikasi nominal pembayaran
      ↓
PayCore menyimpan webhook event
      ↓
PayCore mengubah status menjadi paid
      ↓
PayCore membuat internal event payment.succeeded
      ↓
Cloudflare Queue meneruskan event ke aplikasi tujuan
      ↓
Aplikasi menjalankan fulfillment
      ↓
Aplikasi mengembalikan response sukses
      ↓
PayCore menandai fulfillment delivered
```

## 8.3 Flow Callback Ganda

```text
Duitku mengirim callback pertama
      ↓
PayCore memproses transaksi
      ↓
Narraza menambah kredit
      ↓
Duitku mengirim callback kedua
      ↓
PayCore mendeteksi event duplikat
      ↓
Tidak membuat fulfillment baru
      ↓
Tidak menambah kredit kedua kali
```

## 8.4 Flow Aplikasi Tujuan Down

```text
Payment callback diterima PayCore
      ↓
Payment status menjadi paid
      ↓
PayCore mencoba mengirim event ke aplikasi
      ↓
Aplikasi tujuan timeout / error
      ↓
PayCore menyimpan kegagalan
      ↓
Event masuk retry queue
      ↓
PayCore mengulang pengiriman
      ↓
Fulfillment sukses atau masuk manual review
```

---

# 9. Functional Requirements

## FR-001 — App Registration

Sistem harus dapat membuat dan mengelola aplikasi internal.

Data minimum:

```text
app_id
display_name
order_prefix
webhook_url
webhook_secret_ref
allowed_return_urls
default_merchant_profile_id
status
created_at
updated_at
```

Aturan:

* `app_id` harus unik.
* `order_prefix` harus unik.
* `webhook_url` wajib HTTPS.
* `return_url` harus berasal dari domain yang terdaftar.
* Aplikasi nonaktif tidak dapat membuat order baru.
* Aplikasi nonaktif tetap dapat menerima event lama bila diperlukan.

---

## FR-002 — Payment Order Creation

Aplikasi harus dapat membuat payment order melalui API PayCore.

Endpoint:

```http
POST /v1/orders
```

Header:

```http
X-PayCore-App: narraza
X-PayCore-Key-Id: pk_live_narraza_01
X-PayCore-Timestamp: 2026-06-23T15:00:00Z
X-PayCore-Signature: sha256=...
Idempotency-Key: 7d4d65e4-2d34-4f1d-8e52-8eb60ab9fadb
Content-Type: application/json
```

Contoh request:

```json
{
  "external_order_id": "narraza-order-000123",
  "merchant_profile_id": "appvibe_default",
  "product_key": "credit_pack_25000",
  "description": "Narraza Credit Pack 25.000",
  "amount": 99000,
  "currency": "IDR",
  "customer": {
    "name": "Customer Name",
    "email": "customer@example.com",
    "phone": "081234567890"
  },
  "return_url": "https://app.narraza.web.id/payment/return",
  "fulfillment_data": {
    "user_id": "user_uuid",
    "package_id": "credit_pack_25000",
    "credits": 25000
  }
}
```

Contoh response:

```json
{
  "order_id": "NAR-20260623-8H2KQ",
  "external_order_id": "narraza-order-000123",
  "payment_status": "pending",
  "fulfillment_status": "pending",
  "provider": "duitku",
  "checkout_url": "https://sandbox.duitku.com/...",
  "expires_at": "2026-06-24T15:00:00Z"
}
```

Aturan:

* Request payment hanya boleh berasal dari backend aplikasi.
* Frontend tidak boleh memiliki API key atau secret PayCore.
* `Idempotency-Key` wajib.
* Request yang sama dengan idempotency key yang sama harus mengembalikan order yang sama.
* Amount tidak dapat diubah setelah order dibuat.
* Return URL harus diverifikasi terhadap allowlist aplikasi.
* Customer data harus diminimalkan dan dienkripsi bila disimpan.

---

## FR-003 — Duitku Callback Endpoint

Endpoint:

```http
POST /webhooks/duitku
```

PayCore harus:

1. Menerima raw payload dari Duitku.
2. Memverifikasi signature sesuai dokumentasi Duitku.
3. Mengidentifikasi order melalui `merchantOrderId`.
4. Memastikan order benar-benar ada.
5. Memastikan merchant profile cocok.
6. Memastikan nominal callback cocok dengan order.
7. Memastikan currency cocok.
8. Mendeteksi callback duplikat.
9. Menyimpan raw event dan hash payload.
10. Mengubah status transaksi dalam satu database transaction.
11. Membuat event internal bila pembayaran berhasil.
12. Mengembalikan response yang sesuai kebutuhan provider.

Callback invalid tidak boleh mengubah status transaksi.

---

## FR-004 — Internal Payment Event Delivery

PayCore harus mengirim event ke aplikasi pemilik order.

Endpoint tujuan ditentukan dari konfigurasi app:

```text
https://api.narraza.web.id/internal/payment-events
```

Header event:

```http
X-PayCore-Event: payment.succeeded
X-PayCore-Event-Id: evt_01J...
X-PayCore-Timestamp: 2026-06-23T15:00:00Z
X-PayCore-Signature: sha256=...
Content-Type: application/json
```

Format signature:

```text
HMAC_SHA256(
  webhook_secret,
  "{timestamp}.{raw_json_body}"
)
```

Contoh payload event:

```json
{
  "event_id": "evt_01J...",
  "event_type": "payment.succeeded",
  "occurred_at": "2026-06-23T15:00:00Z",
  "data": {
    "order_id": "NAR-20260623-8H2KQ",
    "external_order_id": "narraza-order-000123",
    "app_id": "narraza",
    "provider": "duitku",
    "provider_reference": "DUITKU-REFERENCE-123",
    "amount": 99000,
    "currency": "IDR",
    "payment_status": "paid",
    "product_key": "credit_pack_25000",
    "fulfillment_data": {
      "user_id": "user_uuid",
      "package_id": "credit_pack_25000",
      "credits": 25000
    }
  }
}
```

Aplikasi tujuan wajib:

1. Memverifikasi signature PayCore.
2. Memverifikasi timestamp maksimal 5 menit.
3. Menyimpan `event_id` untuk deduplication.
4. Menjalankan fulfillment secara idempotent.
5. Mengembalikan HTTP 200 hanya saat fulfillment berhasil atau event sudah pernah diproses.

---

## FR-005 — Retry dan Dead Letter Queue

Jika aplikasi tujuan gagal menerima event, PayCore harus melakukan retry.

Retry schedule:

```text
Retry 1: 1 menit
Retry 2: 5 menit
Retry 3: 30 menit
Retry 4: 2 jam
Retry 5: 12 jam
Retry 6: 24 jam
```

Setelah retry terakhir gagal:

```text
fulfillment_status: manual_review
delivery_status: dead_letter
```

Admin harus dapat melakukan retry manual.

---

## FR-006 — Payment Status API

Endpoint:

```http
GET /v1/orders/{order_id}
```

Response:

```json
{
  "order_id": "NAR-20260623-8H2KQ",
  "payment_status": "paid",
  "fulfillment_status": "delivered",
  "provider": "duitku",
  "amount": 99000,
  "currency": "IDR",
  "paid_at": "2026-06-23T15:00:00Z"
}
```

Endpoint ini hanya dapat diakses oleh aplikasi pemilik order atau internal admin.

---

## FR-007 — Payment Return URL

PayCore harus menyediakan return page:

```text
GET /return/{order_id}
```

Behavior:

1. Menerima customer dari payment gateway.
2. Mencari order.
3. Tidak mengubah status pembayaran.
4. Redirect ke return URL aplikasi asal.
5. Menambahkan parameter aman:

```text
?order_id=NAR-20260623-8H2KQ
```

Aplikasi asal harus tetap melakukan polling ke backend atau PayCore untuk mengecek status pembayaran.

Frontend tidak boleh langsung membuka akses berdasarkan parameter URL.

---

## FR-008 — Admin Operations

MVP harus memiliki internal admin API atau admin page sederhana.

Kemampuan minimum:

* Melihat daftar order.
* Filter berdasarkan app.
* Filter berdasarkan provider.
* Filter berdasarkan status.
* Melihat raw payment event.
* Melihat log callback.
* Melihat delivery attempt.
* Retry fulfillment secara manual.
* Menandai order sebagai manual review.
* Menambahkan catatan investigasi.
* Export CSV transaksi.

Admin endpoint harus dilindungi oleh Cloudflare Access.

---

# 10. Data Model

## 10.1 `apps`

```text
id UUID PK
app_id VARCHAR UNIQUE
display_name VARCHAR
order_prefix VARCHAR UNIQUE
webhook_url TEXT
webhook_secret_ref VARCHAR
allowed_return_urls JSONB
default_merchant_profile_id UUID
status VARCHAR
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## 10.2 `merchant_profiles`

```text
id UUID PK
provider VARCHAR
profile_key VARCHAR UNIQUE
merchant_code VARCHAR
credential_ref VARCHAR
currency VARCHAR
status VARCHAR
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

## 10.3 `payment_orders`

```text
id UUID PK
order_id VARCHAR UNIQUE
app_id UUID FK
merchant_profile_id UUID FK
external_order_id VARCHAR
product_key VARCHAR
description TEXT
amount BIGINT
currency VARCHAR
payment_status VARCHAR
fulfillment_status VARCHAR
provider VARCHAR
provider_reference VARCHAR
checkout_url TEXT
return_url TEXT
customer_name_encrypted TEXT
customer_email_encrypted TEXT
customer_phone_encrypted TEXT
fulfillment_data JSONB
expires_at TIMESTAMPTZ
paid_at TIMESTAMPTZ
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Unique constraints:

```text
UNIQUE(app_id, external_order_id)
UNIQUE(order_id)
UNIQUE(provider, provider_reference)
```

## 10.4 `payment_events`

```text
id UUID PK
event_id VARCHAR UNIQUE
provider VARCHAR
merchant_profile_id UUID FK
order_id UUID FK
provider_event_id VARCHAR
event_type VARCHAR
payload_hash VARCHAR
raw_payload JSONB
signature_valid BOOLEAN
processing_status VARCHAR
received_at TIMESTAMPTZ
processed_at TIMESTAMPTZ
```

Unique constraints:

```text
UNIQUE(provider, provider_event_id)
UNIQUE(provider, payload_hash)
```

## 10.5 `fulfillment_deliveries`

```text
id UUID PK
event_id UUID FK
app_id UUID FK
target_url TEXT
attempt_number INT
request_payload JSONB
response_status INT
response_body TEXT
delivery_status VARCHAR
next_retry_at TIMESTAMPTZ
delivered_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

## 10.6 `audit_logs`

```text
id UUID PK
actor_type VARCHAR
actor_id VARCHAR
action VARCHAR
entity_type VARCHAR
entity_id VARCHAR
metadata JSONB
created_at TIMESTAMPTZ
```

---

# 11. Payment Status State Machine

```text
created
  ↓
pending
  ├── paid
  ├── failed
  ├── expired
  └── cancelled

paid
  ├── fulfillment pending
  ├── fulfillment delivered
  ├── fulfillment failed
  └── manual review

paid
  ↓
refunded
```

Aturan penting:

* Status `paid` tidak boleh kembali ke `pending`.
* Callback `paid` kedua tidak boleh membuat fulfillment baru.
* Refund harus menghasilkan event terpisah.
* Amount mismatch harus masuk `manual_review`.
* Callback dengan signature invalid harus ditolak.

---

# 12. Security Requirements

## 12.1 Provider Verification

* Semua callback provider wajib diverifikasi signature-nya.
* Jangan mempercayai `statusCode` tanpa signature valid.
* Jangan mempercayai return URL user.
* Jangan memproses order yang tidak terdaftar.

## 12.2 App-to-PayCore Authentication

Semua request dari aplikasi ke PayCore harus menggunakan HMAC request signing.

Format:

```text
signature = HMAC_SHA256(
  app_secret,
  "{timestamp}.{method}.{path}.{sha256(raw_body)}"
)
```

Validasi:

* Timestamp maksimal 5 menit.
* Signature wajib valid.
* API key harus aktif.
* App harus memiliki akses ke merchant profile yang dipakai.

## 12.3 PayCore-to-App Authentication

Semua event internal harus menggunakan HMAC signing.

Aplikasi tujuan wajib:

* Menolak signature invalid.
* Menolak timestamp kadaluarsa.
* Menolak payload yang berubah.
* Menyimpan event ID untuk dedupe.

## 12.4 Data Protection

* Jangan menyimpan credential provider di database.
* Simpan secret hanya pada Cloudflare Worker Secrets.
* Gunakan encryption untuk customer PII bila memang harus disimpan.
* Jangan expose raw callback ke frontend.
* Jangan expose fulfillment data lintas aplikasi.
* Semua endpoint admin dilindungi Cloudflare Access.
* Semua endpoint wajib HTTPS.

---

# 13. Cloudflare Architecture

```text
Internet
   ↓
Cloudflare Worker
pay.appvibe.biz.id
   ↓
Hono API Router
   ├── Duitku Adapter
   ├── Payment Order Service
   ├── Callback Verification Service
   ├── Event Dispatcher
   ├── Return URL Handler
   └── Admin API
   ↓
Supabase PostgreSQL
   ↓
Cloudflare Queue
   ↓
Destination App Webhook
```

Komponen Worker:

```text
src/
  index.ts
  routes/
    orders.ts
    webhooks.ts
    returns.ts
    admin.ts
  services/
    order-service.ts
    provider-service.ts
    event-service.ts
    fulfillment-service.ts
  providers/
    duitku.ts
    mayar.ts
    xendit.ts
  middleware/
    app-auth.ts
    admin-auth.ts
    rate-limit.ts
    request-signature.ts
  lib/
    crypto.ts
    idempotency.ts
    logger.ts
    errors.ts
```

---

# 14. Provider Adapter Pattern

Setiap payment gateway harus memiliki adapter tersendiri.

Interface minimum:

```ts
interface PaymentProviderAdapter {
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;
  verifyWebhook(request: Request): Promise<VerifiedWebhookEvent>;
  getPaymentStatus(reference: string): Promise<PaymentStatusResult>;
  refund?(input: RefundInput): Promise<RefundResult>;
}
```

Adapter MVP:

```text
DuitkuAdapter
```

Adapter roadmap:

```text
MayarAdapter
XenditAdapter
MidtransAdapter
TripayAdapter
```

Provider adapter tidak boleh mengetahui logic Narraza, Siklusio, atau aplikasi lain.

---

# 15. Integrasi Narraza

## 15.1 Narraza Sebagai App Pertama

Konfigurasi:

```text
app_id: narraza
order_prefix: NAR
webhook_url: https://api.narraza.web.id/internal/payment-events
return_url: https://app.narraza.web.id/payment/return
merchant_profile: appvibe_default
```

## 15.2 Flow Kredit Narraza

```text
User memilih paket kredit
      ↓
Narraza backend membuat order ke PayCore
      ↓
PayCore membuat Duitku checkout URL
      ↓
User membayar
      ↓
PayCore menerima callback
      ↓
PayCore mengirim payment.succeeded ke Narraza
      ↓
Narraza menjalankan RPC atomic credit grant
      ↓
Narraza mencatat credit_ledger
      ↓
Narraza mengembalikan HTTP 200
```

## 15.3 Idempotency Narraza

Reference untuk credit ledger:

```text
paycore:{order_id}
```

Contoh:

```text
paycore:NAR-20260623-8H2KQ
```

Narraza wajib memiliki unique constraint agar satu payment order hanya bisa menambahkan kredit satu kali.

Contoh:

```text
UNIQUE(reference_type, reference_id)
```

Atau:

```text
UNIQUE(paycore_order_id)
```

## 15.4 Narraza Event Endpoint

```http
POST /internal/payment-events
```

Narraza harus:

1. Memverifikasi signature dari PayCore.
2. Memastikan event ID belum pernah diproses.
3. Memastikan package ID valid.
4. Memanggil RPC atomic untuk menambah kredit.
5. Menyimpan `paycore_order_id`.
6. Mengembalikan HTTP 200.
7. Tidak mempercayai nilai kredit dari frontend.

---

# 16. Error Handling

| Kondisi                                | Tindakan                                                         |
| -------------------------------------- | ---------------------------------------------------------------- |
| Signature Duitku invalid               | Tolak callback, tidak ubah transaksi                             |
| Order tidak ditemukan                  | Log security event, tidak fulfillment                            |
| Amount mismatch                        | `manual_review`                                                  |
| Currency mismatch                      | `manual_review`                                                  |
| Callback duplikat                      | Return sukses tanpa fulfillment ulang                            |
| App destination timeout                | Masuk retry queue                                                |
| App mengembalikan 500                  | Masuk retry queue                                                |
| App mengembalikan 401/403              | Retry terbatas lalu manual review                                |
| Provider API gagal saat create payment | Order `create_failed`                                            |
| Customer kembali ke app tanpa callback | Aplikasi polling payment status                                  |
| Payment expired                        | Update status `expired`                                          |
| Payment paid setelah expired           | Gunakan status dari provider, lakukan manual review bila konflik |

---

# 17. Observability dan Monitoring

PayCore harus mencatat:

* Request ID.
* Order ID.
* App ID.
* Provider.
* Provider reference.
* Callback timestamp.
* Signature verification result.
* Payment status transition.
* Fulfillment event ID.
* Delivery attempts.
* Retry count.
* Error message.
* Response status aplikasi tujuan.

Alert minimum:

```text
- Callback invalid meningkat tajam
- Callback processing error
- Event delivery failure > 10
- Dead-letter event baru
- Payment paid tetapi fulfillment belum delivered > 15 menit
- Provider API failure rate tinggi
```

---

# 18. Reconciliation

Cron job berjalan setiap hari untuk:

1. Membandingkan order pending dengan status provider.
2. Menandai order expired bila sudah melewati expiry.
3. Mencari payment paid tetapi fulfillment belum delivered.
4. Mencari transaksi provider yang belum punya order internal.
5. Membuat laporan transaksi harian per app.
6. Membuat laporan transaksi per provider.

Output minimum:

```text
total_orders
total_paid
total_failed
total_expired
gross_revenue
pending_fulfillment
failed_fulfillment
manual_review_count
```

---

# 19. Non-Functional Requirements

| Area                 | Requirement                                    |
| -------------------- | ---------------------------------------------- |
| Availability         | Worker harus selalu tersedia secara global     |
| Callback response    | Maksimal 3 detik                               |
| Database consistency | Transactional dan atomic                       |
| Idempotency          | Wajib di semua callback dan fulfillment        |
| Security             | HMAC di semua komunikasi antar server          |
| Auditability         | Semua status berubah harus tercatat            |
| Scalability          | Mendukung banyak aplikasi dan order            |
| Isolation            | App tidak boleh melihat transaksi app lain     |
| Privacy              | PII diminimalkan dan terenkripsi bila disimpan |
| Reliability          | Retry otomatis dan dead-letter queue           |

---

# 20. Acceptance Criteria

Implementasi dianggap selesai jika seluruh kondisi berikut terpenuhi.

## Payment Creation

* Narraza dapat membuat payment order melalui PayCore.
* PayCore menghasilkan global order ID.
* PayCore menghasilkan checkout URL Duitku.
* Request yang dikirim ulang dengan idempotency key yang sama tidak membuat transaksi baru.

## Callback Verification

* Callback Duitku valid dapat mengubah payment menjadi `paid`.
* Callback signature invalid tidak dapat mengubah data.
* Callback nominal berbeda masuk `manual_review`.
* Callback yang sama dikirim 10 kali hanya diproses satu kali.

## Fulfillment

* Payment sukses Narraza menambah kredit satu kali.
* Kredit tidak bertambah dua kali saat callback duplikat.
* Event gagal ke Narraza otomatis di-retry.
* Event retry tetap memakai event ID yang sama.
* Event gagal total masuk dead-letter queue.

## Security

* API key tidak tersedia di frontend.
* Secret Duitku tidak tersedia di database.
* Endpoint admin tidak dapat diakses tanpa Cloudflare Access.
* Aplikasi tujuan menolak signature PayCore invalid.
* Return URL tidak dapat memaksa status menjadi paid.

## Monitoring

* Admin dapat melihat raw event callback.
* Admin dapat melihat status fulfillment.
* Admin dapat retry fulfillment manual.
* Admin dapat memfilter transaksi berdasarkan aplikasi dan status.

---

# 21. Tahapan Implementasi

## Phase 0 — Foundation

* Buat Cloudflare Worker `paycore`.
* Setup domain production dan staging.
* Buat Supabase project/database khusus PayCore.
* Buat schema database.
* Buat Cloudflare Queues.
* Setup Worker Secrets.
* Setup Sentry dan logging.

## Phase 1 — Core API

* Implement app authentication.
* Implement app registration seed.
* Implement create payment order.
* Implement Duitku adapter.
* Implement payment status API.
* Implement return URL handler.

## Phase 2 — Callback Engine

* Implement callback Duitku.
* Implement signature verification.
* Implement idempotency.
* Implement payment event persistence.
* Implement payment status transition.
* Implement audit logs.

## Phase 3 — Fulfillment Engine

* Implement Cloudflare Queue dispatcher.
* Implement HMAC event signing.
* Implement retry policy.
* Implement dead-letter queue.
* Implement fulfillment delivery logging.

## Phase 4 — Narraza Integration

* Tambahkan internal payment endpoint Narraza.
* Tambahkan event signature verification.
* Hubungkan event ke credit ledger.
* Tambahkan payment status polling.
* Jalankan end-to-end test di staging.
* Cutover payment Narraza dari callback langsung ke PayCore.

## Phase 5 — Admin dan Reconciliation

* Buat internal admin page/API.
* Buat filter transaksi.
* Buat retry fulfillment manual.
* Buat laporan harian.
* Buat cron reconciliation.

---

# 22. Definition of Done

PayCore MVP dianggap production-ready ketika:

1. Duitku menggunakan callback tunggal:

```text
https://pay.appvibe.biz.id/webhooks/duitku
```

2. Narraza tidak lagi menerima callback Duitku secara langsung.
3. Callback valid dapat menghasilkan credit ledger Narraza.
4. Callback duplikat tidak dapat menambah kredit dua kali.
5. Event delivery memiliki retry otomatis.
6. Semua transaksi memiliki audit trail.
7. Admin dapat menemukan dan retry payment fulfillment gagal.
8. Staging telah melewati test callback, payment success, duplicate callback, failed dispatch, retry, dan manual review.
9. Production memiliki monitoring dan alert dasar.
10. Dokumentasi OpenAPI serta integration guide tersedia untuk aplikasi berikutnya.

---

# 23. Keputusan Produk yang Sudah Ditetapkan

| Area                    | Keputusan                            |
| ----------------------- | ------------------------------------ |
| Nama sistem             | AppVibe PayCore                      |
| Domain                  | `pay.appvibe.biz.id`                 |
| Provider MVP            | Duitku                               |
| Integrasi pertama       | Narraza                              |
| Infrastruktur utama     | Cloudflare Workers                   |
| Database transaksi      | Supabase PostgreSQL                  |
| Queue                   | Cloudflare Queues                    |
| Callback strategy       | Satu endpoint per provider           |
| Fulfillment             | Diproses aplikasi pemilik transaksi  |
| Event semantics         | At-least-once delivery               |
| Deduplikasi             | Wajib di PayCore dan aplikasi tujuan |
| Payment source of truth | Callback provider terverifikasi      |
| Return URL              | Hanya untuk UX, bukan bukti bayar    |
| Mata uang MVP           | IDR                                  |
| Produk MVP              | One-time payment dan credit purchase |

---

# 24. Nama Repository yang Direkomendasikan

```text
appvibe-paycore
```

Alternatif:

```text
paycore
appvibe-payment-hub
appvibe-payments
```

Rekomendasi final:

```text
appvibe-paycore
```

---

# 25. Catatan Penting untuk AI Agent

1. Jangan buat logic payment khusus Narraza di repository PayCore.
2. Jangan simpan Duitku API key di frontend.
3. Jangan gunakan callback return URL sebagai trigger top-up kredit.
4. Jangan menjadikan callback gateway langsung memanggil database Narraza.
5. Jangan membuat fulfillment synchronous dependency terhadap response callback gateway.
6. Callback gateway harus dicatat dulu secara durable sebelum event diteruskan.
7. Semua status update payment harus atomic.
8. Semua event delivery harus dapat diulang tanpa efek ganda.
9. Semua app harus memiliki webhook secret berbeda.
10. Seluruh waktu disimpan dalam UTC, lalu ditampilkan dalam WIB di dashboard.