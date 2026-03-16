import React from 'react';

interface PanelChromeProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  dark?: boolean;
  className?: string;
  actionButton?: React.ReactNode;
}

export default function PanelChrome({
  title,
  icon,
  children,
  dark = false,
  className = '',
  actionButton,
}: PanelChromeProps) {
  return (
    <div className={`xp-panel-chrome ${className}`}>
      {/* Titlebar */}
      <div className="xp-titlebar">
        {icon && <span className="xp-titlebar-icon">{icon}</span>}
        <span className="xp-titlebar-text">{title}</span>

        {actionButton && (
          <div className="xp-controls">
            {actionButton}
          </div>
        )}
      </div>

      {/* Body */}
      <div className={`xp-panel-body ${dark ? 'dark' : ''}`}>
        {children}
      </div>
    </div>
  );
}
