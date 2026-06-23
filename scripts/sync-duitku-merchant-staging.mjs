#!/usr/bin/env node
/**
 * Updates merchant_profiles.merchant_code from DUITKU_MERCHANT_CODE in .staging.vars
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const varsPath = path.join(root, '.staging.vars');

function readMerchantCode() {
  if (process.env.DUITKU_MERCHANT_CODE?.trim()) {
    return process.env.DUITKU_MERCHANT_CODE.trim();
  }
  if (!fs.existsSync(varsPath)) return null;
  for (const line of fs.readFileSync(varsPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^DUITKU_MERCHANT_CODE=(.*)$/);
    if (m && m[1].trim()) return m[1].trim();
  }
  return null;
}

const code = readMerchantCode();
if (!code) {
  console.error('Set DUITKU_MERCHANT_CODE in .staging.vars or environment');
  process.exit(1);
}

const escaped = code.replace(/'/g, "''");
const sql = `UPDATE merchant_profiles SET merchant_code = '${escaped}', updated_at = (unixepoch() * 1000) WHERE profile_key = 'appvibe_default';`;

const r = spawnSync(
  'npx',
  [
    'wrangler',
    'd1',
    'execute',
    'paycore-staging',
    '--remote',
    '--env',
    'staging',
    '--command',
    sql,
  ],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
);

process.exit(r.status ?? 1);