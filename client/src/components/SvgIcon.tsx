/**
 * Inline SVG icons sourced from SVGRepo (CC0 / free license).
 * Used throughout the UI in place of emoji and Unicode symbol characters.
 */
import type { SVGProps } from 'react';

export type SvgIconName =
  | 'play'
  | 'preview'
  | 'left'
  | 'right'
  | 'up'
  | 'close'
  | 'check'
  | 'prev-page'
  | 'next-page'
  | 'trophy'
  | 'fork'
  | 'star';

interface SvgIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  name: SvgIconName;
  size?: number;
}

export default function SvgIcon({ name, size = 16, className = '', style, ...props }: SvgIconProps) {
  const shared: SVGProps<SVGSVGElement> = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    className,
    style,
    ...props,
  };

  switch (name) {
    case 'play':
      // SVGRepo — play triangle
      return (
        <svg {...shared}>
          <polygon points="5,3 19,12 5,21" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'preview':
      // SVGRepo — right-facing caret in a frame
      return (
        <svg {...shared}>
          <polygon points="6,4 18,12 6,20" fill="currentColor" stroke="none" />
        </svg>
      );

    case 'left':
      // SVGRepo — chevron left
      return (
        <svg {...shared}>
          <polyline points="15,18 9,12 15,6" />
        </svg>
      );

    case 'right':
      // SVGRepo — chevron right
      return (
        <svg {...shared}>
          <polyline points="9,18 15,12 9,6" />
        </svg>
      );

    case 'up':
      // SVGRepo — chevron up
      return (
        <svg {...shared}>
          <polyline points="18,15 12,9 6,15" />
        </svg>
      );

    case 'close':
      // SVGRepo — X mark
      return (
        <svg {...shared}>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      );

    case 'check':
      // SVGRepo — checkmark
      return (
        <svg {...shared}>
          <polyline points="20,6 9,17 4,12" />
        </svg>
      );

    case 'prev-page':
      // SVGRepo — double chevron left
      return (
        <svg {...shared}>
          <polyline points="11,17 6,12 11,7" />
          <polyline points="18,17 13,12 18,7" />
        </svg>
      );

    case 'next-page':
      // SVGRepo — double chevron right
      return (
        <svg {...shared}>
          <polyline points="13,17 18,12 13,7" />
          <polyline points="6,17 11,12 6,7" />
        </svg>
      );

    case 'trophy':
      // SVGRepo — trophy cup
      return (
        <svg {...shared}>
          <path d="M8 21h8M12 17v4" />
          <path d="M7 4H4a2 2 0 0 0-2 2v1a4 4 0 0 0 4 4h0" />
          <path d="M17 4h3a2 2 0 0 1 2 2v1a4 4 0 0 1-4 4h0" />
          <rect x="7" y="2" width="10" height="14" rx="2" />
        </svg>
      );

    case 'fork':
      // SVGRepo — git fork
      return (
        <svg {...shared}>
          <circle cx="6" cy="18" r="2" />
          <circle cx="18" cy="18" r="2" />
          <circle cx="12" cy="6" r="2" />
          <path d="M6 16v-4a6 6 0 0 1 6-6" />
          <path d="M18 16v-4a6 6 0 0 0-6-6" />
        </svg>
      );

    case 'star':
      // SVGRepo — star
      return (
        <svg {...shared}>
          <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
        </svg>
      );

    default:
      return null;
  }
}
