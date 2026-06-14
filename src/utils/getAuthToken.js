import { supabase } from './supabaseClient';

/**
 * Returns an auth token for API requests. Prefers our custom JWT from the
 * `token` cookie (signed with JWT_SECRET and accepted by verifyJwt()),
 * falling back to the Supabase access_token for OAuth users.
 *
 * @returns {Promise<string|null>}
 */
export async function getAuthToken() {
  try {
    // Prefer our custom JWT from the token cookie (signed with our JWT_SECRET,
    // which the server's verifyJwt() accepts). The Supabase access_token is
    // signed by Supabase and will be rejected by our server.
    const match = document.cookie.match(/(^|;)\s*token\s*=\s*([^;]+)/);
    if (match) return decodeURIComponent(match[2]);

    // Fallback to Supabase session (for OAuth users)
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) {
      return data.session.access_token;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Synchronously returns our custom JWT from the token cookie.
 * Useful for non-async contexts. Falls back gracefully to null.
 *
 * @returns {string|null}
 */
export function getAuthTokenSync() {
  // Supabase stores the session in its own internal storage layer.
  // We surface the most recently cached value if already loaded.
  try {
    const match = document.cookie.match(/(^|;)\s*token\s*=\s*([^;]+)/);
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}
