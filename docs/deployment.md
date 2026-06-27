# Deployment

## Databases

| Environment | D1 name | Binding |
|-------------|---------|---------|
| Staging | `paycore-staging` | `DB` |
| Production | `paycore-production` | `DB` |

`wrangler.toml` now contains the active staging and production D1 IDs.
Production D1: `bdb9a383-3bc1-4da8-bdf0-d497278f5a89`.

## Migrations

```bash
npm run db:migrate:local      # wrangler --local
npm run db:migrate:staging    # remote staging only
npm run db:migrate:production # remote production — manual gate
```

Migrations live in `migrations/` (`0001_initial.sql`, `0002_seed.sql`). Legacy PostgreSQL files are under `migrations/postgres-legacy/` for reference only.

## Domains

| Environment | Domain | Worker |
|-------------|--------|--------|
| Staging | `https://pay-staging.appvibe.biz.id` | `appvibe-paycore-staging` |
| Production | `https://pay.appvibe.biz.id` | `appvibe-paycore` |

The Cloudflare account currently has the `appvibe.biz.id` zone. There is no `appvibe.biz` zone in this account, so do not use `pay.appvibe.biz` unless that domain is added separately.

## Production payment readiness

Production infrastructure is provisioned: Worker, D1, queues, migrations, and custom domain.

Before using it for real payments, replace bootstrap/sandbox secrets with live production values:

- `DUITKU_BASE_URL`
- `DUITKU_MERCHANT_CODE`
- `DUITKU_API_KEY`
- `VAULT_APP_KEY_ID`
- `VAULT_APP_SECRET`
- `VAULT_WEBHOOK_SECRET`
- `NARRAZA_APP_KEY_ID`
- `NARRAZA_APP_SECRET`
- `NARRAZA_WEBHOOK_SECRET`

## Bindings required

- `DB` — D1
- `FULFILLMENT_QUEUE`, `DEAD_LETTER_QUEUE`
- Cron `0 2 * * *`

## Secrets

See `.dev.vars.example`. No Supabase URL or service role.

For the AppVibe Vault app, `VAULT_WEBHOOK_SECRET` must match the AppVibe Pages secret named `PAYCORE_WEBHOOK_SECRET` in `D:/Coding/appvibe.biz.id`. A mismatch causes AppVibe to return `401 invalid_signature` to fulfillment deliveries.

## Backup

Use Cloudflare D1 export / Time Travel (per account plan) before schema changes. Document restore drills in runbook for incidents.
