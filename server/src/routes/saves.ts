import { Router, Response } from 'express';
import { db } from '../db/db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// POST /saves — upsert checkpoint progress
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { level_id, checkpoint_state } = req.body;
  if (!level_id || !checkpoint_state) {
    res.status(400).json({ error: 'level_id and checkpoint_state are required' });
    return;
  }
  try {
    const existingResult = await db.query(
      `SELECT checkpoint_state FROM level_saves WHERE user_id = $1 AND level_id = $2`,
      [req.userId, level_id]
    );

    const existingState = (existingResult.rows[0]?.checkpoint_state ?? {}) as {
      x?: number;
      y?: number;
      checkpointTileKey?: string;
      completed?: boolean;
      elapsed_ms?: number;
    };
    const incomingState = checkpoint_state as {
      x?: number;
      y?: number;
      checkpointTileKey?: string;
      completed?: boolean;
      elapsed_ms?: number;
    };

    const mergedState: {
      x?: number;
      y?: number;
      checkpointTileKey?: string;
      completed?: boolean;
      elapsed_ms?: number;
    } = { ...existingState, ...incomingState };

    const existingElapsed = typeof existingState.elapsed_ms === 'number'
      ? existingState.elapsed_ms
      : null;
    const incomingElapsed = typeof incomingState.elapsed_ms === 'number'
      ? incomingState.elapsed_ms
      : null;
    const incomingCompleted = incomingState.completed === true;
    const existingCompleted = existingState.completed === true;

    // Keep completion state once earned so later checkpoint saves don't remove leaderboard entries.
    if (incomingCompleted || existingCompleted) {
      mergedState.completed = true;
    }

    // Personal best is the minimum elapsed time; never regress to a slower run.
    if (incomingCompleted && incomingElapsed !== null) {
      mergedState.elapsed_ms = existingElapsed === null
        ? incomingElapsed
        : Math.min(existingElapsed, incomingElapsed);
    } else if (existingElapsed !== null) {
      mergedState.elapsed_ms = existingElapsed;
    }

    const result = await db.query(
      `INSERT INTO level_saves (user_id, level_id, checkpoint_state, saved_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, level_id) DO UPDATE
         SET checkpoint_state = EXCLUDED.checkpoint_state,
             saved_at         = NOW()
       RETURNING *`,
      [req.userId, level_id, JSON.stringify(mergedState)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /saves/:levelId — retrieve save for a specific level
router.get('/:levelId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      `SELECT * FROM level_saves WHERE user_id = $1 AND level_id = $2`,
      [req.userId, req.params.levelId]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'No save found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
