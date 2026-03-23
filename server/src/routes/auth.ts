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

// POST /auth/register
router.post('/register', authLimiter, async (req: Request, res: Response) => {
  const { email, password, display_name, avatar_id } = req.body;
  if (!email || !password || !display_name) {
    res.status(400).json({ error: 'email, password, and display_name are required' });
    return;
  }

  let parsedAvatarId: number | null;
  try {
    parsedAvatarId = parseAvatarId(avatar_id);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query<{
      id: string;
      display_name: string;
      email: string;
      avatar_id: number | null;
    }>(
      `INSERT INTO users (email, password_hash, display_name, avatar_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, display_name, avatar_id`,
      [email, passwordHash, display_name, parsedAvatarId]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_TTL });
    res.status(201).json({ token, user });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Email already registered' });
    } else {
      console.error(err);
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// POST /auth/login
router.post('/login', authLimiter, async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  try {
    const result = await db.query<{
      id: string;
      email: string;
      display_name: string;
      password_hash: string;
      avatar_id: number | null;
    }>(
      `SELECT id, email, display_name, password_hash, avatar_id FROM users WHERE email = $1`,
      [email]
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
        email: user.email,
        display_name: user.display_name,
        avatar_id: user.avatar_id,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /auth/me — update avatar for the authenticated user
router.patch('/me', authLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  let parsedAvatarId: number | null;
  try {
    parsedAvatarId = parseAvatarId(req.body.avatar_id);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
    return;
  }

  try {
    const result = await db.query<{
      id: string;
      email: string;
      display_name: string;
      avatar_id: number | null;
    }>(
      `UPDATE users SET avatar_id = $1 WHERE id = $2
       RETURNING id, email, display_name, avatar_id`,
      [parsedAvatarId, req.userId]
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


