import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, display_name: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'hoppers_token';
const USER_KEY = 'hoppers_user';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    const rawUser = localStorage.getItem(USER_KEY);
    let user: AuthUser | null = null;
    if (rawUser) {
      try {
        user = JSON.parse(rawUser) as AuthUser;
      } catch {
        // ignore malformed stored value
      }
    }
    return { user, token, isLoading: false };
  });

  // Persist changes to localStorage whenever token/user change.
  useEffect(() => {
    if (state.token && state.user) {
      localStorage.setItem(TOKEN_KEY, state.token);
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
  }, [state.token, state.user]);

  const login = useCallback(async (email: string, password: string) => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Login failed');
      }
      const body = (await res.json()) as { token: string; user: AuthUser };
      setState({ user: body.user, token: body.token, isLoading: false });
    } catch (err) {
      setState((s) => ({ ...s, isLoading: false }));
      throw err;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, display_name: string) => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, display_name }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Registration failed');
      }
      const body = (await res.json()) as { token: string; user: AuthUser };
      setState({ user: body.user, token: body.token, isLoading: false });
    } catch (err) {
      setState((s) => ({ ...s, isLoading: false }));
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    const { token } = state;
    setState({ user: null, token: null, isLoading: false });
    if (token) {
      await apiFetch('/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {
        // Best-effort; token already cleared locally.
      });
    }
  }, [state]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout }),
    [state, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
