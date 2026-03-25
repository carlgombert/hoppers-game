import { useState } from 'react';
import { login, register, ApiError, type AuthUser } from '../../api/client';

interface Props {
  onAuth: (user: AuthUser, token: string) => void;
}

type Mode = 'login' | 'register';

export default function AuthGate({ onAuth }: Props) {
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result: { token: string; user: AuthUser };
      if (mode === 'login') {
        result = await login(email, password);
      } else {
        if (!displayName.trim()) {
          setError('Display name is required.');
          setLoading(false);
          return;
        }
        result = await register(email, password, displayName.trim());
      }
      onAuth(result.user, result.token);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Could not connect to server. Is it running?');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="xp-auth-backdrop">
      <div className="xp-auth-window shell-frame">
        <div className="xp-auth-titlebar shell-titlebar">
          <span className="xp-auth-title-text">
            {mode === 'login' ? 'Sign In — Hoppers' : 'Create Account — Hoppers'}
          </span>
        </div>
        <div className="xp-auth-body">
          <form className="xp-auth-form" onSubmit={handleSubmit} noValidate>
            {mode === 'register' && (
              <div className="xp-auth-field">
                <label className="xp-auth-label" htmlFor="auth-name">
                  Display Name
                </label>
                <input
                  id="auth-name"
                  type="text"
                  className="xp-input"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                  required
                  maxLength={40}
                />
              </div>
            )}

            <div className="xp-auth-field">
              <label className="xp-auth-label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                className="xp-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            <div className="xp-auth-field">
              <label className="xp-auth-label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                className="xp-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="xp-auth-error" role="alert">
                {error}
              </div>
            )}

            <div className="xp-auth-actions">
              <button
                type="submit"
                className="xp-btn primary"
                disabled={loading}
              >
                {loading
                  ? 'Please wait…'
                  : mode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
              </button>
            </div>
          </form>

          <div className="xp-auth-switch">
            {mode === 'login' ? (
              <>
                No account?{' '}
                <button
                  type="button"
                  className="xp-auth-link"
                  onClick={() => { setMode('register'); setError(null); }}
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="xp-auth-link"
                  onClick={() => { setMode('login'); setError(null); }}
                >
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
