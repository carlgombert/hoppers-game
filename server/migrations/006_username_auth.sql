-- Migration to transition from email-based identity to username-based identity.
-- This drops 'email' and 'display_name' and consolidates them into a single unique 'username' column.

-- 1. Add the new column
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Populate with existing display names
UPDATE users SET username = display_name;

-- 3. If any usernames are null (shouldn't be based on previous schema) or empty, use email prefix
UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL OR username = '';

-- 4. Resolve duplicates by appending the ID if the same username exists
UPDATE users u
SET username = username || '_' || id::text
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY username ORDER BY id) as rn
    FROM users
  ) t WHERE rn > 1
);

-- 5. Enforce constraints
ALTER TABLE users ALTER COLUMN username SET NOT NULL;
ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);

-- 6. Drop legacy columns
ALTER TABLE users DROP COLUMN email;
ALTER TABLE users DROP COLUMN display_name;
