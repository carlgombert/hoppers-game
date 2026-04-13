import type { SVGProps } from 'react';

export type ChromeIconVariant =
  | 'game'
  | 'editor'
  | 'levels'
  | 'party'
  | 'settings'
  | 'panel'
  | 'profile'
  | 'logout'
  | 'browse'
  | 'plus'
  | 'undo'
  | 'redo'
  | 'save'
  | 'publish'
  | 'chevron';

interface ChromeIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  variant: ChromeIconVariant;
  size?: number;
}

const VIEWBOXES: Record<ChromeIconVariant, string> = {
  game: '0 0 24 24',
  editor: '0 0 16 16',
  levels: '0 0 24 24',
  party: '0 -6 44 44',
  settings: '0 0 24 24',
  panel: '0 0 24 24',
  profile: '0 0 24 24',
  logout: '0 0 24 24',
  browse: '0 0 1024 1024',
  plus: '0 0 16 16',
  undo: '0 0 16 16',
  redo: '0 0 16 16',
  save: '0 0 16 16',
  publish: '0 0 16 16',
  chevron: '0 0 24 24',
};

export default function ChromeIcon({ variant, size = 24, className = '', ...props }: ChromeIconProps) {
  const classes = ['xp-icon-shell', className].filter(Boolean).join(' ');
  const viewBox = VIEWBOXES[variant] || '0 0 24 24';

  return (
    <svg
      className={classes}
      width={size}
      height={size}
      viewBox={viewBox}
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
          <path d="M8.29289 3.70711L1 11V15H5L12.2929 7.70711L8.29289 3.70711Z" className="xp-icon-fill" />
          <path d="M9.70711 2.29289L13.7071 6.29289L15.1716 4.82843C15.702 4.29799 16 3.57857 16 2.82843C16 1.26633 14.7337 0 13.1716 0C12.4214 0 11.702 0.297995 11.1716 0.828428L9.70711 2.29289Z" className="xp-icon-fill xp-icon-accent" />
        </>
      )}

      {variant === 'levels' && (
        <>
          <path d="M6.2 19H17.8C18.9201 19 19.4802 19 19.908 18.782C20.2843 18.5903 20.5903 18.2843 20.782 17.908C21 17.4802 21 16.9201 21 15.8V8.2C21 7.0799 21 6.51984 20.782 6.09202C20.5903 5.71569 20.2843 5.40973 19.908 5.21799C19.4802 5 18.9201 5 17.8 5H6.2C5.0799 5 4.51984 5 4.09202 5.21799C3.71569 5.40973 3.40973 5.71569 3.21799 6.09202C3 6.51984 3 7.07989 3 8.2V15.8C3 16.9201 3 17.4802 3.21799 17.908C3.40973 18.2843 3.71569 18.5903 4.09202 18.782C4.51984 19 5.07989 19 6.2 19Z" className="xp-icon-shell" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 7.9502H6.01M9 7.9502H9.01M12 7.9502H12.01" className="xp-icon-accent" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}

      {variant === 'party' && (
        <path d="M42.001,32.000 L14.010,32.000 C12.908,32.000 12.010,31.104 12.010,30.001 L12.010,28.002 C12.010,27.636 12.211,27.300 12.532,27.124 L22.318,21.787 C19.040,18.242 19.004,13.227 19.004,12.995 L19.010,7.002 C19.010,6.946 19.015,6.891 19.024,6.837 C19.713,2.751 24.224,0.007 28.005,0.007 C28.006,0.007 28.008,0.007 28.009,0.007 C31.788,0.007 36.298,2.749 36.989,6.834 C36.998,6.889 37.003,6.945 37.003,7.000 L37.006,12.994 C37.006,13.225 36.970,18.240 33.693,21.785 L43.479,27.122 C43.800,27.298 44.000,27.634 44.000,28.000 L44.000,30.001 C44.000,31.104 43.103,32.000 42.001,32.000 ZM31.526,22.880 C31.233,22.720 31.039,22.425 31.008,22.093 C30.978,21.761 31.116,21.436 31.374,21.226 C34.971,18.310 35.007,13.048 35.007,12.995 L35.003,7.089 C34.441,4.089 30.883,2.005 28.005,2.005 C25.126,2.006 21.570,4.091 21.010,7.091 L21.004,12.997 C21.004,13.048 21.059,18.327 24.636,21.228 C24.895,21.438 25.033,21.763 25.002,22.095 C24.972,22.427 24.778,22.722 24.485,22.882 L14.010,28.596 L14.010,30.001 L41.999,30.001 L42.000,28.595 L31.526,22.880 ZM18.647,2.520 C17.764,2.177 16.848,1.997 15.995,1.997 C13.116,1.998 9.559,4.083 8.999,7.083 L8.993,12.989 C8.993,13.041 9.047,18.319 12.625,21.220 C12.884,21.430 13.022,21.755 12.992,22.087 C12.961,22.419 12.767,22.714 12.474,22.874 L1.999,28.588 L1.999,29.993 L8.998,29.993 C9.550,29.993 9.997,30.441 9.997,30.993 C9.997,31.545 9.550,31.993 8.998,31.993 L1.999,31.993 C0.897,31.993 -0.000,31.096 -0.000,29.993 L-0.000,27.994 C-0.000,27.629 0.200,27.292 0.521,27.117 L10.307,21.779 C7.030,18.234 6.993,13.219 6.993,12.988 L6.999,6.994 C6.999,6.939 7.004,6.883 7.013,6.829 C7.702,2.744 12.213,-0.000 15.995,-0.000 C15.999,-0.000 16.005,-0.000 16.010,-0.000 C17.101,-0.000 18.262,0.227 19.369,0.656 C19.885,0.856 20.140,1.435 19.941,1.949 C19.740,2.464 19.158,2.720 18.647,2.520 Z" className="xp-icon-fill" fill="currentColor" />
      )}


      {variant === 'panel' && (
        <>
          <rect x="3.5" y="5" width="17" height="14" rx="2.6" className="xp-icon-shell" />
          <path d="M6 8.2h12" className="xp-icon-shell xp-icon-dim" />
          <path d="M6 11.2h5" className="xp-icon-accent" />
          <circle cx="17.2" cy="12.2" r="1.1" className="xp-icon-fill" fill="currentColor" />
        </>
      )}

      {variant === 'profile' && (
        <>
          <circle cx="12" cy="8.9" r="2.5" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.6" />
          <path d="M6.2 17.2c.8-2.5 2.8-3.9 5.8-3.9s5 1.4 5.8 3.9" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.6" />
          <path d="M8 6.6h8" className="xp-icon-accent" stroke="currentColor" strokeWidth="1.6" />
          <path d="M9.4 14.8h5.2" className="xp-icon-fill xp-icon-dim" stroke="currentColor" strokeWidth="1.6" />
        </>
      )}

      {variant === 'logout' && (
        <>
          <path d="M10 12H20M20 12L17 9M20 12L17 15" className="xp-icon-accent" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 12C4 7.58172 7.58172 4 12 4M12 20C9.47362 20 7.22075 18.8289 5.75463 17" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}

      {variant === 'browse' && (
        <path d="M372.288 745.792a394.048 394.048 0 0 0 113.728 102.848v-127.744a390.08 390.08 0 0 0-113.728 24.896z m-51.584 24.192a392.96 392.96 0 0 0-60.16 41.6h-1.28a390.336 390.336 0 0 0 205.696 89.6 450.24 450.24 0 0 1-144.256-131.2z m-24.704-230.016c3.968 56.768 20.096 110.208 45.696 157.696a445.696 445.696 0 0 1 144.32-32.896v-124.8h-190.08z m-56.128 0H120.96a390.4 390.4 0 0 0 98.56 233.024c22.208-19.2 46.272-36.224 71.808-50.752a445.312 445.312 0 0 1-51.456-182.272z m445.824 158.784c25.984-47.808 42.24-101.568 46.336-158.72H540.992v124.864c51.072 3.2 99.776 14.976 144.704 33.92z m50.24 24.96c24.448 14.08 47.552 30.464 68.928 48.896a390.4 390.4 0 0 0 98.176-232.576h-114.88a445.312 445.312 0 0 1-52.224 183.68z m-194.944 125.44a394.048 394.048 0 0 0 113.92-102.4 389.888 389.888 0 0 0-113.92-25.728v128.192z m23.104 51.392a390.4 390.4 0 0 0 200.704-88.96h-0.512a392.96 392.96 0 0 0-57.92-40.32 450.24 450.24 0 0 1-142.272 129.28zM341.76 326.144a389.632 389.632 0 0 0-45.76 157.824h190.016V358.976a445.696 445.696 0 0 1-144.256-32.768z m-50.368-24.576a449.216 449.216 0 0 1-71.808-50.56 390.4 390.4 0 0 0-98.56 232.96h118.848a445.312 445.312 0 0 1 51.52-182.4z m194.56-126.208A394.048 394.048 0 0 0 372.48 278.016a390.08 390.08 0 0 0 113.536 24.768V175.36z m-20.992-52.544a390.272 390.272 0 0 0-205.312 89.152h0.512c18.88 15.872 39.168 29.888 60.608 41.92a450.24 450.24 0 0 1 144.192-131.072z m189.76 154.048a394.048 394.048 0 0 0-113.728-102.08v127.808a389.952 389.952 0 0 0 113.728-25.728z m51.392-24.576a392.96 392.96 0 0 0 57.856-40.32h0.384A390.336 390.336 0 0 0 564.16 123.52a450.24 450.24 0 0 1 141.952 128.832z m25.92 231.68a389.632 389.632 0 0 0-46.528-159.168 445.568 445.568 0 0 1-144.512 33.92v125.248h191.04z m56.128 0h114.88a390.4 390.4 0 0 0-98.56-232.96 449.28 449.28 0 0 1-68.736 48.896c29.824 55.424 48.32 117.76 52.416 184.128zM512 960A448 448 0 1 1 512 64a448 448 0 0 1 0 896z" className="xp-icon-fill" fill="currentColor" />
      )}

      {variant === 'plus' && (
        <>
          <path d="M8 3V13M3 8H13" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          <circle cx="8" cy="8" r="1.5" className="xp-icon-fill xp-icon-accent" />
        </>
      )}
      {variant === 'undo' && (
        <path d="M4 8H2M2 8L5 5M2 8L5 11M4 8C4 8 5.5 5 10 5C14.5 5 14.5 11 10 11H8" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {variant === 'redo' && (
        <path d="M12 8H14M14 8L11 5M14 8L11 11M12 8C12 8 10.5 5 6 5C1.5 5 1.5 11 6 11H8" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {variant === 'save' && (
        <>
          <path d="M3 2H11L14 5V14H3V2Z" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.5" />
          <rect x="5" y="2" width="6" height="4" className="xp-icon-fill xp-icon-dim" fill="currentColor" />
          <rect x="5" y="9" width="6" height="5" className="xp-icon-accent" stroke="currentColor" strokeWidth="1.2" />
        </>
      )}
      {variant === 'publish' && (
        <>
          <path d="M8 2V10M8 2L5 5M8 2L11 5" className="xp-icon-accent" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M2 11V13C2 13.5523 2.44772 14 3 14H13C13.5523 14 14 13.5523 14 13V11" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </>
      )}
      {variant === 'chevron' && <path d="M9 6l6 6-6 6" className="xp-icon-shell" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  );
}