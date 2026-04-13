import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { db } from '../db/db';
import { redis } from '../redis/redis';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'hoppers_dev_secret';
// Token TTL: 7 days
const JWT_TTL = 60 * 60 * 24 * 7;

// Rate limiter: max 10 auth attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again later' },
});

/** Validates avatar_id. Returns the parsed integer or null, or throws a descriptive error string. */
function parseAvatarId(value: unknown): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 12) {
    throw new Error('avatar_id must be an integer between 1 and 12');
  }
  return parsed;
}

/**
 * Validates character_key. Any non-empty string is accepted so new skins can be
 * added without a server deploy. Returns undefined when the field is absent.
 */
function parseCharacterKey(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('character_key must be a non-empty string');
  }
  return value.trim();
}

// POST /auth/register
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const { username, password, avatar_id, character_key } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  let parsedAvatarId: number | null;
  try {
    parsedAvatarId = parseAvatarId(avatar_id);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  let parsedCharacterKey: string | undefined;
  try {
    parsedCharacterKey = parseCharacterKey(character_key);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query<{
      id: string;
      username: string;
      avatar_id: number | null;
      character_key: string;
    }>(
      `INSERT INTO users (username, password_hash, avatar_id, character_key)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, avatar_id, character_key`,
      [username, passwordHash, parsedAvatarId, parsedCharacterKey ?? 'sora']
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_TTL });
    res.status(201).json({ token, user });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Username already taken' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'username and password are required' });
    return;
  }

  try {
    const result = await db.query<{
      id: string;
      username: string;
      password_hash: string;
      avatar_id: number | null;
      character_key: string;
    }>(
      `SELECT id, username, password_hash, avatar_id, character_key FROM users WHERE username = $1`,
      [username]
    );

    const user = result.rows[0];
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_TTL });
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        avatar_id: user.avatar_id,
        character_key: user.character_key,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /auth/me — update avatar and/or character for the authenticated user
router.patch('/me', authLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  let parsedAvatarId: number | null;
  try {
    parsedAvatarId = parseAvatarId(req.body.avatar_id);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  let parsedCharacterKey: string | undefined;
  try {
    parsedCharacterKey = parseCharacterKey(req.body.character_key);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  try {
    // Build dynamic SET clause from whichever fields were supplied.
    const setClauses: string[] = [];
    const params: unknown[] = [];

    if (req.body.avatar_id !== undefined) {
      params.push(parsedAvatarId);
      setClauses.push(`avatar_id = $${params.length}`);
    }
    if (parsedCharacterKey !== undefined) {
      params.push(parsedCharacterKey);
      setClauses.push(`character_key = $${params.length}`);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No updatable fields provided' });
      return;
    }

    params.push(req.userId);
    const result = await db.query<{
      id: string;
      username: string;
      avatar_id: number | null;
      character_key: string;
    }>(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $${params.length}
       RETURNING id, username, avatar_id, character_key`,
      params
    );

    if (!result.rows[0]) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /auth/logout — adds token to Redis blocklist
router.post('/logout', requireAuth, async (req: AuthRequest, res: Response) => {
  const token = req.headers.authorization!.slice(7);
  // Store in blocklist until it would naturally expire
  await redis.set(`blocklist:${token}`, '1', { EX: JWT_TTL });
  res.json({ ok: true });
});

export default router;


