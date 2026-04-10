import { useState, useEffect, useCallback } from 'react';
import { type Socket } from 'socket.io-client';
import ChromeIcon, { type ChromeIconVariant } from './components/ChromeIcon';
import SvgIcon from './components/SvgIcon';
import PanelChrome from './components/PanelChrome';
import GameCanvas from './game/GameCanvas';
import LevelEditor from './components/editor/LevelEditor';
import MyLevels from './components/levels/MyLevels';
import CommunityBrowse from './components/community/CommunityBrowse';
import PartyLobby, { type PartyReadyPayload } from './components/party/PartyLobby';
import SettingsPage from './components/settings/SettingsPage';
import LoginScreen from './components/auth/LoginScreen';
import CreateAccountScreen from './components/auth/CreateAccountScreen';
import { getAvatarSrc } from './components/auth/AvatarPicker';
import { useAuth } from './auth/AuthContext';
import {
  fetchMyLevels,
  fetchLevel,
  createLevel,
  patchLevel,
  deleteLevel,
  type ApiLevel,
} from './api/client';
import { type Level } from './types/level';
import { normalizeBackdropId } from './game/backdrops';

type NavId = 'build' | 'levels' | 'browse' | 'party' | 'settings';
type ViewId = NavId | 'game';
type AuthView = 'login' | 'register';

interface NavItem {
  id: NavId;
  label: string;
  icon: ChromeIconVariant;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'build',    label: 'Level Editor', icon: 'editor'   },
  { id: 'levels',   label: 'My Levels',    icon: 'levels'   },
  { id: 'browse',   label: 'Community',    icon: 'browse'   },
  { id: 'party',    label: 'Party Lobby',  icon: 'party'    },
  { id: 'settings', label: 'Settings',     icon: 'settings' },
];

function navForView(view: ViewId): NavItem {
  if (view === 'game') return { id: 'levels', label: 'Playing Level', icon: 'game' };
  return NAV_ITEMS.find((n) => n.id === view) ?? NAV_ITEMS[0];
}

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

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

