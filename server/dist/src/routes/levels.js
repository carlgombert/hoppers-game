"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db/db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// GET /levels — list published levels (paginated)
router.get('/', async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;
    try {
        const result = await db_1.db.query(`SELECT l.id, l.title, l.description, l.thumbnail, l.created_at,
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
        const result = await db_1.db.query(`SELECT id, title, description, tile_data, published, thumbnail, created_at, updated_at
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
    const { title, description, tile_data } = req.body;
    if (!title) {
        res.status(400).json({ error: 'title is required' });
        return;
    }
    try {
        const result = await db_1.db.query(`INSERT INTO levels (owner_id, title, description, tile_data)
       VALUES ($1, $2, $3, $4)
       RETURNING *`, [req.userId, title, description ?? null, JSON.stringify(tile_data ?? [])]);
        res.status(201).json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// PATCH /levels/:id — update level (owner only)
router.patch('/:id', auth_1.requireAuth, async (req, res) => {
    const { title, description, tile_data, published, thumbnail } = req.body;
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
        }
        const result = await db_1.db.query(`UPDATE levels SET
         title       = COALESCE($1, title),
         description = COALESCE($2, description),
         tile_data   = COALESCE($3, tile_data),
         published   = COALESCE($4, published),
         thumbnail   = COALESCE($5, thumbnail)
       WHERE id = $6
       RETURNING *`, [
            title ?? null,
            description ?? null,
            tile_data ? JSON.stringify(tile_data) : null,
            published ?? null,
            thumbnail ?? null,
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
exports.default = router;
