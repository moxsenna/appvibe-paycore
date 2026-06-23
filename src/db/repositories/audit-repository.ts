import { newId, stringifyJson, type PayCoreDb } from '../client.ts';
import { nowMs } from '../../lib/time.ts';

export type AuditActorType = 'system' | 'app' | 'admin' | 'provider';

export interface AuditEntryInput {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export async function insertAuditLog(db: PayCoreDb, input: AuditEntryInput): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_logs (id, actor_type, actor_id, action, entity_type, entity_id, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      newId(),
      input.actorType,
      input.actorId ?? null,
      input.action,
      input.entityType,
      input.entityId,
      stringifyJson(input.metadata ?? {}),
      nowMs(),
    )
    .run();
}