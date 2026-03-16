import { useState } from 'react';
import PanelChrome from './components/PanelChrome';
import GameCanvas from './game/GameCanvas';

interface NavItem {
  id: string;
  label: string;
  icon: string;
  content: 'game' | 'editor' | 'levels' | 'party' | 'settings';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('play');

  const navItems: NavItem[] = [
    { id: 'play', label: 'Play Game', icon: '🎮', content: 'game' },
    { id: 'build', label: 'Level Editor', icon: '🔧', content: 'editor' },
    { id: 'levels', label: 'My Levels', icon: '📁', content: 'levels' },
    { id: 'party', label: 'Party Lobby', icon: '👥', content: 'party' },
    { id: 'settings', label: 'Settings', icon: '⚙️', content: 'settings' },
  ];

  const currentNav = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <div className="xp-app-layout">
      {/* ── Sidebar Navigation ───────────────────────────────────── */}
      <nav className="xp-sidebar-nav" aria-label="Main Navigation">
        <div className="xp-sidebar-gloss" aria-hidden="true" />

        {/* User Profile */}
        <div className="xp-user-profile">
          <div className="xp-user-avatar">🐸</div>
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
              className={`xp-nav-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="xp-nav-icon">{item.icon}</span>
              <span className="xp-nav-label">{item.label}</span>
              <span className="xp-nav-chevron" aria-hidden="true">›</span>
            </button>
          ))}

          <div className="xp-task-group">
            <div className="xp-pane-heading">FILE AND FOLDER TASKS</div>
            <button className="xp-task-chip">Create a new level</button>
            <button className="xp-task-chip">Share this level</button>
          </div>

          <div className="xp-task-group">
            <div className="xp-pane-heading">OTHER PLACES</div>
            <button className="xp-task-chip">Community Levels</button>
            <button className="xp-task-chip">Party Browser</button>
          </div>
        </div>

        <div className="xp-sidebar-footer">
          <button className="xp-start-strip">All Programs</button>
          <button className="xp-orb-btn" aria-label="Quick launch">
            ▶
          </button>
        </div>
      </nav>

      {/* ── Main Stage ────────────────────────────────────────────── */}
      <main className="xp-main-stage">
        {/* Branding Watermark */}
        <div className="xp-branding">
          <div className="xp-branding-title">HOPPERS</div>
          <div className="xp-branding-sub">LUNA BUILD</div>
        </div>

        {/* Active Content Panel */}
        <PanelChrome
          title={currentNav.label}
          icon="✨"
          dark={currentNav.content === 'game'}
          actionButton={
            currentNav.content === 'game' ? (
              <button className="xp-btn danger" onClick={() => console.log('Quit game clicked')}>
                Quit Level
              </button>
            ) : null
          }
        >
          {currentNav.content === 'game' && <GameCanvas />}
          {currentNav.content !== 'game' && (
            <div className="xp-placeholder">
              <span className="xp-placeholder-icon">{currentNav.icon}</span>
              <span>{currentNav.label} interface coming soon...</span>
            </div>
          )}
        </PanelChrome>
      </main>
    </div>
  );
}
