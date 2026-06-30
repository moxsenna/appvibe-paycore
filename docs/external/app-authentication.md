# App authentication (your backend → PayCore)

Applies to routes under **`/v1/*`** (orders). Implemented in `src/middleware/app-auth.ts`.

## Required headers

| Header | Description |
|--------|-------------|
| `X-PayCore-App` | App slug registered in PayCore, e.g. `narraza` |
| `X-PayCore-Key-Id` | Key id PayCore maps to a secret, e.g. `pk_staging_narraza_01` |
| `X-PayCore-Timestamp` | ISO 8601 UTC, e.g. `2026-06-24T10:00:00.000Z` |
| `X-PayCore-Signature` | `sha256=<hmac_hex>` or raw hex |
| `Idempotency-Key` | Required on `POST /v1/orders`, max 128 chars |

## Canonical message

From `buildAppRequestSignature` in `src/lib/crypto.ts`:

```text
message = timestamp + "." + METHOD + "." + path + "." + sha256Hex(rawBody)
signature_hex = HMAC_SHA256(app_secret, message)
```

| Field | Rule |
|-------|------|
| `METHOD` | Uppercase |
| `path` | Pathname only: `/v1/orders`, `/v1/orders/NAR-20260624-ABC` |
| `rawBody` | Exact request body string; for GET use `""` |

## Key resolution (PayCore side)

PayCore maps `X-PayCore-Key-Id` → secret via Worker secrets (`resolveAppSecret` in `src/config/env.ts`). For Narraza staging, key id and secret must match what Narraza backend uses.

## Timestamp

Max skew **5 minutes**. Outside window → HTTP 401.

## Idempotency (`POST /v1/orders`)

| Outcome | HTTP |
|---------|------|
| New key | Create order (201 or 502 if Duitku create fails) |
| Same key + same body hash | Replay stored response (200) |
| Same key + different body | 409 `idempotency_mismatch` |
| Same key, still in progress | 409 `idempotency_in_progress` |

## Errors

| HTTP | Meaning |
|------|---------|
| 401 | Missing headers, bad signature, unknown key, bad timestamp |
| 403 | App not `active` in PayCore D1 |
| 409 | Idempotency conflict |

## Example: create order (curl outline)

1. `rawBody` = JSON string.
2. `path` = `/v1/orders`.
3. Sign with `PAYCORE_APP_SECRET`.
4. Send headers above.

Full TypeScript helpers: `docs/external/integration-guide.md` §6.