export default function App() {
  const { user, logout } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');

  const [view, setView] = useState<ViewId>('build');
  const [levels, setLevels] = useState<Level[]>([]);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [playingLevel, setPlayingLevel] = useState<Level | null>(null);
  const [levelsLoading, setLevelsLoading] = useState(false);
  const [completionTime, setCompletionTime] = useState<number | null>(null);
  const [gameInstanceId, setGameInstanceId] = useState(0);
  const [startFresh, setStartFresh] = useState(false);

  // Party / multiplayer state
  const [partySocket, setPartySocket] = useState<Socket | null>(null);
  const [partyCode, setPartyCode] = useState<string | null>(null);
  const [partyFinishTimes, setPartyFinishTimes] = useState<Map<string, number>>(new Map());

  const loadLevels = useCallback(async () => {
    if (!user) return;
    setLevelsLoading(true);
    try {
      const apiLevels = await fetchMyLevels();
      setLevels(apiLevels.map(apiLevelToLevel));
    } catch {
      // silently ignore — levels stay as-is
    } finally {
      setLevelsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) loadLevels();
  }, [user, loadLevels]);

  useEffect(() => {
    if (view === 'levels' && user) loadLevels();
  }, [view, user, loadLevels]);

  // ── Auth gate ─────────────────────────────────────────────────────────────
  if (!user) {
    if (authView === 'login') {
      return <LoginScreen onSwitchToRegister={() => setAuthView('register')} />;
    }
    return <CreateAccountScreen onSwitchToLogin={() => setAuthView('login')} />;
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  const activeNavId: NavId = view === 'game' ? 'levels' : view;
  const currentNav = navForView(view);

  function goToEditor(level?: Level) {
    setEditingLevel(level ?? null);
    setView('build');
  }

  async function handleSaveLevel(level: Level) {
    try {
      const existing = levels.find((l) => l.id === level.id);
      let saved: ApiLevel;
      if (existing) {
        saved = await patchLevel(level.id, {
          title: level.title,
          description: level.description,
          backdrop_id: level.backdrop_id,
          tile_data: level.tile_data,
          published: level.published,
        });
      } else {
        saved = await createLevel(level.title, level.description, level.tile_data, level.backdrop_id);
        if (level.published) {
          saved = await patchLevel(saved.id, {
            published: true,
            backdrop_id: level.backdrop_id,
            tile_data: level.tile_data,
          });
        }
      }
      const savedLevel = apiLevelToLevel(saved);
      setLevels((prev) => {
        const idx = prev.findIndex((l) => l.id === savedLevel.id || l.id === level.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = savedLevel;
          return next;
        }
        return [...prev, savedLevel];
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      alert(`Could not save level: ${msg}`);
      return;
    }
    setView('levels');
  }

  async function handleDeleteLevel(id: string) {
    try {
      await deleteLevel(id);
      setLevels((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Delete failed';
      alert(`Could not delete level: ${msg}`);
    }
  }

  function handlePlayLevel(level: Level) {
    setPlayingLevel(level);
    setCompletionTime(null);
    setStartFresh(false);
    setGameInstanceId((v) => v + 1);
    setView('game');
  }

  /** Play a community level — fetches full tile_data if not already present. */
  async function handleCommunityPlay(level: Level) {
    if (!level.tile_data || level.tile_data.length === 0) {
      try {
        const full = await fetchLevel(level.id);
        setPlayingLevel({
          ...level,
          tile_data: full.tile_data ?? [],
          backdrop_id: normalizeBackdropId(full.backdrop_id),
        });
      } catch {
        setPlayingLevel(level);
      }
    } else {
      setPlayingLevel(level);
    }
    setCompletionTime(null);
    setStartFresh(false);
    setGameInstanceId((v) => v + 1);
    setView('game');
  }

  function handlePlayAgain() {
    setCompletionTime(null);
    setStartFresh(true);
    setGameInstanceId((v) => v + 1);
  }

  function handleQuitGame() {
    partySocket?.disconnect();
    setPlayingLevel(null);
    setCompletionTime(null);
    setStartFresh(false);
    setPartyFinishTimes(new Map());
    setPartySocket(null);
    setPartyCode(null);
    setView('levels');
  }

  function handlePartyReady({ socket, partyCode: code, level }: PartyReadyPayload) {
    setPartySocket(socket);
    setPartyCode(code);
    setPartyFinishTimes(new Map());
    setPlayingLevel(level);
    setCompletionTime(null);
    setStartFresh(false);
    setGameInstanceId((v) => v + 1);
    setView('game');
  }

  function handlePartyFinished(socketId: string, time: number) {
    setPartyFinishTimes((prev) => new Map(prev).set(socketId, time));
  }

  function handleLevelComplete(elapsedMs: number) {
    setCompletionTime(elapsedMs);
  }

  return (
    <div className="xp-app-layout">
      <nav className="xp-sidebar-nav" aria-label="Main Navigation">
        <div className="xp-sidebar-gloss" aria-hidden="true" />

        <div className="xp-user-profile">
          <div className="xp-user-avatar">
            {user.avatar_id ? (
              <img
                src={getAvatarSrc(user.avatar_id)}
                alt={user.display_name}
                className="xp-user-avatar-img"
              />
            ) : (
              <ChromeIcon variant="profile" className="xp-user-avatar-icon" />
            )}
          </div>
          <div className="xp-user-info">
            <span className="xp-user-name">{user.display_name}</span>
            <span className="xp-user-status">
              {levels.length} {levels.length === 1 ? 'level' : 'levels'} built
            </span>
          </div>
        </div>

        <div className="xp-nav-menu">
          <div className="xp-pane-heading">PROGRAMS</div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`xp-nav-btn ${activeNavId === item.id ? 'active' : ''}`}
              aria-pressed={activeNavId === item.id}
              onClick={() => {
                if (item.id === 'build') goToEditor();
                else setView(item.id);
              }}
            >
              <ChromeIcon variant={item.icon} className="xp-nav-icon" />
              <span className="xp-nav-label">{item.label}</span>
              <ChromeIcon variant="chevron" className="xp-nav-chevron-icon" />
            </button>
          ))}

          <div className="xp-task-group">
            <div className="xp-pane-heading">FILE AND FOLDER TASKS</div>
            <button type="button" className="xp-task-chip" onClick={() => goToEditor()}>
              Create a new level
            </button>
            <button type="button" className="xp-task-chip">Share this level</button>
          </div>

          <div className="xp-task-group">
            <div className="xp-pane-heading">OTHER PLACES</div>
            <button type="button" className="xp-task-chip" onClick={() => setView('browse')}>
              Community Levels
            </button>
            <button type="button" className="xp-task-chip" onClick={() => setView('party')}>
              Party Browser
            </button>
          </div>
        </div>

        <div className="xp-sidebar-footer">
          <button type="button" className="xp-start-strip" onClick={() => goToEditor()}>
            New Level
          </button>
          <div className="xp-footer-divider" aria-hidden="true" />
          <button
            type="button"
            className="xp-orb-btn"
            aria-label="Sign out"
            onClick={logout}
            title="Sign out"
          >
            <ChromeIcon variant="orb" className="xp-orb-icon" />
          </button>
        </div>
      </nav>

      <main className="xp-main-stage">
        <PanelChrome
          title={currentNav.label}
          icon={<ChromeIcon variant={currentNav.icon} size={18} />}
          dark={view === 'game'}
          actionButton={
            view === 'game' ? (
              <button type="button" className="xp-btn danger" onClick={handleQuitGame}>
                Quit Level
              </button>
            ) : null
          }
        >
          {/* ── Game canvas ──────────────────────────────────── */}
          {view === 'game' && (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <GameCanvas
                key={gameInstanceId}
                tileData={playingLevel?.tile_data ?? []}
                levelId={playingLevel?.id}
                backdropId={playingLevel?.backdrop_id}
                startFresh={startFresh}
                onComplete={handleLevelComplete}
                socket={partySocket ?? undefined}
                partyCode={partyCode ?? undefined}
                onPartyFinished={handlePartyFinished}
              />

              {/* Solo completion overlay */}
              {completionTime !== null && !partySocket && (
                <div className="xp-completion-overlay">
                  <div className="xp-completion-card">
                    <div className="xp-completion-title">
                      <SvgIcon name="trophy" size={20} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                      Level Complete!
                    </div>
                    <div className="xp-completion-time">
                      {formatTime(completionTime)}
                    </div>
                    <div className="xp-completion-actions">
                      <button
                        type="button"
                        className="xp-btn primary"
                        onClick={handlePlayAgain}
                      >
                        Play Again
                      </button>
                      <button
                        type="button"
                        className="xp-btn ghost"
                        onClick={handleQuitGame}
                      >
                        Back to Levels
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Multiplayer finish overlay */}
              {partySocket && partyFinishTimes.size > 0 && (
                <div className="xp-completion-overlay">
                  <div className="xp-completion-card">
                    <div className="xp-completion-title">
                      {partyFinishTimes.size === 1 ? 'First Finish!' : 'Both Finished!'}
                    </div>
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {Array.from(partyFinishTimes.entries()).map(([id, t], i) => (
                        <div key={id} className="xp-mp-finish-row">
                          <span className="xp-mp-finish-label">
                            {id === partySocket.id ? 'You' : `Player ${i + 1}`}
                          </span>
                          <span className="xp-mp-finish-time">{formatTime(t)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="xp-completion-actions">
                      <button
                        type="button"
                        className="xp-btn ghost"
                        onClick={handleQuitGame}
                      >
                        Leave Party
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Level Editor ─────────────────────────────────── */}
          {view === 'build' && (
            <LevelEditor
              key={editingLevel?.id ?? 'new'}
              level={editingLevel}
              onSave={handleSaveLevel}
              onCancel={() => setView('levels')}
            />
          )}

          {/* ── My Levels ────────────────────────────────────── */}
          {view === 'levels' && (
            <MyLevels
              levels={levels}
              loading={levelsLoading}
              onPlay={handlePlayLevel}
              onEdit={(level) => goToEditor(level)}
              onDelete={handleDeleteLevel}
              onCreateNew={() => goToEditor()}
            />
          )}

          {/* ── Community Browse ─────────────────────────────── */}
          {view === 'browse' && (
            <CommunityBrowse
              onPlay={handleCommunityPlay}
            />
          )}

          {view === 'party' && (
            <PartyLobby
              myLevels={levels}
              onPartyReady={handlePartyReady}
            />
          )}

          {view === 'settings' && (
            <SettingsPage />
          )}
        </PanelChrome>
      </main>
    </div>
  );
}
