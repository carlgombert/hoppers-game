import type { SVGProps } from 'react';

export type ChromeIconVariant =
  | 'game'
  | 'editor'
  | 'levels'
  | 'party'
  | 'settings'
  | 'panel'
  | 'profile'
  | 'orb'
  | 'browse'
  | 'chevron';

interface ChromeIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  variant: ChromeIconVariant;
  size?: number;
}

export default function ChromeIcon({ variant, size = 24, className = '', ...props }: ChromeIconProps) {
  const classes = ['xp-icon-shell', className].filter(Boolean).join(' ');

  return (
    <svg
      className={classes}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {variant === 'game' && (
        <>
          <rect x="3.5" y="7" width="17" height="10" rx="3" className="xp-icon-shell" />
          <rect x="6.3" y="9.5" width="4.2" height="1.4" rx="0.7" className="xp-icon-fill" />
          <rect x="7.1" y="8.7" width="1.4" height="4.2" rx="0.7" className="xp-icon-fill" />
          <circle cx="15.8" cy="10.4" r="1.1" className="xp-icon-fill" />
          <circle cx="18" cy="12.4" r="1.1" className="xp-icon-fill" />
          <path d="M5.5 11h2.2" className="xp-icon-accent" />
          <path d="M18.7 9.2h0.01" className="xp-icon-accent" />
        </>
      )}

      {variant === 'editor' && (
        <>
          <path d="M6 16l8.5-8.5 2 2L8 18H6v-2z" className="xp-icon-shell" />
          <path d="M13.2 7.8l1.8-1.8 3 3-1.8 1.8" className="xp-icon-shell" />
          <path d="M5.5 18.5h3" className="xp-icon-accent" />
          <path d="M14.8 6.2l3 3" className="xp-icon-dim" />
        </>
      )}

      {variant === 'levels' && (
        <>
          <rect x="4" y="6.5" width="16" height="11" rx="2.5" className="xp-icon-shell" />
          <path d="M4 10h16" className="xp-icon-shell xp-icon-dim" />
          <path d="M6.5 8.2h4" className="xp-icon-accent" />
          <path d="M6.5 12.5h7.5" className="xp-icon-fill" />
          <path d="M6.5 15h5" className="xp-icon-fill xp-icon-dim" />
        </>
      )}

      {variant === 'party' && (
        <>
          <circle cx="8" cy="9.2" r="2.1" className="xp-icon-shell" />
          <circle cx="15.8" cy="9.2" r="2.1" className="xp-icon-shell" />
          <path d="M5.8 17c.8-2.1 2.4-3.2 4.4-3.2S13.8 14.9 14.6 17" className="xp-icon-shell" />
          <path d="M13.6 17c.6-1.4 1.6-2.2 3-2.2 1.4 0 2.5.8 3.1 2.2" className="xp-icon-shell xp-icon-dim" />
          <path d="M10.4 9.2h3" className="xp-icon-accent" />
        </>
      )}

      {variant === 'settings' && (
        <>
          <circle cx="12" cy="12" r="3.2" className="xp-icon-shell" />
          <path d="M12 4.8v2.1M12 17.1v2.1M6.6 6.6l1.5 1.5M15.9 15.9l1.5 1.5M4.8 12h2.1M17.1 12h2.1M6.6 17.4l1.5-1.5M15.9 8.1l1.5-1.5" className="xp-icon-shell" />
          <circle cx="12" cy="12" r="1.2" className="xp-icon-fill" />
        </>
      )}

      {variant === 'panel' && (
        <>
          <rect x="3.5" y="5" width="17" height="14" rx="2.6" className="xp-icon-shell" />
          <path d="M6 8.2h12" className="xp-icon-shell xp-icon-dim" />
          <path d="M6 11.2h5" className="xp-icon-accent" />
          <circle cx="17.2" cy="12.2" r="1.1" className="xp-icon-fill" />
        </>
      )}

      {variant === 'profile' && (
        <>
          <circle cx="12" cy="8.9" r="2.5" className="xp-icon-shell" />
          <path d="M6.2 17.2c.8-2.5 2.8-3.9 5.8-3.9s5 1.4 5.8 3.9" className="xp-icon-shell" />
          <path d="M8 6.6h8" className="xp-icon-accent" />
          <path d="M9.4 14.8h5.2" className="xp-icon-fill xp-icon-dim" />
        </>
      )}

      {variant === 'orb' && (
        <>
          <circle cx="12" cy="12" r="8" className="xp-icon-shell" />
          <path d="M12 7.5v9" className="xp-icon-shell" />
          <path d="M8.7 10.4L12 7.5l3.3 2.9" className="xp-icon-accent" />
          <path d="M8.7 13.6L12 16.5l3.3-2.9" className="xp-icon-dim" />
        </>
      )}

      {variant === 'browse' && (
        <>
          <rect x="4" y="4.5" width="10" height="10" rx="2" className="xp-icon-shell" />
          <path d="M12 9.5h4.5v7H8.5V14" className="xp-icon-shell xp-icon-dim" />
          <path d="M6.5 8h5" className="xp-icon-accent" />
          <path d="M6.5 10.5h3" className="xp-icon-fill" />
          <circle cx="17" cy="7" r="2.2" className="xp-icon-shell" />
          <path d="M18.5 8.8l2.5 2.5" className="xp-icon-accent" />
        </>
      )}

      {variant === 'chevron' && <path d="M9 6l6 6-6 6" className="xp-icon-shell" />}
    </svg>
  );
}