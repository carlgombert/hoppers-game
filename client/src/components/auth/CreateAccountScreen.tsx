import { useState } from 'react';
import ChromeIcon from '../ChromeIcon';
import PanelChrome from '../PanelChrome';
import AvatarPicker from './AvatarPicker';
import { useAuth } from '../../auth/AuthContext';

interface CreateAccountScreenProps {
  onSwitchToLogin: () => void;
}

export default function CreateAccountScreen({ onSwitchToLogin }: CreateAccountScreenProps) {
  const { register, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [avatarId, setAvatarId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!avatarId) {
      setError('Please choose an avatar before continuing');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    try {
      await register(username, password, avatarId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  }

  return (
    <div className="xp-auth-backdrop">
      <div className="xp-auth-shell xp-auth-shell--wide">
        {/* Branding band */}
        <div className="xp-auth-brand">
          <ChromeIcon variant="game" className="xp-auth-brand-icon" />
          <span className="xp-auth-brand-name">Hoppers</span>
        </div>

        <PanelChrome
          title="Create Account"
          icon={<ChromeIcon variant="plus" size={16} />}
          titlebarClassName="auth"
        >
          <div className="xp-auth-form-body">
            {error && (
              <div className="xp-auth-error" role="alert">
                <svg className="xp-auth-error-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1.5L14.5 13H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
                </svg>
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Avatar picker section */}
              <div className="xp-auth-section-heading">Choose your avatar</div>
              <AvatarPicker
                selected={avatarId}
                onChange={setAvatarId}
                disabled={isLoading}
              />

              <div className="xp-auth-field-group" style={{ marginTop: '18px' }}>
                <label htmlFor="reg-username" className="xp-auth-label">
                  Username
                </label>
                <input
                  id="reg-username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="xp-auth-input"
                  placeholder="HopperFan99"
                  maxLength={48}
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

