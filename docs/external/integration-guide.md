# AppVibe PayCore Integration Guide

PayCore is the **central payment hub** for AppVibe products. Your app does **not** talk to Duitku directly for callbacks or signature verification.

---

## 1. Apa itu PayCore

PayCore:

- Creates a global `order_id` (e.g. `NAR-20260624-8H2KQ`).
- Creates a Duitku checkout and returns `checkout_url`.
- Receives **Duitku server callbacks** on one domain.
- Records payment in Cloudflare D1.
- Sends a signed **`payment.succeeded`** event to your app webhook URL.
- Retries delivery if your endpoint fails (same `event_id`).

Your app (Narraza, Siklusio, TEKAD, …) only:

- Calls **`POST /v1/orders`** and **`GET /v1/orders/:order_id`** (with app auth).
- Exposes **`POST /internal/payment-events`** (or URL registered in PayCore) to receive events.

---

## 2. Alur singkat payment

```text
Your backend → POST /v1/orders (signed) → PayCore
PayCore → Duitku → checkout_url
User pays on Duitku
Duitku → POST /webhooks/duitku (PayCore only)
PayCore → marks paid → queue → POST your webhook (signed)
Your app → grant credit / activate (idempotent) → HTTP 200
```

**Return URL** (`GET /return/:order_id`) only redirects the user back to your site. It is **not** proof of payment.

---

## 3. Environment

| Environment | Base URL |
|-------------|----------|
| **Staging** | `https://pay-staging.appvibe.biz.id` |
| **Production** | `https://pay.appvibe.biz.id` |

Use **staging** secrets and staging Narraza/API until E2E passes. Production infrastructure is live, but live payment traffic must wait until production Duitku/app secrets replace the bootstrap values.

---

## 4. Endpoint staging dan production

| Method | Path | Who calls it |
|--------|------|----------------|
| `GET` | `/health` | Anyone (monitoring) |
| `POST` | `/v1/orders` | Your backend (signed) |
| `GET` | `/v1/orders/:order_id` | Your backend (signed) |
| `GET` | `/return/:order_id` | User browser after payment |
| `POST` | `/webhooks/duitku` | **Duitku only** |

**Do not** call `/webhooks/duitku` from Narraza, Siklusio, or TEKAD.

Admin routes (`/admin/*`) are for operators, not app integration.

---

## 5. Cara membuat order

```http
POST /v1/orders
Content-Type: application/json
X-PayCore-App: narraza
X-PayCore-Key-Id: pk_staging_narraza_01
X-PayCore-Timestamp: 2026-06-24T10:00:00.000Z
X-PayCore-Signature: sha256=<64-hex-chars>
Idempotency-Key: 7d4d65e4-2d34-4f1d-8e52-8eb60ab9fadb
```

