import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(join(process.cwd(), 'migrations', '0001_initial.sql'), 'utf8');

const requiredTables = [
  'apps',
  'merchant_profiles',
  'payment_orders',
  'payment_events',
  'fulfillment_deliveries',
  'audit_logs',
  'idempotency_keys',
];

describe('D1 migrations', () => {
  for (const table of requiredTables) {
    it(`defines table ${table}`, () => {
      expect(migration).toMatch(new RegExp(`CREATE TABLE ${table}`, 'i'));
    });
  }

  it('uses INTEGER for timestamps on orders', () => {
    expect(migration).toMatch(/expires_at INTEGER/);
    expect(migration).toMatch(/paid_at INTEGER/);
  });
});