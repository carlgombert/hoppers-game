CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS levels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  tile_data     JSONB NOT NULL DEFAULT '[]',
  published     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Thumbnail stored as base64 data URI string (replaces S3 for now)
  thumbnail     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on level changes
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER levels_updated_at
  BEFORE UPDATE ON levels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS level_saves (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id         UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  checkpoint_state JSONB NOT NULL DEFAULT '{}',
  saved_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, level_id)
);

CREATE TABLE IF NOT EXISTS parties (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code       CHAR(6) NOT NULL UNIQUE,
  host_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id   UUID NOT NULL REFERENCES levels(id) ON DELETE CASCADE,
  state      TEXT NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting', 'active', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS party_members (
  party_id  UUID NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  socket_id TEXT,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (party_id, user_id)
);
