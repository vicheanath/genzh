import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ApiError,
  auth,
  setTokenProvider,
  type AuthResponse,
  type CurrentUser,
  type Profile,
  type TokenPair,
  type UpdateProfileInput,
} from '@genzh/shared';

import { loadSavedApiUrl } from '../api/config';
import { chatSocket, syncSocketBaseUrl } from '../lib/socket';
import { hydrateAppStore } from '../lib/store';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (identifier: string, pass: string) => Promise<void>;
  register: (data: {
    handle: string;
    email: string;
    password: string;
    display_name?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<Profile | null>;
  /**
   * A usable access token, refreshed first if the current one has expired.
   *
   * Every API call goes through this rather than reading `token` directly: an
   * access token lives fifteen minutes, and a phone that has been in a pocket
   * since breakfast is holding a dead one.
   */
  getToken: () => Promise<string>;
  /** Write a freshly-saved profile into the session without a refetch. */
  applyProfile: (profile: Profile) => void;
  clearError: () => void;
  refreshSession: () => Promise<void>;
}

const TOKEN_KEY = 'genzh_access_token';
const REFRESH_KEY = 'genzh_refresh_token';
const EXPIRES_KEY = 'genzh_token_expires_at';

const AuthContext = createContext<AuthContextType | null>(null);

interface Session {
  accessToken: string;
  refreshToken: string;
  /** Epoch milliseconds at which the access token expires. */
  expiresAt: number;
}

async function persist(tokens: TokenPair): Promise<Session> {
  const session: Session = {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    // Refresh a minute early so a request in flight cannot straddle expiry.
    expiresAt: Date.now() + Math.max(0, tokens.expires_in - 60) * 1000,
  };
  await AsyncStorage.multiSet([
    [TOKEN_KEY, session.accessToken],
    [REFRESH_KEY, session.refreshToken],
    [EXPIRES_KEY, String(session.expiresAt)],
  ]);
  return session;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    refreshToken: null,
    user: null,
    status: 'loading',
    error: null,
  });

  const session = useRef<Session | null>(null);
  // De-duplicates concurrent refreshes: five screens noticing an expired token
  // at once must produce one refresh, not five — and five would invalidate each
  // other, since refresh tokens are single-use.
  const refreshing = useRef<Promise<string> | null>(null);

  const signOutLocally = useCallback(() => {
    session.current = null;
    void AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, EXPIRES_KEY]);
    chatSocket.disconnect();
    setState({
      token: null,
      refreshToken: null,
      user: null,
      status: 'unauthenticated',
      error: null,
    });
  }, []);

  const adopt = useCallback((next: Session, user: CurrentUser) => {
    session.current = next;
    chatSocket.setToken(next.accessToken);
    setState({
      token: next.accessToken,
      refreshToken: next.refreshToken,
      user,
      status: 'authenticated',
      error: null,
    });
  }, []);

  const getToken = useCallback(async (): Promise<string> => {
    const current = session.current;
    if (!current) throw new ApiError(401, 'UNAUTHENTICATED', 'Not signed in');

    if (Date.now() < current.expiresAt) return current.accessToken;

    if (!refreshing.current) {
      refreshing.current = (async () => {
        try {
          const tokens = await auth.refresh(current.refreshToken);
          const next = await persist(tokens);
          session.current = next;
          chatSocket.setToken(next.accessToken);
          setState((s) => ({
            ...s,
            token: next.accessToken,
            refreshToken: next.refreshToken,
          }));
          return next.accessToken;
        } catch (error) {
          // A refresh failure is terminal: the session is gone and the user has
          // to sign in again.
          signOutLocally();
          throw error;
        } finally {
          refreshing.current = null;
        }
      })();
    }

    return refreshing.current;
  }, [signOutLocally]);

  useEffect(() => {
    setTokenProvider(getToken);
    return () => {
      setTokenProvider(null);
    };
  }, [getToken]);

  const loadSession = useCallback(async () => {
    try {
      await loadSavedApiUrl();
      syncSocketBaseUrl();
      await hydrateAppStore();

      const [[, token], [, refresh], [, expiresRaw]] = await AsyncStorage.multiGet([
        TOKEN_KEY,
        REFRESH_KEY,
        EXPIRES_KEY,
      ]);

      if (!token || !refresh) {
        signOutLocally();
        return;
      }

      session.current = {
        accessToken: token,
        refreshToken: refresh,
        // A session stored before this field existed reads as already expired,
        // which sends it straight through the refresh path rather than making a
        // request with a token of unknown age.
        expiresAt: Number(expiresRaw) || 0,
      };

      try {
        const fresh = await getToken();
        const user = await auth.me(fresh);
        adopt(session.current, user);
      } catch {
        signOutLocally();
      }
    } catch {
      signOutLocally();
    }
  }, [adopt, getToken, signOutLocally]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const handleAuthSuccess = async (res: AuthResponse) => {
    const next = await persist(res);
    adopt(next, res.user);
  };

  const login = async (identifier: string, pass: string) => {
    setState((s) => ({ ...s, error: null }));
    try {
      const res = await auth.login({ identifier, password: pass });
      await handleAuthSuccess(res);
    } catch (err: any) {
      setState((s) => ({ ...s, error: err?.message || 'Login failed' }));
      throw err;
    }
  };

  const register = async (data: {
    handle: string;
    email: string;
    password: string;
    display_name?: string;
  }) => {
    setState((s) => ({ ...s, error: null }));
    try {
      const res = await auth.register(data);
      await handleAuthSuccess(res);
    } catch (err: any) {
      setState((s) => ({ ...s, error: err?.message || 'Registration failed' }));
      throw err;
    }
  };

  const logout = async () => {
    const current = session.current;
    // Sign out locally first: the user should never be stuck signed in because
    // the network is down.
    signOutLocally();
    if (current) {
      try {
        await auth.logout(current.refreshToken);
      } catch {
        // The server-side session expires on its own.
      }
    }
  };

  const applyProfile = useCallback((profile: Profile) => {
    setState((s) => (s.user ? { ...s, user: { ...s.user, profile } } : s));
  }, []);

  const updateProfile = async (input: UpdateProfileInput) => {
    try {
      const updated = await auth.updateProfile(await getToken(), input);
      applyProfile(updated);
      return updated;
    } catch (err: any) {
      setState((s) => ({ ...s, error: err?.message || 'Update failed' }));
      throw err;
    }
  };

  const clearError = () => setState((s) => ({ ...s, error: null }));

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        logout,
        updateProfile,
        getToken,
        applyProfile,
        clearError,
        refreshSession: loadSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
