import { Router, Response } from 'express';
import { db } from '../db/db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

// POST /parties — create a party, returns 6-char code
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { level_id } = req.body;
  if (!level_id) {
    res.status(400).json({ error: 'level_id is required' });
    return;
  }
  try {
    let code = generateCode();
    // Retry on collision
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await db.query(`SELECT id FROM parties WHERE code = $1`, [code]);
      if (!exists.rows[0]) break;
      code = generateCode();
    }

    const partyResult = await db.query(
      `INSERT INTO parties (code, host_id, level_id) VALUES ($1, $2, $3) RETURNING *`,
      [code, req.userId, level_id]
    );
    const party = partyResult.rows[0];

    // Add host as a member
    await db.query(
      `INSERT INTO party_members (party_id, user_id) VALUES ($1, $2)`,
      [party.id, req.userId]
    );

    res.status(201).json(party);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /parties/join — join by code
router.post('/join', requireAuth, async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: 'code is required' });
    return;
  }
  try {
    const partyResult = await db.query(
      `SELECT * FROM parties WHERE code = $1`,
      [code.toUpperCase()]
    );
    const party = partyResult.rows[0];
    if (!party) {
      res.status(404).json({ error: 'Party not found' });
      return;
    }
    if (party.state !== 'waiting') {
      res.status(409).json({ error: 'Party already started' });
      return;
    }

    await db.query(
      `INSERT INTO party_members (party_id, user_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [party.id, req.userId]
    );

    res.json(party);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
