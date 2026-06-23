# Architecture

## Three status dimensions

1. **payment_status** — provider callback result  
2. **fulfillment_status** — order-level app fulfillment summary  
3. **delivery_status** — row in `fulfillment_deliveries` (source of truth for retry)

## Retry path

```text
fulfillment_deliveries.next_retry_at <= now()
  AND delivery_status IN (queued, failed, pending)
  OR processing with claimed_at older than 15m
→ paycore_claim_fulfillment_delivery
→ queue message { deliveryId, eventId, attemptNumber }
→ processQueueMessage → markDeliveryOutcome
```

`event_id` and `deliveryId` stay constant across retries; only `attempt_number` increases.

## RPC

- `paycore_claim_fulfillment_delivery` — `FOR UPDATE`, terminal states rejected  
- `paycore_list_deliveries_due_retry` — cron candidate list  

Migration: `migrations/004_fulfillment_delivery_hardening.sql`