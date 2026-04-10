export const DEFAULT_BACKDROP_ID = 'default';

export interface BackdropOption {
  id: string;
  label: string;
}

export const BACKDROP_OPTIONS: readonly BackdropOption[] = [
  { id: DEFAULT_BACKDROP_ID, label: 'Classic Gradient' },
  { id: 'mountains', label: 'Mountains' },
];

const BACKDROP_IDS = new Set(BACKDROP_OPTIONS.map((option) => option.id));

export function normalizeBackdropId(backdropId: string | null | undefined): string {
  if (!backdropId) return DEFAULT_BACKDROP_ID;
  return BACKDROP_IDS.has(backdropId) ? backdropId : DEFAULT_BACKDROP_ID;
}
