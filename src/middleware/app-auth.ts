import { createMiddleware } from 'hono/factory';
import { resolveAppSecret } from '../config/env.ts';
import {
  buildAppRequestSignature,
  parsePayCoreSignature,
  timingSafeEqual,
} from '../lib/crypto.ts';
import { Errors } from '../lib/errors.ts';
import { getAppBySlug } from '../db/repositories/apps-repository.ts';
import { assertTimestampFresh } from '../lib/time.ts';
import type { PayCoreHonoEnv } from '../types/hono.ts';

export const captureRawBodyMiddleware = createMiddleware<PayCoreHonoEnv>(async (c, next) => {
  const rawBody = await c.req.raw.clone().text();
  c.set('rawBody', rawBody);
  await next();
});

export const appAuthMiddleware = createMiddleware<PayCoreHonoEnv>(async (c, next) => {
  const appSlug = c.req.header('X-PayCore-App')?.trim();
  const keyId = c.req.header('X-PayCore-Key-Id')?.trim();
  const timestamp = c.req.header('X-PayCore-Timestamp')?.trim();
  const signatureHeader = c.req.header('X-PayCore-Signature');

  if (!appSlug || !keyId || !timestamp || !signatureHeader) {
    throw Errors.unauthorized('Missing PayCore authentication headers');
  }

  assertTimestampFresh(timestamp);

  const env = c.get('env');
  const secret = resolveAppSecret(env, keyId);
  if (!secret) {
    throw Errors.unauthorized('Unknown API key');
  }

  const rawBody = c.get('rawBody') ?? '';
  const path = new URL(c.req.url).pathname;
  const expectedHex = await buildAppRequestSignature(
    secret,
    timestamp,
    c.req.method,
    path,
    rawBody,
  );
  const providedHex = parsePayCoreSignature(signatureHeader);
  if (!providedHex || !timingSafeEqual(providedHex, expectedHex)) {
    throw Errors.unauthorized('Invalid request signature');
  }

  const db = c.get('db');
  const appRow = await getAppBySlug(db, appSlug);

  if (!appRow || appRow.status !== 'active') {
    throw Errors.forbidden('App is not active');
  }

  c.set('appAuth', {
    appSlug: appRow.app_id,
    appUuid: appRow.id,
    keyId,
  });

  await next();
});