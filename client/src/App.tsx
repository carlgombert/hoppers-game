import { useState } from 'react';
import ChromeIcon, { type ChromeIconVariant } from './components/ChromeIcon';
import PanelChrome from './components/PanelChrome';
import GameCanvas from './game/GameCanvas';
import LevelEditor from './components/editor/LevelEditor';
import MyLevels from './components/levels/MyLevels';
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

export default function App() {
  const [view, setView] = useState<ViewId>('build');
  const [levels, setLevels] = useState<Level[]>([]);
  const [editingLevel, setEditingLevel] = useState<Level | null>(null);
  const [playingLevel, setPlayingLevel] = useState<Level | null>(null);

  const activeNavId: NavId = view === 'game' ? 'levels' : view;
  const currentNav = navForView(view);

  function goToEditor(level?: Level) {
    setEditingLevel(level ?? null);
    setView('build');
  }

  function handleSaveLevel(level: Level) {
    setLevels((prev) => {
      const idx = prev.findIndex((l) => l.id === level.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = level;
        return next;
      }
      return [...prev, level];
    });
    setView('levels');
  }

  function handleDeleteLevel(id: string) {
    setLevels((prev) => prev.filter((l) => l.id !== id));
  }

  function handlePlayLevel(level: Level) {
    setPlayingLevel(level);
    setView('game');
  }

  function handleQuitGame() {
    setPlayingLevel(null);
    setView('levels');
  }

  return (
    <div className="xp-app-layout">
      {/* ── Sidebar Navigation ───────────────────────────────────── */}
      <nav className="xp-sidebar-nav" aria-label="Main Navigation">
        <div className="xp-sidebar-gloss" aria-hidden="true" />

        {/* User Profile Band */}
        <div className="xp-user-profile">
          <div className="xp-user-avatar">
            <ChromeIcon variant="profile" className="xp-user-avatar-icon" />
          </div>
          <div className="xp-user-info">
            <span className="xp-user-name">Player</span>
            <span className="xp-user-status">
              {levels.length} {levels.length === 1 ? 'level' : 'levels'} built
            </span>
          </div>
        </div>

        {/* Navigation Menu */}
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

        {/* Footer Strip — Split Bar Frame */}
        <div className="xp-sidebar-footer">
          <button type="button" className="xp-start-strip" onClick={() => goToEditor()}>
            New Level
          </button>
          <div className="xp-footer-divider" aria-hidden="true" />
          <button type="button" className="xp-orb-btn" aria-label="Quick launch" onClick={() => setView('levels')}>
            <ChromeIcon variant="orb" className="xp-orb-icon" />
          </button>
        </div>
      </nav>

      {/* ── Main Stage ────────────────────────────────────────────── */}
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
          {/* Game canvas — launched from My Levels with a specific level */}
          {view === 'game' && (
            <GameCanvas tileData={playingLevel?.tile_data ?? []} />
          )}

          {/* Level Editor — key forces fresh mount when switching levels */}
          {view === 'build' && (
            <LevelEditor
              key={editingLevel?.id ?? 'new'}
              level={editingLevel}
              onSave={handleSaveLevel}
              onCancel={() => setView('levels')}
            />
          )}

          {/* My Levels */}
          {view === 'levels' && (
            <MyLevels
              levels={levels}
              onPlay={handlePlayLevel}
              onEdit={(level) => goToEditor(level)}
              onDelete={handleDeleteLevel}
              onCreateNew={() => goToEditor()}
            />
          )}

          {/* Party Lobby */}
          {view === 'party' && (
            <div className="xp-placeholder">
              <ChromeIcon variant="party" className="xp-placeholder-icon" />
              <span>Party Lobby coming soon…</span>
            </div>
          )}

          {/* Settings */}
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
