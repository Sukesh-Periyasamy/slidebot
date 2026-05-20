import { createClient } from '@supabase/supabase-js';

import { env } from './env';

/**
 * Supabase admin client — uses service role key for server-side operations.
 * NEVER expose this to the client.
 */
export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
