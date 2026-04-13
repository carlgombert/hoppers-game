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
  username: string;
  avatar_id: number | null;
  /** Persisted playable character key (e.g. 'sora', 'nick'). Defaults to 'sora'. */
  character_key: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, avatar_id?: number | null) => Promise<void>;
  logout: () => Promise<void>;
  updateAvatar: (avatar_id: number) => Promise<void>;
  updateCharacter: (character_key: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'hoppers_token';
const USER_KEY = 'hoppers_user';

// Use the same fallback as our API client
let API_BASE = import.meta.env.VITE_API_URL || 'https://hoppers-game-production.up.railway.app';
if (API_BASE && !API_BASE.startsWith('http')) {
  API_BASE = `https://${API_BASE}`;
}

async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${path}`;
  return fetch(url, {
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

  const login = useCallback(async (username: string, password: string) => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      console.log(`Fetching: ${API_BASE}/auth/login`);
      const res = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`Login failed (${res.status}). Body: ${text.slice(0, 100)}`);
        let errorMsg = 'Login failed';
        try {
          const body = JSON.parse(text);
          errorMsg = body.error ?? errorMsg;
        } catch { /* use default msg */ }
        throw new Error(errorMsg);
      }
      const body = (await res.json()) as { token: string; user: AuthUser };
      setState({ user: body.user, token: body.token, isLoading: false });
    } catch (err) {
      console.error('🔥 Auth Error Details (Login):', err);
      setState((s) => ({ ...s, isLoading: false }));
      throw err;
    }
  }, []);

  const register = useCallback(async (
    username: string,
    password: string,
    avatar_id?: number | null,
  ) => {
    setState((s) => ({ ...s, isLoading: true }));
    try {
      console.log(`Fetching: ${API_BASE}/auth/register`);
      const res = await apiFetch('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, password, avatar_id: avatar_id ?? null }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`Registration failed (${res.status}). Body: ${text.slice(0, 100)}`);
        let errorMsg = 'Registration failed';
        try {
          const body = JSON.parse(text);
          errorMsg = body.error ?? errorMsg;
        } catch { /* use default msg */ }
        throw new Error(errorMsg);
      }
      const body = (await res.json()) as { token: string; user: AuthUser };
      setState({ user: body.user, token: body.token, isLoading: false });
    } catch (err) {
      console.error('Auth Error Details (Register):', err);
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

  const updateAvatar = useCallback(async (avatar_id: number) => {
    const { token } = state;
    if (!token) throw new Error('Not authenticated');
    const res = await apiFetch('/auth/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ avatar_id }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? 'Failed to update avatar');
    }
    const body = (await res.json()) as { user: AuthUser };
    setState((s) => ({ ...s, user: body.user }));
  }, [state]);

  const updateCharacter = useCallback(async (character_key: string) => {
    const { token } = state;
    if (!token) throw new Error('Not authenticated');
    const res = await apiFetch('/auth/me', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ character_key }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? 'Failed to update character');
    }
    const body = (await res.json()) as { user: AuthUser };
    setState((s) => ({ ...s, user: body.user }));
  }, [state]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, login, register, logout, updateAvatar, updateCharacter }),
    [state, login, register, logout, updateAvatar, updateCharacter]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}

