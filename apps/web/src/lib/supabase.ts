/**
 * Supabase client singleton for the web app.
 * Uses VITE_ prefixed env vars (public — safe for browser).
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env['VITE_SUPABASE_URL'] as string;
const supabaseAnonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'] as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Persist session in localStorage
    persistSession: true,
    // Auto-refresh token before expiry
    autoRefreshToken: true,
    // Detect OAuth redirects
    detectSessionInUrl: true,
    // Flow type: pkce is more secure for SPAs
    flowType: 'pkce',
  },
});
