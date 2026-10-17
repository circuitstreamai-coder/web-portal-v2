import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(env.PUBLIC_SUPABASE_URL?.trim() && env.PUBLIC_SUPABASE_ANON_KEY?.trim());
}

export function getSupabaseClient(): SupabaseClient {
  const url = env.PUBLIC_SUPABASE_URL?.trim();
  const anonKey = env.PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) {
    throw new Error('PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are required');
  }

  if (!client) {
    client = createClient(
      url.replace(/\/$/, ''),
      anonKey,
      {
        auth: {
          persistSession: browser,
          autoRefreshToken: browser,
          detectSessionInUrl: browser,
        },
      },
    );
  }

  return client;
}

export function supabaseFunctionUrl(functionName: string, path = ''): string {
  const base = env.PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!base) throw new Error('PUBLIC_SUPABASE_URL is required');
  return `${base}/functions/v1/${functionName}${path}`;
}

export async function supabaseAuthHeaders(
  headers?: HeadersInit,
): Promise<Headers> {
  const output = new Headers(headers);
  const supabase = getSupabaseClient();
  const anonKey = env.PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!anonKey) throw new Error('PUBLIC_SUPABASE_ANON_KEY is required');
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  output.set('apikey', anonKey);
  if (token) output.set('Authorization', `Bearer ${token}`);
  return output;
}
