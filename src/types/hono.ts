import type { PayCoreDb } from '../db/index.ts';
import type { PayCoreLogger } from '../lib/logger.ts';
import type { PayCoreEnv } from './env.ts';

export type AppAuthContext = {
  appSlug: string;
  appUuid: string;
  keyId: string;
};

export type AppVariables = {
  requestId: string;
  env: PayCoreEnv;
  db: PayCoreDb;
  logger: PayCoreLogger;
  rawBody: string;
  appAuth?: AppAuthContext;
  adminActor?: string;
};

export type PayCoreHonoEnv = {
  Bindings: PayCoreEnv;
  Variables: AppVariables;
};