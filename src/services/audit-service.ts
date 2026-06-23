import type { PayCoreSupabase } from '../lib/supabase.ts';
import type { PayCoreLogger } from '../lib/logger.ts';

export type AuditActorType = 'system' | 'app' | 'admin' | 'provider';

export interface AuditEntryInput {
  actorType: AuditActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

export async function writeAudit(
  db: PayCoreSupabase,
  input: AuditEntryInput,
): Promise<void> {
  const { error } = await db.from('audit_logs').insert({
    actor_type: input.actorType,
    actor_id: input.actorId ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    metadata: input.metadata ?? {},
  });
  if (error) {
    throw new Error(`audit insert failed: ${error.message}`);
  }
}

export class AuditService {
  constructor(
    private readonly db: PayCoreSupabase,
    private readonly log: PayCoreLogger,
  ) {}

  async record(entry: AuditEntryInput): Promise<void> {
    try {
      await writeAudit(this.db, entry);
    } catch (err) {
      this.log.error('audit_log_insert_failed', {
        action: entry.action,
        entity_id: entry.entityId,
        message: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}