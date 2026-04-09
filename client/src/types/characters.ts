/**
 * Character registry — extensible skin system.
 *
 * To add a new playable character:
 *   1. Drop the sprite PNG into client/src/assets/game-assets/characters/
 *   2. Import it in GameCanvas.tsx and add it to CHARACTER_ASSET_URLS.
 *   3. Add an entry to CHARACTERS below.
 */

/** Loose string type so new skins never require a type-system change. */
export type CharacterKey = string;

export interface CharacterMeta {
  key: CharacterKey;
  /** Human-readable display name shown in the picker. */
  label: string;
}

/** All currently available playable characters. */
export const CHARACTERS: CharacterMeta[] = [
  { key: 'sora', label: 'Sora' },
  { key: 'nick', label: 'Nick' },
];

/** Fallback used when the stored key is absent or unrecognised. */
export const DEFAULT_CHARACTER_KEY: CharacterKey = 'sora';

/** Returns true when `key` is one of the registered character keys. */
export function isValidCharacterKey(key: unknown): key is CharacterKey {
  return typeof key === 'string' && CHARACTERS.some((c) => c.key === key);
}
