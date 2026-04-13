import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { db } from '../db/db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

// Rate limiters for write/auth-protected operations
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// ── Tile type classifications for BFS path validation ─────────────────────────

const SOLID_TYPES = new Set([
  'land', 'grass', 'demon_grass', 'ice', 'falling_land', 'moving_box',
]);

const HAZARD_TYPES = new Set(['water', 'lava', 'boombox', 'laser']);

type TileEntry = {
  type: string;
  x: number;
  y: number;
  waterVariant?: 'still' | 'flow';
  linkedPortalId?: string;
  direction?: 'h' | 'v';
};

function tileKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Normalizes water tiles before persistence:
 * - authored water tiles become `waterVariant: 'still'`
 * - generated flow tiles are never persisted (runtime-only visuals/physics)
 */
function applyWaterFill(tiles: TileEntry[]): TileEntry[] {
  const normalized = tiles
    .filter((t) => !(t.type === 'water' && t.waterVariant === 'flow'))
    .map((raw) => {
      const next: TileEntry = { ...raw };
      if (next.type === 'water') {
        next.waterVariant = 'still';
      } else {
        delete next.waterVariant;
      }
      return next;
    });

  return normalized.sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

/**
 * Simplified grid BFS: checks that a non-hazard, non-solid path exists between
 * the flag_start cell and the flag_finish cell (4-directional flood fill).
 * Gravity/jumping physics are not simulated — this is a fast structural check.
 */
function hasPathFromStartToFinish(tiles: TileEntry[]): boolean {
  const startTile = tiles.find((t) => t.type === 'flag_start');
  const finishTile = tiles.find((t) => t.type === 'flag_finish');
  if (!startTile || !finishTile) return false;

  // Build blocked cell set (solid + hazard)
  const blocked = new Set<string>();
  for (const t of tiles) {
    if (SOLID_TYPES.has(t.type) || HAZARD_TYPES.has(t.type)) {
      blocked.add(`${t.x},${t.y}`);
    }
  }

  const startKey = `${startTile.x},${startTile.y}`;
  const finishKey = `${finishTile.x},${finishTile.y}`;
  if (blocked.has(finishKey)) return false;

  // BFS
  const visited = new Set<string>();
  const queue: [number, number][] = [[startTile.x, startTile.y]];
  visited.add(startKey);

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (visited.has(key) || blocked.has(key)) continue;
      if (key === finishKey) return true;
      // Restrict BFS to a reasonable grid size (max ±200 tiles from start)
      if (Math.abs(nx - startTile.x) > 200 || Math.abs(ny - startTile.y) > 200) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }
  return false;
}

