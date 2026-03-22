import { useState } from 'react';
import ChromeIcon from '../ChromeIcon';
import PanelChrome from '../PanelChrome';
import { useAuth } from '../../auth/AuthContext';

interface CreateAccountScreenProps {
  onSwitchToLogin: () => void;
}

export default function CreateAccountScreen({ onSwitchToLogin }: CreateAccountScreenProps) {
  const { register, isLoading } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      await register(email, password, displayName);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
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
          title="Create Account"
          icon={<ChromeIcon variant="editor" size={16} />}
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
                <label htmlFor="reg-name" className="xp-auth-label">
                  Display name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  autoComplete="nickname"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="xp-auth-input"
                  placeholder="HopperFan99"
                  maxLength={48}
                  disabled={isLoading}
                />
              </div>

              <div className="xp-auth-field-group">
                <label htmlFor="reg-email" className="xp-auth-label">
                  Email address
                </label>
                <input
                  id="reg-email"
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
                <label htmlFor="reg-password" className="xp-auth-label">
                  Password
                </label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="xp-auth-input"
                  placeholder="At least 8 characters"
                  disabled={isLoading}
                />
              </div>

              <div className="xp-auth-field-group">
                <label htmlFor="reg-confirm" className="xp-auth-label">
                  Confirm password
                </label>
                <input
                  id="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
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
                  {isLoading ? 'Creating account…' : 'Create Account'}
                </button>
              </div>
            </form>

            <div className="xp-auth-divider" aria-hidden="true" />

            <div className="xp-auth-switch">
              <span className="xp-auth-switch-label">Already have an account?</span>
              <button
                type="button"
                className="xp-btn ghost xp-auth-switch-btn"
                onClick={onSwitchToLogin}
                disabled={isLoading}
              >
                Sign In
              </button>
            </div>
          </div>
        </PanelChrome>
      </div>
    </div>
  );
}
