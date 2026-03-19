import { useState } from 'react';
import ChromeIcon, { type ChromeIconVariant } from './components/ChromeIcon';
import PanelChrome from './components/PanelChrome';
import GameCanvas from './game/GameCanvas';

interface NavItem {
  id: string;
  label: string;
  icon: ChromeIconVariant;
  content: 'game' | 'editor' | 'levels' | 'party' | 'settings';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<NavItem['id']>('play');

  const navItems: NavItem[] = [
    { id: 'play', label: 'Play Game', icon: 'game', content: 'game' },
    { id: 'build', label: 'Level Editor', icon: 'editor', content: 'editor' },
    { id: 'levels', label: 'My Levels', icon: 'levels', content: 'levels' },
    { id: 'party', label: 'Party Lobby', icon: 'party', content: 'party' },
    { id: 'settings', label: 'Settings', icon: 'settings', content: 'settings' },
  ];

  const currentNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <div className="xp-app-layout">
      {/* ── Sidebar Navigation ───────────────────────────────────── */}
      <nav className="xp-sidebar-nav" aria-label="Main Navigation">
        <div className="xp-sidebar-gloss" aria-hidden="true" />

        {/* User Profile */}
        <div className="xp-user-profile">
          <div className="xp-user-avatar">
            <ChromeIcon variant="profile" className="xp-user-avatar-icon" />
          </div>
          <div className="xp-user-info">
            <span className="xp-user-name">Player</span>
            <span className="xp-user-status">Level 1 · 0 levels built</span>
          </div>
        </div>

        {/* Navigation Menu */}
        <div className="xp-nav-menu">
          <div className="xp-pane-heading">PROGRAMS</div>
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`xp-nav-btn ${activeTab === item.id ? 'active' : ''}`}
              aria-pressed={activeTab === item.id}
              onClick={() => setActiveTab(item.id)}
            >
              <ChromeIcon variant={item.icon} className="xp-nav-icon" />
              <span className="xp-nav-label">{item.label}</span>
              <ChromeIcon variant="chevron" className="xp-nav-chevron-icon" />
            </button>
          ))}

          <div className="xp-task-group">
            <div className="xp-pane-heading">FILE AND FOLDER TASKS</div>
            <button type="button" className="xp-task-chip">Create a new level</button>
            <button type="button" className="xp-task-chip">Share this level</button>
          </div>

          <div className="xp-task-group">
            <div className="xp-pane-heading">OTHER PLACES</div>
            <button type="button" className="xp-task-chip">Community Levels</button>
            <button type="button" className="xp-task-chip">Party Browser</button>
          </div>
        </div>

        <div className="xp-sidebar-footer">
          <button type="button" className="xp-start-strip">All Programs</button>
          <button type="button" className="xp-orb-btn" aria-label="Quick launch">
            <ChromeIcon variant="orb" className="xp-orb-icon" />
          </button>
        </div>
      </nav>

      {/* ── Main Stage ────────────────────────────────────────────── */}
      <main className="xp-main-stage">
        {/* Active Content Panel */}
        <PanelChrome
          title={currentNav.label}
          icon={<ChromeIcon variant={currentNav.icon} size={18} />}
          dark={currentNav.content === 'game'}
          actionButton={
            currentNav.content === 'game' ? (
              <button type="button" className="xp-btn danger" onClick={() => console.log('Quit game clicked')}>
                Quit Level
              </button>
            ) : null
          }
        >
          {currentNav.content === 'game' && <GameCanvas />}
          {currentNav.content !== 'game' && (
            <div className="xp-placeholder">
              <ChromeIcon variant={currentNav.icon} className="xp-placeholder-icon" />
              <span>{currentNav.label} interface coming soon...</span>
            </div>
          )}
        </PanelChrome>
      </main>
    </div>
  );
}
