import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSupabase } from '@/context/SupabaseContext.jsx';

const AuthContext = createContext(null);

const FALLBACK_REDIRECT_URL = import.meta?.env?.VITE_PUBLIC_APP_URL
  || import.meta?.env?.VITE_APP_BASE_URL
  || import.meta?.env?.VITE_SITE_URL
  || null;

function extractProfile(session) {
  const user = session?.user;
  if (!user) return null;
  const metadata = user.user_metadata || {};
  const name = metadata.full_name
    || metadata.name
    || [metadata.given_name, metadata.family_name].filter(Boolean).join(' ')
    || metadata.preferred_username
    || null;

  return {
    id: user.id,
    email: user.email || metadata.email || null,
    name,
  };
}

function resolveRedirectUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  if (FALLBACK_REDIRECT_URL) {
    return FALLBACK_REDIRECT_URL;
  }
  return undefined;
}

export function AuthProvider({ children }) {
  console.log('[DEBUG 6] AuthProvider rendering.');
  const { authClient, session: supabaseSession, loading } = useSupabase();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    setSession(supabaseSession || null);
    setProfile(extractProfile(supabaseSession));
  }, [supabaseSession]);

  const ensureAuthClient = useCallback(() => {
    if (loading) {
      throw new Error('Supabase authentication is still initializing.');
    }
    if (!authClient) {
      throw new Error('Supabase authentication client is unavailable.');
    }
    return authClient;
  }, [authClient, loading]);

  const signOut = useCallback(async () => {
    const client = ensureAuthClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }, [ensureAuthClient]);

  const signInWithEmail = useCallback(async (email, password) => {
    const client = ensureAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  }, [ensureAuthClient]);

  const signInWithOAuth = useCallback(async (provider) => {
    const client = ensureAuthClient();
    const redirectTo = resolveRedirectUrl();
    const oauthOptions = redirectTo ? { redirectTo } : {};
    const { data, error } = await client.auth.signInWithOAuth({
      provider,
      options: oauthOptions,
    });
    if (error) throw error;
    return data;
  }, [ensureAuthClient]);

  const status = loading ? 'loading' : 'ready';

  const value = useMemo(() => ({
    status,
    session,
    user: profile,
    signOut,
    signInWithEmail,
    signInWithOAuth,
  }), [status, session, profile, signOut, signInWithEmail, signInWithOAuth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
