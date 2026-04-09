import { useState } from 'react';
import AvatarPicker, { getAvatarSrc } from '../auth/AvatarPicker';
import CharacterPicker from '../characters/CharacterPicker';
import ChromeIcon from '../ChromeIcon';
import { useAuth } from '../../auth/AuthContext';
import { DEFAULT_CHARACTER_KEY } from '../../types/characters';

export default function SettingsPage() {
  const { user, updateAvatar, updateCharacter, logout } = useAuth();

  const [selectedAvatar, setSelectedAvatar] = useState<number | null>(
    user?.avatar_id ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  const [selectedCharacter, setSelectedCharacter] = useState<string>(
    user?.character_key ?? DEFAULT_CHARACTER_KEY,
  );
  const [savingCharacter, setSavingCharacter] = useState(false);
  const [characterSaveStatus, setCharacterSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [characterSaveError, setCharacterSaveError] = useState<string | null>(null);

  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  const avatarChanged = selectedAvatar !== null && selectedAvatar !== user.avatar_id;
  const characterChanged = selectedCharacter !== user.character_key;

  async function handleSaveAvatar() {
    if (!selectedAvatar) return;
    setSaving(true);
    setSaveStatus('idle');
    setSaveError(null);
    try {
      await updateAvatar(selectedAvatar);
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Failed to update avatar');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCharacter() {
    setSavingCharacter(true);
    setCharacterSaveStatus('idle');
    setCharacterSaveError(null);
    try {
      await updateCharacter(selectedCharacter);
      setCharacterSaveStatus('success');
    } catch (err) {
      setCharacterSaveStatus('error');
      setCharacterSaveError(err instanceof Error ? err.message : 'Failed to update character');
    } finally {
      setSavingCharacter(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="xp-settings-layout">

      {/* ── Profile Module ─────────────────────────────────── */}
      <div className="xp-settings-module">
        <div className="xp-settings-module-header">ACCOUNT PROFILE</div>
        <div className="xp-settings-module-body">

          {/* Current identity strip */}
          <div className="xp-settings-identity">
            <div className="xp-settings-identity-avatar">
              {user.avatar_id ? (
                <img
                  src={getAvatarSrc(user.avatar_id)}
                  alt={user.display_name}
                  className="xp-settings-identity-avatar-img"
                  draggable={false}
                />
              ) : (
                <ChromeIcon variant="profile" className="xp-settings-identity-avatar-icon" />
              )}
            </div>
            <div className="xp-settings-identity-info">
              <span className="xp-settings-identity-name">{user.display_name}</span>
              <span className="xp-settings-identity-email">{user.email}</span>
            </div>
          </div>

          {/* Avatar picker section */}
          <div className="xp-settings-section">
            <div className="xp-settings-section-label">Choose Avatar</div>
            <AvatarPicker
              selected={selectedAvatar}
              onChange={(id) => {
                setSelectedAvatar(id);
                setSaveStatus('idle');
                setSaveError(null);
              }}
              disabled={saving}
            />
          </div>

          {/* Status feedback */}
          {saveStatus === 'success' && (
            <div className="xp-settings-feedback success" role="status">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="xp-settings-feedback-icon">
                <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Avatar updated successfully
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="xp-settings-feedback error" role="alert">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="xp-settings-feedback-icon">
                <path d="M8 1.5L14.5 13H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
              </svg>
              {saveError}
            </div>
          )}

          {/* Save action */}
          <div className="xp-settings-actions">
            <button
              type="button"
              className="xp-btn xp-settings-save-btn"
              onClick={handleSaveAvatar}
              disabled={saving || !avatarChanged}
              aria-busy={saving}
            >
              {saving ? 'Saving…' : 'Update Avatar'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Account Info Module ────────────────────────────── */}
      <div className="xp-settings-module">
        <div className="xp-settings-module-header">ACCOUNT INFO</div>
        <div className="xp-settings-module-body">
          <div className="xp-settings-info-row">
            <span className="xp-settings-info-label">Display name</span>
            <span className="xp-settings-info-value">{user.display_name}</span>
          </div>
          <div className="xp-settings-info-separator" aria-hidden="true" />
          <div className="xp-settings-info-row">
            <span className="xp-settings-info-label">Email</span>
            <span className="xp-settings-info-value">{user.email}</span>
          </div>
        </div>
      </div>

      {/* ── Character Module ───────────────────────────────── */}
      <div className="xp-settings-module">
        <div className="xp-settings-module-header">PLAYABLE CHARACTER</div>
        <div className="xp-settings-module-body">

          <div className="xp-settings-section">
            <div className="xp-settings-section-label">Choose Character</div>
            <CharacterPicker
              selected={selectedCharacter}
              onChange={(key) => {
                setSelectedCharacter(key);
                setCharacterSaveStatus('idle');
                setCharacterSaveError(null);
              }}
              disabled={savingCharacter}
            />
          </div>

          {characterSaveStatus === 'success' && (
            <div className="xp-settings-feedback success" role="status">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="xp-settings-feedback-icon">
                <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Character updated successfully
            </div>
          )}
          {characterSaveStatus === 'error' && (
            <div className="xp-settings-feedback error" role="alert">
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className="xp-settings-feedback-icon">
                <path d="M8 1.5L14.5 13H1.5L8 1.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M8 6v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
              </svg>
              {characterSaveError}
            </div>
          )}

          <div className="xp-settings-actions">
            <button
              type="button"
              className="xp-btn xp-settings-save-btn"
              onClick={handleSaveCharacter}
              disabled={savingCharacter || !characterChanged}
              aria-busy={savingCharacter}
            >
              {savingCharacter ? 'Saving…' : 'Update Character'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Account Actions Module ─────────────────────────── */}
      <div className="xp-settings-module">
        <div className="xp-settings-module-header">ACCOUNT ACTIONS</div>
        <div className="xp-settings-module-body">
          <div className="xp-settings-action-row">
            <div className="xp-settings-action-desc">
              <span className="xp-settings-action-title">Sign out</span>
              <span className="xp-settings-action-sub">End your current session and return to the login screen</span>
            </div>
            <button
              type="button"
              className="xp-btn danger xp-settings-action-btn"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-busy={signingOut}
            >
              {signingOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
