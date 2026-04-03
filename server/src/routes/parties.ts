import { Router, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db/db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Rate limiter: max 30 party requests per 15 minutes per IP
const partyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many party requests, please try again later' },
});

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

// POST /parties — create a party, returns 6-char code
router.post('/', partyLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const { level_id } = req.body;
  if (!level_id) {
    res.status(400).json({ error: 'level_id is required' });
    return;
  }
  try {
    // Generate collision-resistant code with up to 10 retries
    let code = generateCode();
    for (let attempt = 0; attempt < 10; attempt++) {
      const exists = await db.query(`SELECT id FROM parties WHERE code = $1 AND state != 'done'`, [code]);
      if (!exists.rows[0]) break;
      code = generateCode();
    }

    const partyResult = await db.query(
      `INSERT INTO parties (code, host_id, level_id) VALUES ($1, $2, $3) RETURNING *`,
      [code, req.userId, level_id]
    );
    const party = partyResult.rows[0];

    // Add host as first member
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
router.post('/join', partyLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: 'code is required' });
    return;
  }

  // Use a serializable transaction to prevent race conditions on simultaneous joins
  const client = await db.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const partyResult = await client.query(
      `SELECT *
       FROM parties
       WHERE code = $1
       FOR UPDATE`,
      [code.toUpperCase()]
    );
    const party = partyResult.rows[0];

    if (!party) {
      await client.query('ROLLBACK');
      res.status(404).json({ error: 'Party not found' });
      return;
    }

    if (party.state !== 'waiting') {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Party already started or finished' });
      return;
    }

    // Reject self-join (host trying to join their own party as a second member)
    if (party.host_id === req.userId) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'You are already the host of this party' });
      return;
    }

    // Lock existing member rows for this party to serialize membership checks/inserts.
    const membersResult = await client.query(
      `SELECT user_id FROM party_members WHERE party_id = $1 FOR UPDATE`,
      [party.id]
    );
    const memberCount = membersResult.rowCount ?? membersResult.rows.length;

    // Reject if already a member (reconnect after page refresh, etc.)
    const alreadyMember = await client.query(
      `SELECT 1 FROM party_members WHERE party_id = $1 AND user_id = $2`,
      [party.id, req.userId]
    );
    if (alreadyMember.rows[0]) {
      // Idempotent — return the party without error so client can reconnect
      await client.query('COMMIT');
      res.json(party);
      return;
    }

    // Reject if party is already full (2 members)
    if (memberCount >= 2) {
      await client.query('ROLLBACK');
      res.status(409).json({ error: 'Party is full' });
      return;
    }

    await client.query(
      `INSERT INTO party_members (party_id, user_id) VALUES ($1, $2)`,
      [party.id, req.userId]
    );

    await client.query('COMMIT');
    res.json(party);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

export default router;
