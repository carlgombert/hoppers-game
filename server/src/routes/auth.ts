import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/db';
import { redis } from '../redis/redis';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET ?? 'hoppers_dev_secret';
// Token TTL: 7 days
const JWT_TTL = 60 * 60 * 24 * 7;

// POST /auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { email, password, display_name } = req.body;
  if (!email || !password || !display_name) {
    res.status(400).json({ error: 'email, password, and display_name are required' });
    return;
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await db.query<{ id: string; display_name: string; email: string }>(
      `INSERT INTO users (email, password_hash, display_name)
       VALUES ($1, $2, $3)
       RETURNING id, email, display_name`,
      [email, passwordHash, display_name]
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
router.post('/login', async (req: Request, res: Response) => {
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
    }>(
      `SELECT id, email, display_name, password_hash FROM users WHERE email = $1`,
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
      user: { id: user.id, email: user.email, display_name: user.display_name },
    });
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
