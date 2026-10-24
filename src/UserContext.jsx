import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './utils/supabaseClient';
import { getAuthToken, setAuthTokenInMemory } from './utils/getAuthToken';
import { emailConfig } from './config/email.js';
export const UserContext = createContext();

const LOGGED_OUT_KEY = 'md_logged_out';
const LOGOUT_EVENT_KEY = 'md_logout_event';

function clearBrowserAuthState() {
  try {
    const currentTheme = localStorage.getItem('matchdistrict_theme') ||
      (document.documentElement.classList.contains('light') ? 'light' : 'dark');

    const preserved = {
      matchdistrict_theme: currentTheme
    };
    
    // Preserve remembered account names for the account switcher UI if explicitly saved, but NEVER auth tokens or user records
    const rememberedAccounts = localStorage.getItem('md_remembered_accounts');
    if (rememberedAccounts) {
      preserved['md_remembered_accounts'] = rememberedAccounts;
    }

    const authStorageKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const normalizedKey = key.toLowerCase();
      if (
        key === 'md_persistent_session' ||
        key === 'md_user' ||
        normalizedKey.includes('supabase') ||
        normalizedKey.includes('auth') ||
        normalizedKey.includes('token') ||
        normalizedKey.includes('session')
      ) {
        authStorageKeys.push(key);
      }
    }

    authStorageKeys.forEach((key) => localStorage.removeItem(key));
    sessionStorage.clear();

    // Set short-lived logged out flag in sessionStorage
    try {
      sessionStorage.setItem(LOGGED_OUT_KEY, 'true');
    } catch {}

    // Ensure theme and other preserved preferences remain intact across sign-out
    Object.entries(preserved).forEach(([k, v]) => {
      try {
        localStorage.setItem(k, v);
      } catch {}
    });
  } catch (e) {
    console.warn('Storage clear failed:', e);
  }
}

