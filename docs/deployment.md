# Deployment

## Databases

| Environment | D1 name | Binding |
|-------------|---------|---------|
| Staging | `paycore-staging` | `DB` |
| Production | `paycore-production` | `DB` |

Replace `REPLACE_WITH_*_D1_ID` in `wrangler.toml` with real IDs from the dashboard.

## Migrations

```bash
npm run db:migrate:local      # wrangler --local
npm run db:migrate:staging    # remote staging only
npm run db:migrate:production # remote production — manual gate
```

Migrations live in `migrations/` (`0001_initial.sql`, `0002_seed.sql`). Legacy PostgreSQL files are under `migrations/postgres-legacy/` for reference only.

## Bindings required

- `DB` — D1
- `FULFILLMENT_QUEUE`, `DEAD_LETTER_QUEUE`
- Cron `0 2 * * *`

## Secrets

See `.dev.vars.example`. No Supabase URL or service role.

## Backup

Use Cloudflare D1 export / Time Travel (per account plan) before schema changes. Document restore drills in runbook for incidents.