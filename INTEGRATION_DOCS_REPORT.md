# Integration documentation — deliverable report

## 1. File dokumentasi yang dibuat/diubah

| File | Action |
|------|--------|
| `docs/external/integration-guide.md` | Created (main guide) |
| `docs/internal/integrating-new-app.md` | Created |
| `docs/external/app-authentication.md` | Created |
| `docs/external/payment-events.md` | Created |
| `docs/external/troubleshooting.md` | Created |
| `docs/internal/staging-e2e-checklist.md` | Updated (owner + developer sections) |
| `docs/external/examples/narraza-integration.md` | Created |
| `docs/external/examples/generic-app-integration.md` | Created |
| `README.md` | Link to integration guide |
| `INTEGRATION_DOCS_REPORT.md` | This report |

No payment logic, D1 schema, or secrets changed.

## 2. Ringkasan isi tiap file

- **integration-guide.md** — Answers all 12 integration questions; endpoints; order create; both signatures; anti double-credit; env vars; staging/prod URLs.
- **app-authentication.md** — Headers, canonical string, idempotency outcomes, errors.
- **payment-events.md** — Actual webhook headers and JSON shape from `fulfillment-service.ts`.
- **integrating-new-app.md** — 17-step checklist + Siklusio example.
- **troubleshooting.md** — Symptom table + D1/tail commands.
- **staging-e2e-checklist.md** — Non-coding owner steps + developer verification.
- **examples/narraza-integration.md** — Narraza staging constants, `paycore:{order_id}`.
- **examples/generic-app-integration.md** — Template for any AppVibe app.

## 3. Contoh signature vs kode aktual

| Topic | Source in repo | Match |
|-------|----------------|-------|
| App request HMAC | `buildAppRequestSignature` | Yes — `ts.METHOD.path.sha256(body)` |
| Event HMAC | `buildWebhookEventSignature` | Yes — `ts.rawJson` → header `sha256=hex` |
| Parse app sig header | `parsePayCoreSignature` | Documented |
| Timestamp skew | `assertTimestampFresh` 5 min | Documented |

## 4. Endpoint & payload vs implementasi

| Item | Actual implementation | Docs |
|------|----------------------|------|
| Event headers | `X-PayCore-Event-Timestamp`, `X-PayCore-Event-Signature` only | Corrected (not X-PayCore-Event-Id header) |
| `occurred_at` / `paid_at` | ISO strings in JSON | Documented (not Unix ms in body) |
| `expires_at` in create response | ISO via `msToIso` in order service | Documented as ISO |
| `data.payment_status` | Not in payload | Documented as absent |
| Order schema | `src/schemas/order.ts` | Matches examples |
| `/webhooks/duitku` | Duitku only | Emphasized |

## 5. Quality gates

```text
npm run typecheck — OK
npm test           — 8 files, 37 tests OK
npm run lint       — OK
```

## 6. Hal yang belum dilakukan

- Live E2E sandbox execution (documentation only).
- Production integration.
- Auto-generated OpenAPI sync (existing `docs/external/openapi.yaml` not updated in this pass).
- Multi-app `resolveAppSecret` code (noted in integrating-new-app.md for maintainers).
