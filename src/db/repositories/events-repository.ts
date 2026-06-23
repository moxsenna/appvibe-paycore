import { parseJson, type PayCoreDb } from '../client.ts';
import { msToIso } from '../../lib/time.ts';

export async function listPaymentEventsForOrder(
  db: PayCoreDb,
  orderUuid: string,
): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare(`SELECT * FROM payment_events WHERE order_id = ? ORDER BY received_at DESC`)
    .bind(orderUuid)
    .all<Record<string, unknown>>();
  return (results ?? []).map((r) => ({
    ...r,
    raw_payload: parseJson(r.raw_payload as string, {}),
    received_at: msToIso(r.received_at as number),
    processed_at: msToIso(r.processed_at as number | null),
    signature_valid: Boolean(r.signature_valid),
  }));
}