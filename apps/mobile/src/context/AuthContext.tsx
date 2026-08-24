import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  auth,
  type CurrentUser,
  type AuthResponse,
  type UpdateProfileInput,
  type Profile,
} from '@genzh/shared';
import { loadSavedApiUrl } from '../api/config';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  status: 'loading' | 'authenticated' | 'unauthenticated';
  error: string | null;
}

interface AuthContextType extends AuthState {
  login: (identifier: string, pass: string) => Promise<void>;
  register: (data: { handle: string; email: string; password: string; display_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileInput) => Promise<Profile | null>;
  clearError: () => void;
  refreshSession: () => Promise<void>;
}

const TOKEN_KEY = 'genzh_access_token';
const REFRESH_KEY = 'genzh_refresh_token';

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: null,
    refreshToken: null,
    user: null,
    status: 'loading',
    error: null,
  });

  const loadSession = useCallback(async () => {
    try {
      await loadSavedApiUrl();
      const token = await AsyncStorage.getItem(TOKEN_KEY);
      const refresh = await AsyncStorage.getItem(REFRESH_KEY);

      if (!token) {
        setState({ token: null, refreshToken: null, user: null, status: 'unauthenticated', error: null });
        return;
      }

      try {
        const user = await auth.me(token);
        setState({ token, refreshToken: refresh, user, status: 'authenticated', error: null });
      } catch {
        // Try refreshing if token expired
        if (refresh) {
          try {
            const pair = await auth.refresh(refresh);
            await AsyncStorage.setItem(TOKEN_KEY, pair.access_token);
            await AsyncStorage.setItem(REFRESH_KEY, pair.refresh_token);
            const user = await auth.me(pair.access_token);
            setState({
              token: pair.access_token,
              refreshToken: pair.refresh_token,
              user,
              status: 'authenticated',
              error: null,
            });
            return;
          } catch {
            // Refresh failed
          }
        }
        await AsyncStorage.removeItem(TOKEN_KEY);
        await AsyncStorage.removeItem(REFRESH_KEY);
        setState({ token: null, refreshToken: null, user: null, status: 'unauthenticated', error: null });
      }
    } catch {
      setState({ token: null, refreshToken: null, user: null, status: 'unauthenticated', error: null });
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleAuthSuccess = async (res: AuthResponse) => {
    await AsyncStorage.setItem(TOKEN_KEY, res.access_token);
    await AsyncStorage.setItem(REFRESH_KEY, res.refresh_token);
    setState({
      token: res.access_token,
      refreshToken: res.refresh_token,
      user: res.user,
      status: 'authenticated',
      error: null,
    });
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

  const register = async (data: { handle: string; email: string; password: string; display_name?: string }) => {
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
    const refresh = state.refreshToken;
    if (refresh) {
      try {
        await auth.logout(refresh);
      } catch {
        // Ignore logout errors
      }
    }
    await AsyncStorage.removeItem(TOKEN_KEY);
    await AsyncStorage.removeItem(REFRESH_KEY);
    setState({
      token: null,
      refreshToken: null,
      user: null,
      status: 'unauthenticated',
      error: null,
    });
  };

  const updateProfile = async (input: UpdateProfileInput) => {
    if (!state.token) return null;
    try {
      const updated = await auth.updateProfile(state.token, input);
      setState((s) => (s.user ? { ...s, user: { ...s.user, profile: updated } } : s));
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
