"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const db_1 = require("../db/db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// Rate limiters for write/auth-protected operations
const writeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
});
const readLimiter = (0, express_rate_limit_1.default)({
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
/**
 * Simplified grid BFS: checks that a non-hazard, non-solid path exists between
 * the flag_start cell and the flag_finish cell (4-directional flood fill).
 * Gravity/jumping physics are not simulated — this is a fast structural check.
 */
function hasPathFromStartToFinish(tiles) {
    const startTile = tiles.find((t) => t.type === 'flag_start');
    const finishTile = tiles.find((t) => t.type === 'flag_finish');
    if (!startTile || !finishTile)
        return false;
    // Build blocked cell set (solid + hazard)
    const blocked = new Set();
    for (const t of tiles) {
        if (SOLID_TYPES.has(t.type) || HAZARD_TYPES.has(t.type)) {
            blocked.add(`${t.x},${t.y}`);
        }
    }
    const startKey = `${startTile.x},${startTile.y}`;
    const finishKey = `${finishTile.x},${finishTile.y}`;
    if (blocked.has(finishKey))
        return false;
    // BFS
    const visited = new Set();
    const queue = [[startTile.x, startTile.y]];
    visited.add(startKey);
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        for (const [dx, dy] of DIRS) {
            const nx = cx + dx;
            const ny = cy + dy;
            const key = `${nx},${ny}`;
            if (visited.has(key) || blocked.has(key))
                continue;
            if (key === finishKey)
                return true;
            // Restrict BFS to a reasonable grid size (max ±200 tiles from start)
            if (Math.abs(nx - startTile.x) > 200 || Math.abs(ny - startTile.y) > 200)
                continue;
            visited.add(key);
            queue.push([nx, ny]);
        }
    }
    return false;
}
// GET /levels — list published levels (paginated)
router.get('/', readLimiter, async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    try {
        const result = await db_1.db.query(`SELECT l.id, l.title, l.description, l.thumbnail, l.backdrop_id, l.created_at,
              u.display_name AS author
       FROM levels l
       JOIN users u ON u.id = l.owner_id
       WHERE l.published = TRUE
       ORDER BY l.created_at DESC
       LIMIT $1 OFFSET $2`, [limit, offset]);
        const total = await db_1.db.query(`SELECT COUNT(*) FROM levels WHERE published = TRUE`);
        res.json({ levels: result.rows, total: parseInt(total.rows[0].count), page });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// GET /levels/mine — current user's levels
router.get('/mine', auth_1.requireAuth, async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT id, title, description, tile_data, published, thumbnail, backdrop_id, created_at, updated_at
       FROM levels WHERE owner_id = $1 ORDER BY updated_at DESC`, [req.userId]);
        res.json({ levels: result.rows });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// GET /levels/:id — single level
router.get('/:id', async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT l.*, u.display_name AS author
       FROM levels l JOIN users u ON u.id = l.owner_id
       WHERE l.id = $1`, [req.params.id]);
        if (!result.rows[0]) {
            res.status(404).json({ error: 'Level not found' });
            return;
        }
        res.json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// POST /levels — create a new level
router.post('/', auth_1.requireAuth, async (req, res) => {
    const { title, description, tile_data, backdrop_id } = req.body;
    if (!title) {
        res.status(400).json({ error: 'title is required' });
        return;
    }
    try {
        const result = await db_1.db.query(`INSERT INTO levels (owner_id, title, description, tile_data, backdrop_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [req.userId, title, description ?? null, JSON.stringify(tile_data ?? []), backdrop_id ?? 'default']);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// PATCH /levels/:id — update level (owner only)
router.patch('/:id', auth_1.requireAuth, async (req, res) => {
    const { title, description, tile_data, published, thumbnail, backdrop_id } = req.body;
    try {
        // Verify ownership
        const check = await db_1.db.query(`SELECT owner_id FROM levels WHERE id = $1`, [req.params.id]);
        if (!check.rows[0]) {
            res.status(404).json({ error: 'Level not found' });
            return;
        }
        if (check.rows[0].owner_id !== req.userId) {
            res.status(403).json({ error: 'Forbidden' });
            return;
        }
        // Validate before publishing
        if (published === true && tile_data) {
            const tiles = tile_data;
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
        const result = await db_1.db.query(`UPDATE levels SET
         title       = COALESCE($1, title),
         description = COALESCE($2, description),
         tile_data   = COALESCE($3, tile_data),
         published   = COALESCE($4, published),
         thumbnail   = COALESCE($5, thumbnail),
         backdrop_id = COALESCE($6, backdrop_id)
       WHERE id = $7
       RETURNING *`, [
            title ?? null,
            description ?? null,
            tile_data ? JSON.stringify(tile_data) : null,
            published ?? null,
            thumbnail ?? null,
            backdrop_id ?? null,
            req.params.id,
        ]);
        res.json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// DELETE /levels/:id — owner only
router.delete('/:id', auth_1.requireAuth, async (req, res) => {
    try {
        const check = await db_1.db.query(`SELECT owner_id FROM levels WHERE id = $1`, [
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
        await db_1.db.query(`DELETE FROM levels WHERE id = $1`, [req.params.id]);
        res.status(204).end();
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// POST /levels/:id/fork — copy a published level to the caller's library
router.post('/:id/fork', writeLimiter, auth_1.requireAuth, async (req, res) => {
    try {
        const src = await db_1.db.query(`SELECT title, description, tile_data, backdrop_id FROM levels WHERE id = $1 AND published = TRUE`, [req.params.id]);
        if (!src.rows[0]) {
            res.status(404).json({ error: 'Level not found or not published' });
            return;
        }
        const { title, description, tile_data, backdrop_id } = src.rows[0];
        const result = await db_1.db.query(`INSERT INTO levels (owner_id, title, description, tile_data, backdrop_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`, [req.userId, `${title} (fork)`, description ?? null, JSON.stringify(tile_data), backdrop_id ?? 'default']);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// GET /levels/:id/leaderboard — top 10 completion times for a level
router.get('/:id/leaderboard', readLimiter, async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT u.display_name,
              (ls.checkpoint_state->>'elapsed_ms')::int AS elapsed_ms
       FROM level_saves ls
       JOIN users u ON u.id = ls.user_id
       WHERE ls.level_id = $1
         AND ls.checkpoint_state->>'completed' = 'true'
         AND ls.checkpoint_state->>'elapsed_ms' IS NOT NULL
       ORDER BY elapsed_ms ASC
       LIMIT 10`, [req.params.id]);
        res.json(result.rows);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
