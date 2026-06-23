# AppVibe PayCore

Centralized payment orchestration on **Cloudflare Workers**, **D1**, **Queues**, and **Cron**.

## Stack

- Hono + TypeScript (strict)
- **Cloudflare D1** (`paycore-staging`, `paycore-production`) — not Supabase
- Cloudflare Queues (fulfillment + dead-letter)
- Duitku adapter (pure JS MD5)

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

**Duitku sandbox:** `docs/duitku-sandbox-setup.md`
- Vault checkout test (no Narraza): `docs/examples/appvibe-vault-checkout-test.md` + `D:/Coding/appvibe.web.id/checkout/`

1. Create D1 database `paycore-staging` in Cloudflare dashboard.
2. Set `database_id` in `wrangler.toml` under `[env.staging.d1_databases]`.
3. `npm run db:migrate:staging`
4. Configure secrets and queues; `npm run deploy:staging`

Do **not** run production migrations/deploy from CI without approval.

## Docs
- `docs/integration-guide.md` — consumer app integration
- `docs/openapi.yaml` — API reference
- `D:/Coding/payment gateway/prompt.md` — salin ke agen di repo aplikasi lain (baca docs PayCore lewat path absolut di prompt)
- `docs/architecture.md`
- `docs/deployment.md`
- `docs/runbook.md`
- `docs/duitku-integration.md`
- `IMPLEMENTATION_REPORT.md`