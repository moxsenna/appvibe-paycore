# Test Plan

## Vitest

| Area | File |
|------|------|
| Duitku / auth | `tests/md5.test.ts`, `tests/crypto-auth.test.ts`, `tests/duitku-provider.test.ts` |
| Retry eligibility | `tests/fulfillment-retry.test.ts` |
| Return URL | `tests/return-url.test.ts` |
| Narraza ref | `tests/narraza-idempotency.test.ts` |

### Fulfillment hardening scenarios (automated)

1. Recent activity (5m) not eligible  
2. Stuck 16m / 1h eligible  
3. `next_retry_at` gate  
4. Terminal delivery statuses excluded  
5. Dead letter at max attempts  
6. Stable `event_id` on retry  
7. Single claim winner simulation  

## Gates

```bash
npm run typecheck
npm test
npm run lint
```
