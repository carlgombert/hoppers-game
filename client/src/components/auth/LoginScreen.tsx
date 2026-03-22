import { useState } from 'react';
import ChromeIcon from '../ChromeIcon';
import PanelChrome from '../PanelChrome';
import { useAuth } from '../../auth/AuthContext';

interface LoginScreenProps {
  onSwitchToRegister: () => void;
}

export default function LoginScreen({ onSwitchToRegister }: LoginScreenProps) {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  return (
    <div className="xp-auth-backdrop">
      <div className="xp-auth-shell">
        {/* Branding band */}
        <div className="xp-auth-brand">
          <ChromeIcon variant="game" className="xp-auth-brand-icon" />
          <span className="xp-auth-brand-name">Hoppers</span>
        </div>

        <PanelChrome
          title="Sign In"
          icon={<ChromeIcon variant="profile" size={16} />}
        >
          <div className="xp-auth-form-body">
            {error && (
              <div className="xp-auth-error" role="alert">
                <ChromeIcon variant="settings" className="xp-auth-error-icon" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              <div className="xp-auth-field-group">
                <label htmlFor="login-email" className="xp-auth-label">
                  Email address
                </label>
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="xp-auth-input"
                  placeholder="your@email.com"
                  disabled={isLoading}
                />
              </div>

              <div className="xp-auth-field-group">
                <label htmlFor="login-password" className="xp-auth-label">
                  Password
                </label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="xp-auth-input"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
              </div>

              <div className="xp-auth-actions">
                <button
                  type="submit"
                  className="xp-btn xp-auth-submit"
                  disabled={isLoading}
                  aria-busy={isLoading}
                >
                  {isLoading ? 'Signing in…' : 'Sign In'}
                </button>
              </div>
            </form>

            <div className="xp-auth-divider" aria-hidden="true" />

            <div className="xp-auth-switch">
              <span className="xp-auth-switch-label">New to Hoppers?</span>
              <button
                type="button"
                className="xp-btn ghost xp-auth-switch-btn"
                onClick={onSwitchToRegister}
                disabled={isLoading}
              >
                Create Account
              </button>
            </div>
          </div>
        </PanelChrome>
      </div>
    </div>
  );
}
