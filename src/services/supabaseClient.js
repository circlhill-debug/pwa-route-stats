/* global supabase */

// Supabase client bootstrap and auth callback utilities.
export const SUPABASE_URL  = 'https://ouwkdtiixkaydrtfdhnh.supabase.co';
export const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im91d2tkdGlpeGtheWRydGZkaG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUwMDc0NDksImV4cCI6MjA3MDU4MzQ0OX0.KI-dYG5_A8jvPEHSog3wlnLbIGYIHQR_4ztXHL2SzIg';

export function createSupabaseClient(){
  return supabase.createClient(SUPABASE_URL, SUPABASE_ANON, { auth:{ persistSession:true }});
}

export async function handleAuthCallback(sb){
  try {
    const url = new URL(window.location.href);
    const hasHashToken =
      url.hash.includes('access_token=') || url.hash.includes('refresh_token=');
    const code = url.searchParams.get('code');

    let out = null;

    if (hasHashToken) {
      const { data, error } = await sb.auth.exchangeCodeForSession(url.hash);
      if (error) throw error;
      out = data;
    } else if (code) {
      const { data, error } = await sb.auth.exchangeCodeForSession(code);
      if (error) throw error;
      out = data;
    } else {
      const { data, error } = await sb.auth.getSession();
      if (error) console.warn('[Auth] getSession warning:', error.message);
      out = data;
    }

    if (hasHashToken || code) {
      window.history.replaceState({}, document.title, url.origin + url.pathname);
    }

    console.log('[Auth] session ready', out?.session ? '(signed in)' : '(no session)');
    return out?.session || null;
  } catch (err) {
    console.warn('Auth callback error –', err);
    return null;
  }
}
