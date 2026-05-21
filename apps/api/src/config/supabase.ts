import { createClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';

import { env } from './env';

/**
 * Supabase admin client — uses service role key for server-side operations.
 * NEVER expose this to the client.
 */
const realtimeTransport = WebSocket as unknown as never;

export const supabaseAdmin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
  realtime: {
    transport: realtimeTransport,
  },
});
