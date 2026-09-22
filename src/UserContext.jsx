import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from './utils/supabaseClient';
import { getAuthToken } from './utils/getAuthToken';
import { emailConfig } from './config/email.js';
export const UserContext = createContext();

function clearBrowserAuthState() {
  try {
    const preserved = {};
    const preserveKeys = ['md_remembered_accounts', 'md_user'];
    preserveKeys.forEach((k) => {
      try { const v = localStorage.getItem(k); if (v) preserved[k] = v; } catch {}
    });

    const authStorageKeys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key) continue;
      const normalizedKey = key.toLowerCase();
      if (
        key === 'md_persistent_session' ||
        normalizedKey.includes('supabase') ||
        normalizedKey.includes('auth') ||
        normalizedKey.includes('token')
      ) {
        authStorageKeys.push(key);
      }
    }

    authStorageKeys.forEach((key) => localStorage.removeItem(key));
    localStorage.clear();
    sessionStorage.clear();

    Object.entries(preserved).forEach(([k, v]) => {
      try { localStorage.setItem(k, v); } catch {}
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

  useEffect(() => {
    userRef.current = userState;
  }, [userState]);

  // Re-fetch user profile from server (handles external changes like admin KYC approval)
  const refetchUser = useCallback(async () => {
    if (!userRef.current?.id) return;
    try {
      const token = await getAuthToken();
      if (!token) return;
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setUserState(data.user);
      }
    } catch (e) {
      // silent — don't disrupt the UI for a background refetch
    }
  }, []);

  fetchUserRef.current = refetchUser;

  // Re-fetch on tab focus (catches admin KYC/role changes)
  useEffect(() => {
    const onFocus = () => fetchUserRef.current();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    let active = true;
    let supabaseSub = null;

    async function initializeAuth() {
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
   * Perform a full sign-out: invalidates the Supabase session on the server,
   * clears all browser storage/caches, and redirects cleanly.
   */
  const signOut = async () => {
    setUserState(null);
    clearBrowserAuthState();

    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Supabase signOut failed:', e);
    }
    
    // Clear cookies
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax';

    // Clear Cache Storage API caches
    if ('caches' in window) {
      try {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map(name => caches.delete(name)));
        console.log('Cache Storage cleared successfully.');
      } catch (cacheErr) {
        console.warn('Failed to clear Cache Storage:', cacheErr);
      }
    }
    
    // Reload page to hard reset memory space and service worker registrations
    window.location.reload();
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
