import type { D1Database } from '@cloudflare/workers-types';

export type PayCoreDb = D1Database;

export function newId(): string {
  return crypto.randomUUID();
}

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value);
}

export async function runBatch(db: PayCoreDb, statements: D1PreparedStatement[]): Promise<void> {
  if (statements.length === 0) return;
  await db.batch(statements);
}