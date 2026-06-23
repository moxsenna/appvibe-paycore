#!/usr/bin/env node
/**
 * Reads .staging.vars and runs wrangler secret bulk without ENVIRONMENT=
 * (ENVIRONMENT is set via wrangler.toml [env.staging.vars]).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const varsPath = path.join(root, '.staging.vars');

if (!fs.existsSync(varsPath)) {
  console.error(`Missing ${varsPath} — copy from .staging.vars.example`);
  process.exit(1);
}

const lines = fs.readFileSync(varsPath, 'utf8').split(/\r?\n/);
const out = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  if (/^ENVIRONMENT=/i.test(trimmed)) continue;
  out.push(line);
}

const tmp = path.join(os.tmpdir(), `paycore-staging-secrets-${process.pid}.env`);
fs.writeFileSync(tmp, out.join('\n') + '\n', 'utf8');

const r = spawnSync('npx', ['wrangler', 'secret', 'bulk', tmp, '--env', 'staging'], {
  cwd: root,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

try {
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

process.exit(r.status ?? 1);