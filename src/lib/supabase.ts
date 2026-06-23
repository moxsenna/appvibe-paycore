import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PayCoreEnv } from '../types/env.ts';

export type PayCoreSupabase = SupabaseClient;

export function createSupabaseAdmin(env: PayCoreEnv): PayCoreSupabase {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}