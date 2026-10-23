import { supabase } from './supabaseClient';

let inMemoryAuthToken = null;

export function setAuthTokenInMemory(token) {
  inMemoryAuthToken = token || null;
}

export function clearAuthTokenInMemory() {
  inMemoryAuthToken = null;
}

export function getAuthTokenInMemory() {
  return inMemoryAuthToken;
}

/**
 * Returns an auth token for API requests. Prefers in-memory token,
 * then custom JWT from the 'token' cookie if readable,
 * falling back to Supabase access_token for OAuth users.
 * Note: When HttpOnly cookies are enabled, credentials: 'include' in fetch
 * handles authentication directly on the server.
 *
 * @returns {Promise<string|null>}
 */
export async function getAuthToken() {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('md_logged_out') === 'true') {
      return null;
    }
  } catch {}
  if (inMemoryAuthToken) return inMemoryAuthToken;
  try {
    const match = document.cookie.match(/(^|;)\s*token\s*=\s*([^;]+)/);
    if (match) return decodeURIComponent(match[2]);

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
 * Synchronously returns custom JWT from memory or cookie.
 * @returns {string|null}
 */
export function getAuthTokenSync() {
  if (inMemoryAuthToken) return inMemoryAuthToken;
  try {
    const match = document.cookie.match(/(^|;)\s*token\s*=\s*([^;]+)/);
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}
