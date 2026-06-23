import type { PayCoreLogger } from '../lib/logger.ts';
import type { PayCoreSupabase } from '../lib/supabase.ts';
import type { PayCoreEnv } from './env.ts';

export type AppAuthContext = {
  appSlug: string;
  appUuid: string;
  keyId: string;
};

export type AppVariables = {
  requestId: string;
  env: PayCoreEnv;
  supabase: PayCoreSupabase;
  logger: PayCoreLogger;
  rawBody: string;
  appAuth?: AppAuthContext;
  adminActor?: string;
};

export type PayCoreHonoEnv = {
  Bindings: PayCoreEnv;
  Variables: AppVariables;
};