-- Add avatar_id to users.
-- Values 1–12 map to the static avatar images in client/src/assets/avatars/.
-- NULL means no avatar selected (fallback to chrome icon).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS avatar_id INTEGER
    CHECK (avatar_id BETWEEN 1 AND 12);
