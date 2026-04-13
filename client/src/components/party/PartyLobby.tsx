import { useState, useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';
import ChromeIcon from '../ChromeIcon';
import { createParty, joinParty, fetchLevel, getToken, type ApiParty, type ApiLevel } from '../../api/client';
import { type Level } from '../../types/level';
import { normalizeBackdropId } from '../../game/backdrops';
import { useAuth } from '../../auth/AuthContext';

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

/** Shape of a party member as broadcast by the server via party:state_update */
interface PartyMember {
  userId: string;
  displayName: string;
  isReady: boolean;
  isConnected: boolean;
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
  const { user } = useAuth();

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

  // Ready-check state
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [countdown, setCountdown] = useState<number | null>(null);

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
    setMembers([]);
    setCountdown(null);
  }

  // ── Socket setup ──────────────────────────────────────────────────────────

  function connectAndWait(code: string, level: Level) {
    disconnectSocket();
    setMembers([]);
    setCountdown(null);

    const token = getToken() ?? '';
    const socket = io(SOCKET_URL, {
      transports: ['websocket'],
      auth: { token },
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('party:join', { code });
    });

    // party:state_update — authoritative member list with ready/connected status
    socket.on(
      'party:state_update',
      ({ members: updatedMembers }: { members: PartyMember[]; hostId: string }) => {
        setMembers(updatedMembers);
      }
    );

    // party:countdown — synchronized countdown tick from server
    socket.on('party:countdown', ({ count }: { count: number }) => {
      setCountdown(count);
    });

    // party:countdown_cancelled — host aborted or member disconnected during countdown
    socket.on('party:countdown_cancelled', () => {
      setCountdown(null);
    });

    // party:launch — all clients transition to game simultaneously
    socket.on('party:launch', () => {
      socketRef.current = null;
      onPartyReady({ socket, partyCode: code, level });
    });

    // party:timeout — ready-check stalled for too long; ready states reset server-side
    socket.on('party:timeout', ({ message }: { message: string }) => {
      setHostError(message);
      setGuestError(message);
      setCountdown(null);
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

  // ── Ready-check actions ───────────────────────────────────────────────────

  /** Toggle own ready status. */
  function handleReadyToggle() {
    const socket = socketRef.current;
    if (!socket) return;
    const code = partyCode || codeInput.trim().toUpperCase();
    socket.emit('party:ready_toggle', { code });
  }

  /** Host-only: start the countdown once all members are ready. */
  function handleLaunch() {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('party:start', { code: partyCode });
  }

  // ── Derived ready-check values ────────────────────────────────────────────

  const isHost = !!activeParty && activeParty.host_id === user?.id;
  const myMember = members.find((m) => m.userId === user?.id);
  const myIsReady = myMember?.isReady ?? false;
  const allReady = members.length > 0 && members.every((m) => m.isReady);
  const allConnected = members.length > 0 && members.every((m) => m.isConnected);

  // ── Shared ready-check panel (used in both host and guest waiting views) ──

  function renderReadyCheckPanel(code: string, error: string | null) {
    const isCountingDown = countdown !== null;

    return (
      <div className="xp-party-readycheck">
        {/* Countdown overlay */}
        {isCountingDown && (
          <div className="xp-party-countdown-overlay">
            <div className="xp-party-countdown-number">{countdown}</div>
            <div className="xp-party-countdown-label">Game starting…</div>
          </div>
        )}

        {/* Member list */}
        <div className="xp-pane-heading">PLAYERS</div>
        {members.length === 0 ? (
          <div className="xp-party-waiting-banner">
            <div className="xp-party-waiting-dots" aria-hidden="true">
              <span /><span /><span />
            </div>
            <div className="xp-party-waiting-text">
              {mode === 'host'
                ? 'Waiting for a friend to join…'
                : `Joined party ${code}. Waiting for host…`}
            </div>
            {activeLevelData && (
              <div className="xp-party-waiting-level">
                Level: <strong>{activeLevelData.title || 'Untitled Level'}</strong>
              </div>
            )}
          </div>
        ) : (
          <div className="xp-party-member-list">
            {members.map((m) => (
              <div key={m.userId} className={`xp-party-member-row${m.userId === user?.id ? ' xp-party-member-row--self' : ''}`}>
                <div className={`xp-party-member-status-dot ${m.isConnected ? (m.isReady ? 'ready' : 'connected') : 'offline'}`} aria-hidden="true" />
                <div className="xp-party-member-info">
                  <span className="xp-party-member-name">
                    {m.displayName}
                    {m.userId === user?.id && <span className="xp-party-member-you"> (you)</span>}
                    {m.userId === activeParty?.host_id && <span className="xp-party-member-host-badge">HOST</span>}
                  </span>
                  <span className="xp-party-member-ready-label">
                    {!m.isConnected ? 'Offline' : m.isReady ? 'Ready' : 'Not Ready'}
                  </span>
                </div>
                {m.isReady && <div className="xp-party-member-checkmark" aria-label="Ready" />}
              </div>
            ))}
          </div>
        )}

        {/* Status summary */}
        {members.length > 0 && !allConnected && (
          <div className="xp-party-member-status-note">
            Waiting for all players to connect…
          </div>
        )}
        {members.length > 0 && allConnected && !allReady && (
          <div className="xp-party-member-status-note">
            All players connected — toggle ready when you are set.
          </div>
        )}
        {members.length > 0 && allReady && !isHost && (
          <div className="xp-party-member-status-note xp-party-member-status-note--go">
            All ready! Waiting for host to launch…
          </div>
        )}

        {error && <div className="xp-party-error">{error}</div>}

        {/* Action buttons */}
        <div className="xp-party-actions">
          {/* Ready toggle — shown for everyone who is not the sole host controlling launch */}
          {members.length > 0 && !isCountingDown && (
            <button
              type="button"
              className={`xp-btn ${myIsReady ? 'ghost' : 'primary'} xp-party-ready-btn`}
              onClick={handleReadyToggle}
            >
              {myIsReady ? 'Cancel Ready' : 'Ready Up'}
            </button>
          )}

          {/* Launch — host only, only when all players are ready */}
          {isHost && !isCountingDown && (
            <button
              type="button"
              className="xp-btn primary xp-party-launch-btn"
              disabled={!allReady || !allConnected}
              onClick={handleLaunch}
              title={!allReady ? 'All players must be ready before launching' : undefined}
            >
              Launch Game
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (mode === 'choose') {
    return (
      <div className="xp-party-lobby">
        <div className="xp-party-hero">
          <ChromeIcon variant="party" className="xp-party-hero-icon" />
          <div className="xp-party-hero-text">
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
              <ChromeIcon variant="plus" className="xp-party-mode-icon" />
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
              <ChromeIcon variant="game" className="xp-party-mode-icon" />
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

            {renderReadyCheckPanel(partyCode, hostError)}
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
          {renderReadyCheckPanel(codeInput.trim().toUpperCase(), guestError)}
        </div>
      )}
    </div>
  );
}
