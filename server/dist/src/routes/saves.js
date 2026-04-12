"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db/db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
// POST /saves — upsert checkpoint progress
router.post('/', auth_1.requireAuth, async (req, res) => {
    const { level_id, checkpoint_state } = req.body;
    if (!level_id || !checkpoint_state) {
        res.status(400).json({ error: 'level_id and checkpoint_state are required' });
        return;
    }
    try {
        const result = await db_1.db.query(`INSERT INTO level_saves (user_id, level_id, checkpoint_state, saved_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, level_id) DO UPDATE
         SET checkpoint_state = EXCLUDED.checkpoint_state,
             saved_at         = NOW()
       RETURNING *`, [req.userId, level_id, JSON.stringify(checkpoint_state)]);
        res.json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// GET /saves/:levelId — retrieve save for a specific level
router.get('/:levelId', auth_1.requireAuth, async (req, res) => {
    try {
        const result = await db_1.db.query(`SELECT * FROM level_saves WHERE user_id = $1 AND level_id = $2`, [req.userId, req.params.levelId]);
        if (!result.rows[0]) {
            res.status(404).json({ error: 'No save found' });
            return;
        }
        res.json(result.rows[0]);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