Body (see `src/schemas/order.ts`):

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
  "return_url": "https://app-staging.narraza.web.id/payment/return",
  "fulfillment_data": {
    "user_id": "user_uuid",
    "package_id": "credit_pack_25000",
    "credits": 25000
  }
}
```

Success response (example):

```json
{
  "order_id": "NAR-20260624-8H2KQ",
  "external_order_id": "narraza-order-000123",
  "payment_status": "pending",
  "fulfillment_status": "pending",
  "provider": "duitku",
  "checkout_url": "https://sandbox.duitku.com/...",
  "expires_at": "2026-06-25T10:00:00.000Z"
}
```

Notes:

- Store **`order_id`** (PayCore) and **`external_order_id`** (your id).
- Redirect user to **`checkout_url`**.
- Grant access/credits only after **`payment.succeeded`** webhook (see below).
- Same `Idempotency-Key` + same body → replay of prior response (HTTP 200).
- Same key + different body → HTTP **409** `idempotency_mismatch`.

---

## 6. Cara sign request ke PayCore

Canonical string (see `src/lib/crypto.ts` → `buildAppRequestSignature`):

```text
{timestamp}.{METHOD}.{path}.{sha256_hex(raw_body)}
```

- `METHOD` = uppercase (`POST`, `GET`).
- `path` = URL pathname only, e.g. `/v1/orders` (no host, no query).
- `raw_body` = exact bytes sent as body (use `{}` for empty GET body).

Signature:

```text
HMAC_SHA256(app_secret, canonical_string) → lowercase hex
```

Header `X-PayCore-Signature`: `sha256=<hex>` or raw `<hex>` (PayCore accepts both).

Timestamp skew: ±5 minutes (`assertTimestampFresh`).

Example TypeScript:

```ts
async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signPayCoreRequest(params: {
  appSecret: string;
  timestamp: string;
  method: string;
  path: string;
  rawBody: string;
}): Promise<string> {
  const bodyHash = await sha256Hex(params.rawBody);
  const message = `${params.timestamp}.${params.method.toUpperCase()}.${params.path}.${bodyHash}`;
  return hmacSha256Hex(params.appSecret, message);
}
```

---

## 7. Cara menerima event dari PayCore

Register `webhook_url` in PayCore (D1 `apps` table), e.g.:

```text
https://api-staging.narraza.web.id/internal/payment-events
```

PayCore `POST`s JSON with headers (see `deliverFulfillment` in `src/services/fulfillment-service.ts`):

```http
Content-Type: application/json
X-PayCore-Event-Timestamp: 2026-06-24T10:05:00.000Z
X-PayCore-Event-Signature: sha256=<hex>
```

Payload shape (`payment.succeeded`):

```json
{
  "event_id": "evt_abc123...",
  "event_type": "payment.succeeded",
  "occurred_at": "2026-06-24T10:05:00.000Z",
  "data": {
    "order_id": "NAR-20260624-8H2KQ",
    "external_order_id": "narraza-order-000123",
    "app_id": "narraza",
    "provider": "duitku",
    "provider_reference": "DUITKU-REF-123",
    "amount": 99000,
    "currency": "IDR",
    "product_key": "credit_pack_25000",
    "fulfillment_data": {
      "user_id": "user_uuid",
      "package_id": "credit_pack_25000",
      "credits": 25000
    },
    "paid_at": "2026-06-24T10:05:00.000Z"
  }
}
```

`occurred_at` and `paid_at` are **ISO 8601 UTC strings**, not Unix integers.

There is no separate `X-PayCore-Event` or `X-PayCore-Event-Id` header — use JSON `event_type` and `event_id`.

---

## 8. Cara verifikasi event signature

Canonical (see `buildWebhookEventSignature`):

```text
{timestamp}.{raw_json_body}
```

`raw_json_body` must be the **exact** request body string PayCore sent (byte-identical to what you hash).

```text
expected = HMAC_SHA256(webhook_secret, canonical)
header X-PayCore-Event-Signature = sha256={expected_hex}
```

Example verification:

```ts
function parseSignature(header: string | null): string | null {
  if (!header) return null;
  const t = header.trim();
  return t.startsWith('sha256=') ? t.slice(7) : t;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function verifyPayCoreEvent(params: {
  webhookSecret: string;
  timestampHeader: string;
  rawBody: string;
  signatureHeader: string;
  maxSkewMs?: number;
}): Promise<boolean> {
  const t = Date.parse(params.timestampHeader);
  if (Number.isNaN(t)) return false;
  const skew = Math.abs(Date.now() - t);
  if (skew > (params.maxSkewMs ?? 5 * 60_000)) return false;

  const message = `${params.timestampHeader}.${params.rawBody}`;
  const expected = await hmacSha256Hex(params.webhookSecret, message);
  const provided = parseSignature(params.signatureHeader);
  return provided !== null && timingSafeEqual(provided, expected);
}
```

---

## 9. Cara mencegah double fulfillment

PayCore already deduplicates Duitku callbacks and reuses the same `event_id` on retries.

**Your app must still:**

1. Persist processed **`event_id`** (unique).
2. Persist processed **`order_id`** (unique) for fulfillment side effects.
3. Run credit/activation in a **transaction** with unique constraint.
4. Return **200** if event already processed (idempotent replay).

Recommended ledger reference (Narraza):

```text
paycore:{order_id}
```

Example: `paycore:NAR-20260624-8H2KQ`

**Never** grant credits based on:

- Return URL / query `order_id`
- Frontend “payment success” UI
- Duitku callback to your app
- Screenshots or manual admin without PayCore event

---

## 10. Testing staging

See `docs/external/examples/narraza-integration.md` if the consumer app is Narraza.

Minimum: `/health` OK → create order → sandbox pay → one credit → duplicate callback safe.

---

## 11. Checklist sebelum production

- [ ] Staging E2E passed (pay, event, duplicate, retry).
- [ ] Staging and production use **different** `PAYCORE_APP_SECRET` and `PAYCORE_WEBHOOK_SECRET`.
- [ ] Production app row in PayCore D1 with production `webhook_url` / `return_url`.
- [ ] Duitku production callback → `https://pay.appvibe.biz.id/webhooks/duitku`.
- [ ] Runbook and on-call know how to read `fulfillment_deliveries` and retry.

---

## 12. Troubleshooting

See `docs/external/troubleshooting.md`.

---

## Related docs

- `docs/external/app-authentication.md` — request signing details
- `docs/external/payment-events.md` — webhook contract
- `docs/external/examples/generic-app-integration.md` — minimal app template
- `docs/internal/integrating-new-app.md` — PayCore maintainer onboarding checklist
