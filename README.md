# AppVibe PayCore

Centralized payment orchestration on **Cloudflare Workers**, **D1**, **Queues**, and **Cron**.

## Stack

- Hono + TypeScript (strict)
- **Cloudflare D1** (`paycore-staging`, `paycore-production`) — not Supabase
- Cloudflare Queues (fulfillment + dead-letter)
- Duitku POP adapter (HMAC SHA256, with legacy MD5 callback fallback)

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

## Quality gates

```bash
npm run typecheck
npm test
npm run lint
```

## Staging (manual)

**Duitku sandbox:** `docs/internal/duitku-sandbox-setup.md`
- Vault checkout test (no Narraza): `docs/internal/examples/appvibe-vault-checkout-test.md` + `D:/Coding/appvibe.biz.id/checkout/`

1. Create D1 database `paycore-staging` in Cloudflare dashboard.
2. Set `database_id` in `wrangler.toml` under `[env.staging.d1_databases]`.
3. `npm run db:migrate:staging`
4. Configure secrets and queues; `npm run deploy:staging`

Do **not** run production migrations/deploy from CI without approval.

## Docs
- `docs/README.md` - pilih dokumen berdasarkan pembaca
- `docs/external/integration-guide.md` — consumer app integration
- `docs/external/openapi.yaml` — API reference
- `D:/Coding/paycore/prompt.md` - salin ke agen di repo aplikasi lain bila perlu
- `docs/internal/architecture.md`
- `docs/internal/deployment.md`
- `docs/internal/runbook.md`
- `docs/internal/duitku-integration.md`
- `IMPLEMENTATION_REPORT.md`
