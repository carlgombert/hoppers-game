-- Add character_key to users.
-- Values map to sprite filenames in client/src/assets/game-assets/characters/.
-- Defaults to 'sora' (the original test skin). No CHECK constraint so new skins
-- can be added without a schema change.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS character_key TEXT NOT NULL DEFAULT 'sora';
