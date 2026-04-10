import { useState, useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import ChromeIcon from '../ChromeIcon';
import { createParty, joinParty, fetchLevel, getToken, type ApiParty, type ApiLevel } from '../../api/client';
import { type Level } from '../../types/level';
import { normalizeBackdropId } from '../../game/backdrops';

const SOCKET_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

export interface PartyReadyPayload {
  socket: Socket;
  partyCode: string;
  level: Level;
}

interface Props {
  /** User's own levels (for host flow — select which level to play) */
  myLevels: Level[];
  onPartyReady: (payload: PartyReadyPayload) => void;
}

type LobbyMode = 'choose' | 'host' | 'guest';
type HostStep = 'pick' | 'waiting';
type GuestStep = 'enter' | 'waiting';

function apiLevelToLevel(l: ApiLevel): Level {
  return {
    id: l.id,
    title: l.title,
    description: l.description ?? '',
    backdrop_id: normalizeBackdropId(l.backdrop_id),
    tile_data: l.tile_data ?? [],
    published: l.published,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

export default function PartyLobby({ myLevels, onPartyReady }: Props) {
  const [mode, setMode] = useState<LobbyMode>('choose');

  // Host state
  const [hostStep, setHostStep] = useState<HostStep>('pick');
  const [selectedLevelId, setSelectedLevelId] = useState<string>('');
  const [partyCode, setPartyCode] = useState<string>('');
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostBusy, setHostBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Guest state
  const [guestStep, setGuestStep] = useState<GuestStep>('enter');
  const [codeInput, setCodeInput] = useState('');
  const [guestError, setGuestError] = useState<string | null>(null);
  const [guestBusy, setGuestBusy] = useState(false);

  // Shared party/level state
  const [activeParty, setActiveParty] = useState<ApiParty | null>(null);
  const [activeLevelData, setActiveLevelData] = useState<Level | null>(null);

  const socketRef = useRef<Socket | null>(null);

  // Cleanup socket when leaving lobby
  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => { disconnectSocket(); };
  }, [disconnectSocket]);

  function resetToChoose() {
    disconnectSocket();
    setMode('choose');
    setHostStep('pick');
    setGuestStep('enter');
    setPartyCode('');
    setCodeInput('');
    setHostError(null);
    setGuestError(null);
    setActiveParty(null);
    setActiveLevelData(null);
    setCopied(false);
  }

  // ── Socket setup ──────────────────────────────────────────────────────────

  function connectAndWait(code: string, level: Level) {
    disconnectSocket();

    const token = getToken() ?? '';
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('party:join', { code });
    });

    socket.on('party:ready', () => {
      // Handoff ownership to App/GameCanvas; avoid disconnecting during PartyLobby unmount.
      socketRef.current = null;
      onPartyReady({ socket, partyCode: code, level });
    });

    socket.on('party:error', ({ message }: { message: string }) => {
      setHostError(message);
      setGuestError(message);
    });

    socket.on('connect_error', (err) => {
      const msg = err.message.startsWith('Unauthorized')
        ? 'Authentication failed. Please sign in again.'
        : 'Connection failed. Check that the server is running.';
      setHostError(msg);
      setGuestError(msg);
    });
  }

  // ── Host flow ─────────────────────────────────────────────────────────────

  async function handleCreateParty() {
    if (!selectedLevelId) {
      setHostError('Please select a level.');
      return;
    }
    setHostError(null);
    setHostBusy(true);
    try {
      const party = await createParty(selectedLevelId);
      const levelData = apiLevelToLevel(
        await fetchLevel(selectedLevelId)
      );
      setActiveParty(party);
      setActiveLevelData(levelData);
      setPartyCode(party.code);
      setHostStep('waiting');
      connectAndWait(party.code, levelData);
    } catch (err) {
      setHostError(err instanceof Error ? err.message : 'Failed to create party');
    } finally {
      setHostBusy(false);
    }
  }

  async function handleCopyCode() {
    try {
      await navigator.clipboard.writeText(partyCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — fallback silently
    }
  }

  // ── Guest flow ────────────────────────────────────────────────────────────

  async function handleJoinParty() {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 6) {
      setGuestError('Party codes are 6 characters.');
      return;
    }
    setGuestError(null);
    setGuestBusy(true);
    try {
      const party = await joinParty(code);
      const levelData = apiLevelToLevel(await fetchLevel(party.level_id));
      setActiveParty(party);
      setActiveLevelData(levelData);
      setGuestStep('waiting');
      connectAndWait(code, levelData);
    } catch (err) {
      setGuestError(err instanceof Error ? err.message : 'Failed to join party');
    } finally {
      setGuestBusy(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (mode === 'choose') {
    return (
      <div className="xp-party-lobby">
        <div className="xp-party-hero">
          <ChromeIcon variant="party" className="xp-party-hero-icon" />
          <div className="xp-party-hero-text">
            <div className="xp-party-hero-title">Party Lobby</div>
            <div className="xp-party-hero-sub">Play a level with a friend in real time</div>
          </div>
        </div>

        <div className="xp-party-modes">
          <button
            type="button"
            className="xp-party-mode-card"
            onClick={() => setMode('host')}
          >
            <div className="xp-party-mode-icon-wrap">
              <ChromeIcon variant="editor" className="xp-party-mode-icon" />
            </div>
            <div className="xp-party-mode-label">Host a Party</div>
            <div className="xp-party-mode-desc">
              Choose a level, create a room, and share the code with a friend.
            </div>
          </button>

          <button
            type="button"
            className="xp-party-mode-card"
            onClick={() => setMode('guest')}
          >
            <div className="xp-party-mode-icon-wrap">
              <ChromeIcon variant="party" className="xp-party-mode-icon" />
            </div>
            <div className="xp-party-mode-label">Join a Party</div>
            <div className="xp-party-mode-desc">
              Enter a 6-character code from a friend to join their room.
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Host view ─────────────────────────────────────────────────────────────

  if (mode === 'host') {
    const publishedLevels = myLevels.filter((l) => l.published);

    return (
      <div className="xp-party-lobby">
        <div className="xp-party-header">
          <button type="button" className="xp-party-back-btn" onClick={resetToChoose}>
            <ChromeIcon variant="chevron" className="xp-party-back-icon xp-party-back-icon--flip" />
            Back
          </button>
          <div className="xp-party-header-title">Host a Party</div>
        </div>

        {hostStep === 'pick' && (
          <div className="xp-party-step">
            <div className="xp-pane-heading">SELECT LEVEL</div>

            {publishedLevels.length === 0 ? (
              <div className="xp-party-empty">
                <ChromeIcon variant="levels" className="xp-party-empty-icon" />
                <p>No published levels yet.</p>
                <p className="xp-party-empty-sub">
                  Publish a level from the Level Editor to host a party.
                </p>
              </div>
            ) : (
              <div className="xp-party-level-list">
                {publishedLevels.map((level) => (
                  <button
                    key={level.id}
                    type="button"
                    className={`xp-party-level-row ${selectedLevelId === level.id ? 'selected' : ''}`}
                    onClick={() => setSelectedLevelId(level.id)}
                  >
                    <ChromeIcon variant="game" className="xp-party-level-icon" />
                    <div className="xp-party-level-info">
                      <div className="xp-party-level-title">{level.title || 'Untitled Level'}</div>
                      <div className="xp-party-level-meta">{level.tile_data.length} tiles</div>
                    </div>
                    {selectedLevelId === level.id && (
                      <div className="xp-party-level-check" aria-label="Selected" />
                    )}
                  </button>
                ))}
              </div>
            )}

            {hostError && <div className="xp-party-error">{hostError}</div>}

            <div className="xp-party-actions">
              <button
                type="button"
                className="xp-btn primary"
                disabled={!selectedLevelId || hostBusy}
                onClick={handleCreateParty}
                aria-busy={hostBusy}
              >
                {hostBusy ? 'Creating…' : 'Create Party'}
              </button>
            </div>
          </div>
        )}

        {hostStep === 'waiting' && activeParty && (
          <div className="xp-party-step">
            <div className="xp-party-code-pane">
              <div className="xp-pane-heading">PARTY CODE</div>
              <div className="xp-party-code-display">{partyCode}</div>
              <button
                type="button"
                className="xp-btn ghost xp-party-copy-btn"
                onClick={handleCopyCode}
              >
                {copied ? 'Copied!' : 'Copy Code'}
              </button>
            </div>

            <div className="xp-party-waiting-banner">
              <div className="xp-party-waiting-dots" aria-hidden="true">
                <span /><span /><span />
              </div>
              <div className="xp-party-waiting-text">
                Waiting for a friend to join&hellip;
              </div>
              {activeLevelData && (
                <div className="xp-party-waiting-level">
                  Level: <strong>{activeLevelData.title || 'Untitled Level'}</strong>
                </div>
              )}
            </div>

            {hostError && <div className="xp-party-error">{hostError}</div>}
          </div>
        )}
      </div>
    );
  }

  // ── Guest view ────────────────────────────────────────────────────────────

  return (
    <div className="xp-party-lobby">
      <div className="xp-party-header">
        <button type="button" className="xp-party-back-btn" onClick={resetToChoose}>
          <ChromeIcon variant="chevron" className="xp-party-back-icon xp-party-back-icon--flip" />
          Back
        </button>
        <div className="xp-party-header-title">Join a Party</div>
      </div>

      {guestStep === 'enter' && (
        <div className="xp-party-step">
          <div className="xp-pane-heading">ENTER PARTY CODE</div>
          <div className="xp-party-code-input-wrap">
            <input
              className="xp-party-code-input"
              type="text"
              maxLength={6}
              placeholder="ABC123"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleJoinParty(); }}
              disabled={guestBusy}
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Party code"
            />
          </div>

          {guestError && <div className="xp-party-error">{guestError}</div>}

          <div className="xp-party-actions">
            <button
              type="button"
              className="xp-btn primary"
              disabled={codeInput.trim().length !== 6 || guestBusy}
              onClick={handleJoinParty}
              aria-busy={guestBusy}
            >
              {guestBusy ? 'Joining…' : 'Join Party'}
            </button>
          </div>
        </div>
      )}

      {guestStep === 'waiting' && (
        <div className="xp-party-step">
          <div className="xp-party-waiting-banner">
            <div className="xp-party-waiting-dots" aria-hidden="true">
              <span /><span /><span />
            </div>
            <div className="xp-party-waiting-text">
              Joined party <strong>{codeInput.trim().toUpperCase()}</strong>. Waiting for host&hellip;
            </div>
            {activeLevelData && (
              <div className="xp-party-waiting-level">
                Level: <strong>{activeLevelData.title || 'Untitled Level'}</strong>
              </div>
            )}
          </div>

          {guestError && <div className="xp-party-error">{guestError}</div>}
        </div>
      )}
    </div>
  );
}