// GET /levels — list published levels (paginated)
router.get('/', readLimiter, async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const result = await db.query(
      `SELECT l.id, l.title, l.description, l.thumbnail, l.backdrop_id, l.created_at,
              u.display_name AS author
       FROM levels l
       JOIN users u ON u.id = l.owner_id
       WHERE l.published = TRUE
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const total = await db.query(
      `SELECT COUNT(*) FROM levels WHERE published = TRUE`
    );
    res.json({ levels: result.rows, total: parseInt(total.rows[0].count), page });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /levels/mine — current user's levels
router.get('/mine', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      `SELECT id, title, description, tile_data, published, thumbnail, backdrop_id, created_at, updated_at
       FROM levels WHERE owner_id = $1 ORDER BY updated_at DESC`,
      [req.userId]
    );
    res.json({ levels: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /levels/:id — single level
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT l.*, u.display_name AS author
       FROM levels l JOIN users u ON u.id = l.owner_id
       WHERE l.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) {
      res.status(404).json({ error: 'Level not found' });
      return;
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /levels — create a new level
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const { title, description, tile_data, backdrop_id } = req.body;
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  try {
    const incomingTiles = Array.isArray(tile_data) ? (tile_data as TileEntry[]) : [];
    const normalizedTiles = applyWaterFill(incomingTiles);

    const result = await db.query(
      `INSERT INTO levels (owner_id, title, description, tile_data, backdrop_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.userId, title, description ?? null, JSON.stringify(normalizedTiles), backdrop_id ?? 'default']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /levels/:id — update level (owner only)
router.patch('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  const { title, description, tile_data, published, thumbnail, backdrop_id } = req.body;

  try {
    // Verify ownership
    const check = await db.query(
      `SELECT owner_id FROM levels WHERE id = $1`,
      [req.params.id]
    );
    if (!check.rows[0]) {
      res.status(404).json({ error: 'Level not found' });
      return;
    }
    if (check.rows[0].owner_id !== req.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const normalizedTileData: TileEntry[] | null = Array.isArray(tile_data)
      ? applyWaterFill(tile_data as TileEntry[])
      : null;

    // Validate before publishing
    if (published === true && normalizedTileData) {
      const tiles: TileEntry[] = normalizedTileData;
      const hasStart = tiles.some((t) => t.type === 'flag_start');
      const hasFinish = tiles.some((t) => t.type === 'flag_finish');
      if (!hasStart || !hasFinish) {
        res.status(400).json({
          error: 'Level must contain a flag_start and a flag_finish to be published',
        });
        return;
      }
      // BFS path reachability check (Phase 5)
      if (!hasPathFromStartToFinish(tiles)) {
        res.status(400).json({
          error: 'Level validation failed: no accessible path exists from the start flag to the finish flag',
        });
        return;
      }
    }

    const result = await db.query(
      `UPDATE levels SET
         title       = COALESCE($1, title),
         description = COALESCE($2, description),
         tile_data   = COALESCE($3, tile_data),
         published   = COALESCE($4, published),
         thumbnail   = COALESCE($5, thumbnail),
         backdrop_id = COALESCE($6, backdrop_id)
       WHERE id = $7
       RETURNING *`,
      [
        title ?? null,
        description ?? null,
        normalizedTileData ? JSON.stringify(normalizedTileData) : null,
        published ?? null,
        thumbnail ?? null,
        backdrop_id ?? null,
        req.params.id,
      ]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /levels/:id — owner only
router.delete('/:id', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const check = await db.query(`SELECT owner_id FROM levels WHERE id = $1`, [
      req.params.id,
    ]);
    if (!check.rows[0]) {
      res.status(404).json({ error: 'Level not found' });
      return;
    }
    if (check.rows[0].owner_id !== req.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await db.query(`DELETE FROM levels WHERE id = $1`, [req.params.id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /levels/:id/fork — copy a published level to the caller's library
router.post('/:id/fork', writeLimiter, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const src = await db.query(
      `SELECT title, description, tile_data, backdrop_id FROM levels WHERE id = $1 AND published = TRUE`,
      [req.params.id]
    );
    if (!src.rows[0]) {
      res.status(404).json({ error: 'Level not found or not published' });
      return;
    }
    const { title, description, tile_data, backdrop_id } = src.rows[0];
    const result = await db.query(
      `INSERT INTO levels (owner_id, title, description, tile_data, backdrop_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.userId, `${title} (fork)`, description ?? null, JSON.stringify(tile_data), backdrop_id ?? 'default']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /levels/:id/leaderboard — top 10 completion times for a level
router.get('/:id/leaderboard', readLimiter, async (req: Request, res: Response) => {
  try {
    const result = await db.query(
      `SELECT u.display_name,
              (ls.checkpoint_state->>'elapsed_ms')::int AS elapsed_ms
       FROM level_saves ls
       JOIN users u ON u.id = ls.user_id
       WHERE ls.level_id = $1
         AND ls.checkpoint_state->>'completed' = 'true'
         AND ls.checkpoint_state->>'elapsed_ms' IS NOT NULL
       ORDER BY elapsed_ms ASC
       LIMIT 10`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
