import type { PayCoreDb } from '../db/index.ts';
import {
  insertAuditLog,
  type AuditActorType,
  type AuditEntryInput,
} from '../db/repositories/audit-repository.ts';
import type { PayCoreLogger } from '../lib/logger.ts';

export type { AuditActorType };

export async function writeAudit(db: PayCoreDb, input: AuditEntryInput): Promise<void> {
  await insertAuditLog(db, input);
}

export class AuditService {
  constructor(
    private readonly db: PayCoreDb,
    private readonly log: PayCoreLogger,
  ) {}

  async record(input: AuditEntryInput): Promise<void> {
    try {
      await insertAuditLog(this.db, input);
    } catch (err) {
      this.log.error('audit_insert_failed', {
        action: input.action,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }
}