export function UserProvider({ children }) {
  const [userState, setUserState] = useState(null);
  const [loading, setLoading] = useState(true);
  const userRef = useRef(null);
  const fetchUserRef = useRef(null);
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    userRef.current = userState;
    if (userState) {
      // Any explicit authenticated user state clears the logged-out lockout flag
      try {
        sessionStorage.removeItem(LOGGED_OUT_KEY);
      } catch {}
    }
  }, [userState]);

  // Re-fetch user profile from server (handles external changes like admin KYC approval)
  const refetchUser = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    try {
      if (sessionStorage.getItem(LOGGED_OUT_KEY) === 'true') return;
    } catch {}

    if (!userRef.current?.id) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        if (!isLoggingOutRef.current) {
          setUserState(data.user);
        }
      }
    } catch (e) {
      // silent — don't disrupt the UI for a background refetch
    }
  }, []);

  fetchUserRef.current = refetchUser;

  // Re-fetch on tab focus (catches admin KYC/role changes)
  useEffect(() => {
    const onFocus = () => {
      if (isLoggingOutRef.current) return;
      try {
        if (sessionStorage.getItem(LOGGED_OUT_KEY) === 'true') return;
      } catch {}
      fetchUserRef.current?.();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  // Multi-tab synchronization: broadcast channel & storage event listener
  useEffect(() => {
    const handleRemoteLogout = () => {
      isLoggingOutRef.current = true;
      setUserState(null);
      userRef.current = null;
      setAuthTokenInMemory(null);
      clearBrowserAuthState();
      try {
        if (window.google?.accounts?.id?.disableAutoSelect) {
          window.google.accounts.id.disableAutoSelect();
        }
      } catch {}
      // Replace window location to prevent stale back-button state
      window.location.replace('/');
    };

    let channel = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        channel = new BroadcastChannel('matchdistrict_auth');
        channel.onmessage = (event) => {
          if (event.data?.type === 'LOGOUT') {
            handleRemoteLogout();
          }
        };
      }
    } catch {}

    const onStorage = (e) => {
      if (e.key === LOGOUT_EVENT_KEY) {
        handleRemoteLogout();
      }
    };
    window.addEventListener('storage', onStorage);

    return () => {
      if (channel) {
        try { channel.close(); } catch {}
      }
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let supabaseSub = null;

    async function initializeAuth() {
      // 1. Check for active cookie-backed session via /api/auth/me (e.g. from Discord or Google auth redirects)
      try {
        const meRes = await fetch('/api/auth/me', { credentials: 'include' });
        if (meRes.ok) {
          const meData = await meRes.json();
          if (active && meData.success && meData.user) {
            try {
              sessionStorage.removeItem(LOGGED_OUT_KEY);
            } catch {}
            setUserState(meData.user);
            if (meData.encryptedSession) {
              try {
                localStorage.setItem('md_persistent_session', meData.encryptedSession);
              } catch {}
            }
            setLoading(false);
            return;
          }
        }
      } catch (err) {
        // silent fallback
      }

      // 2. If no active server cookie session and user explicitly logged out, block localStorage restoration
      try {
        if (sessionStorage.getItem(LOGGED_OUT_KEY) === 'true') {
          setLoading(false);
          return;
        }
      } catch {}

      // 3. Fallback: Restore encrypted persistent session from localStorage
      const persistentSession = localStorage.getItem('md_persistent_session');
      if (persistentSession) {
        try {
          const res = await fetch('/api/auth/restore-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ encryptedSession: persistentSession })
          });
          const data = await res.json();
          if (active && res.ok && data.success) {
            if (data.encryptedSession) {
              localStorage.setItem('md_persistent_session', data.encryptedSession);
            }
            setUserState(data.user);
            setLoading(false);
            return;
          }
          localStorage.removeItem('md_persistent_session');
        } catch (err) {
          console.warn('Failed to restore encrypted persistent session, falling back to Supabase auth:', err);
          localStorage.removeItem('md_persistent_session');
        }
      }

      // Fallback: Supabase's built-in session engine
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!active) return;
        
        // Preserve admin state across auth events (admin users may not have Supabase auth sessions)
        if (userRef.current?.role === 'admin' || userRef.current?.id === 'ADM-001' || (emailConfig.admin && userRef.current?.email === emailConfig.admin)) {
          setLoading(false);
          return;
        }

        if (session?.user) {
          // Pull user profile directly from the encrypted server-side database.
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          setUserState(profile ?? null);
        } else {
          // Only clear user state if the session is explicitly signed out or no custom session was set
          if (event === 'SIGNED_OUT') {
            setUserState(null);
          }
        }
        setLoading(false);
      });

      supabaseSub = subscription;
    }

    initializeAuth();

    return () => {
      active = false;
      if (supabaseSub) {
        supabaseSub.unsubscribe();
      }
    };
  }, []);

  /**
   * Perform a server-side profile mutation and update global context.
   * All profile updates must go through this function — never mutate local state directly.
   */
  const updateProfile = async (updates) => {
    if (!userState?.id) return { error: new Error('No authenticated user profile') };
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userState.id)
      .select()
      .single();
    if (!error && data) {
      setUserState(data);
    }
    return { data, error };
  };

  /**
   * Perform a full sign-out:
   * 1. Informs server to clear HttpOnly cookies (/api/auth/logout).
   * 2. Clears in-memory token cache and React context state.
   * 3. Wipes localStorage / sessionStorage auth keys (retaining theme only).
   * 4. Broadcasts logout to all open tabs via BroadcastChannel & storage event.
   * 5. Invalidates Supabase session.
   * 6. Disables Google One Tap / auto-select.
   * 7. Sets short-lived logged-out flag to prevent instant restore.
   * 8. Navigates with replace to home so browser back button never shows authenticated views.
   */
  const signOut = async () => {
    isLoggingOutRef.current = true;

    // 1. Clear in-memory token and React state immediately
    setUserState(null);
    userRef.current = null;
    setAuthTokenInMemory(null);

    // 2. Set the short-lived logged out flag
    try {
      sessionStorage.setItem(LOGGED_OUT_KEY, 'true');
    } catch {}

    // 3. Clear browser storage (theme preserved, md_user wiped)
    clearBrowserAuthState();

    // 4. Broadcast to other open browser tabs
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const channel = new BroadcastChannel('matchdistrict_auth');
        channel.postMessage({ type: 'LOGOUT', timestamp: Date.now() });
        channel.close();
      }
      localStorage.setItem(LOGOUT_EVENT_KEY, String(Date.now()));
    } catch (bcErr) {
      console.warn('BroadcastChannel error:', bcErr);
    }

    // 5. Invalidate Supabase session
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut failed:', e);
    }

    // 6. Disable Google auto-select / One Tap so it cannot auto re-login
    try {
      if (window.google?.accounts?.id?.disableAutoSelect) {
        window.google.accounts.id.disableAutoSelect();
      }
    } catch (gErr) {
      console.warn('Google disableAutoSelect failed:', gErr);
    }

    // 7. Clear client-accessible cookie variants as a secondary defense
    try {
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax; Secure';
    } catch {}

    // 8. Clear Cache Storage API caches
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
      } catch (cacheErr) {
        console.warn('Failed to clear Cache Storage:', cacheErr);
      }
    }

    // 9. Call server logout endpoint to clear HttpOnly cookies on the server
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (netErr) {
      // Local cleanup proceeds regardless; never display server network error on logout
      console.warn('Server logout request failed:', netErr);
    }

    // 10. Navigate with replace to root/home so back-button does not show protected views
    window.location.replace('/');
  };

  return (
    <UserContext.Provider value={{
      currentUser: userState,
      setCurrentUser: setUserState,
      userState,
      setUserState,
      updateProfile,
      refetchUser,
      signOut,
      loading
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}
