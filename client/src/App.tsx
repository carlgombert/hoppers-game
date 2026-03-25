import { useState, useEffect, useCallback } from 'react';
import ChromeIcon, { type ChromeIconVariant } from './components/ChromeIcon';
import PanelChrome from './components/PanelChrome';
import GameCanvas from './game/GameCanvas';
import LevelEditor from './components/editor/LevelEditor';
import MyLevels from './components/levels/MyLevels';
import AuthGate from './components/auth/AuthGate';
import {
  getToken,
  setToken,
  clearToken,
  getStoredDisplayName,
  setStoredDisplayName,
  apiLogout,
  fetchMyLevels,
  createLevel,
  patchLevel,
  deleteLevel,
  type AuthUser,
  type ApiLevel,
} from './api/client';
import { type Level } from './types/level';

type NavId = 'build' | 'levels' | 'party' | 'settings';
type ViewId = NavId | 'game';

interface NavItem {
  id: NavId;
  label: string;
  icon: ChromeIconVariant;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'build',    label: 'Level Editor', icon: 'editor'   },
  { id: 'levels',   label: 'My Levels',    icon: 'levels'   },
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
    tile_data: l.tile_data ?? [],
    published: l.published,
    created_at: l.created_at,
    updated_at: l.updated_at,
  };
}

export default function App() {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<AuthUser | null>(() => {
    const name = getStoredDisplayName();
    if (!name || !getToken()) return null;
    return { id: '', email: '', display_name: name };
  });

  const [view, setView] = useState<ViewId>('build');
  const [levels, setLevels] = useState<Level[]>([]);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [playingLevel, setPlayingLevel] = useState<Level | null>(null);
  const [levelsLoading, setLevelsLoading] = useState(false);

  const isLoggedIn = Boolean(token);

  const loadLevels = useCallback(async () => {
    if (!token) return;
    setLevelsLoading(true);
    try {
      const apiLevels = await fetchMyLevels();
      setLevels(apiLevels.map(apiLevelToLevel));
    } catch {
      // silently ignore — levels stay as-is
    } finally {
      setLevelsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadLevels();
  }, [token, loadLevels]);

  useEffect(() => {
    if (view === 'levels' && token) loadLevels();
  }, [view, token, loadLevels]);

  function handleAuth(authUser: AuthUser, authToken: string) {
    setToken(authToken);
    setStoredDisplayName(authUser.display_name);
    setTokenState(authToken);
    setUser(authUser);
  }

  async function handleLogout() {
    try {
      await apiLogout();
    } catch {
      // ignore logout errors
    }
    clearToken();
    localStorage.removeItem('hoppers_display_name');
    setTokenState(null);
    setUser(null);
    setLevels([]);
  }

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
          tile_data: level.tile_data,
          published: level.published,
        });
      } else {
        saved = await createLevel(level.title, level.description, level.tile_data);
        if (level.published) {
          saved = await patchLevel(saved.id, {
            published: true,
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
    setView('game');
  }

  function handleQuitGame() {
    setPlayingLevel(null);
    setView('levels');
  }

  if (!isLoggedIn) {
    return <AuthGate onAuth={handleAuth} />;
  }

  return (
    <div className="xp-app-layout">
      <nav className="xp-sidebar-nav" aria-label="Main Navigation">
        <div className="xp-sidebar-gloss" aria-hidden="true" />

        <div className="xp-user-profile">
          <div className="xp-user-avatar">
            <ChromeIcon variant="profile" className="xp-user-avatar-icon" />
          </div>
          <div className="xp-user-info">
            <span className="xp-user-name">{user?.display_name ?? 'Player'}</span>
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
            <button type="button" className="xp-task-chip">Community Levels</button>
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
            onClick={handleLogout}
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
          {view === 'game' && (
            <GameCanvas tileData={playingLevel?.tile_data ?? []} />
          )}

          {view === 'build' && (
            <LevelEditor
              key={editingLevel?.id ?? 'new'}
              level={editingLevel}
              onSave={handleSaveLevel}
              onCancel={() => setView('levels')}
            />
          )}

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

          {view === 'party' && (
            <div className="xp-placeholder">
              <ChromeIcon variant="party" className="xp-placeholder-icon" />
              <span>Party Lobby coming soon…</span>
            </div>
          )}

          {view === 'settings' && (
            <div className="xp-placeholder">
              <ChromeIcon variant="settings" className="xp-placeholder-icon" />
              <span>Settings coming soon…</span>
            </div>
          )}
        </PanelChrome>
      </main>
    </div>
  );
}
