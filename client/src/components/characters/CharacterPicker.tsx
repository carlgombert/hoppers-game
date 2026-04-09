/**
 * CharacterPicker — visual character selection grid.
 *
 * Mirrors the AvatarPicker pattern but works with the extensible CHARACTERS
 * registry. To support a new skin, just add it to CHARACTERS in
 * client/src/types/characters.ts and add its asset URL to CHARACTER_PREVIEW_URLS.
 */

// Static imports so Vite bundles all preview images correctly.
import soraPreview from '../../assets/game-assets/characters/Sora.png';
import nickPreview from '../../assets/game-assets/characters/Nick.png';
import { CHARACTERS, type CharacterKey } from '../../types/characters';

/** Maps character key → bundled preview image URL. */
const CHARACTER_PREVIEW_URLS: Record<string, string> = {
  sora: soraPreview,
  nick: nickPreview,
};

/** Returns the preview image URL for a character key, or a transparent fallback. */
// eslint-disable-next-line react-refresh/only-export-components
export function getCharacterPreviewSrc(key: CharacterKey): string {
  return CHARACTER_PREVIEW_URLS[key] ?? '';
}

interface CharacterPickerProps {
  selected: CharacterKey | null;
  onChange: (key: CharacterKey) => void;
  disabled?: boolean;
}

export default function CharacterPicker({
  selected,
  onChange,
  disabled = false,
}: CharacterPickerProps) {
  return (
    <div className="xp-character-picker" role="radiogroup" aria-label="Choose a character">
      {CHARACTERS.map(({ key, label }) => {
        const previewSrc = CHARACTER_PREVIEW_URLS[key];
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected === key}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={`xp-character-option${selected === key ? ' selected' : ''}`}
          >
            <div className="xp-character-option-preview">
              {previewSrc ? (
                <img
                  src={previewSrc}
                  alt={label}
                  className="xp-character-option-img"
                  draggable={false}
                />
              ) : (
                <div className="xp-character-option-placeholder" aria-hidden="true" />
              )}
            </div>
            <span className="xp-character-option-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
