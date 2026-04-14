-- Migration to transition from email-based identity to username-based identity.
-- This drops 'email' and 'display_name' and consolidates them into a single unique 'username' column.

-- 1. Add the new column
ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;

-- 2. Populate 'username' from 'display_name' or 'email' (check if columns exist first)
DO $$
BEGIN
    -- If username is already set for all rows, we can skip data migration
    IF EXISTS (SELECT 1 FROM users WHERE username IS NULL) THEN
        -- Try display_name first
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='display_name') THEN
            UPDATE users SET username = display_name WHERE username IS NULL;
        END IF;

        -- Then try email for any remaining NULLs
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='email') THEN
            UPDATE users SET username = split_part(email, '@', 1) WHERE username IS NULL OR username = '';
        END IF;
    END IF;
END $$;

-- 3. Resolve duplicates by appending the ID if the same username exists
-- Only run if there are duplicates to be safe
UPDATE users u
SET username = username || '_' || id::text
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY username ORDER BY id) as rn
    FROM users
  ) t WHERE rn > 1
);

-- 4. Enforce constraints
-- Ensure we have a value for everything before setting NOT NULL
-- (If both display_name and email were missing and username is still null, 
-- we use ID to avoid NOT NULL violation, though this shouldn't happen)
UPDATE users SET username = id::text WHERE username IS NULL;

ALTER TABLE users ALTER COLUMN username SET NOT NULL;

-- Only add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique') THEN
        ALTER TABLE users ADD CONSTRAINT users_username_unique UNIQUE (username);
    END IF;
END $$;

-- 5. Drop legacy columns
ALTER TABLE users DROP COLUMN IF EXISTS email;
ALTER TABLE users DROP COLUMN IF EXISTS display_name;
