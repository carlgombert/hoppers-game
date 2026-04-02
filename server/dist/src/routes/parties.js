"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = require("../db/db");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateCode() {
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
}
// POST /parties — create a party, returns 6-char code
router.post('/', auth_1.requireAuth, async (req, res) => {
    const { level_id } = req.body;
    if (!level_id) {
        res.status(400).json({ error: 'level_id is required' });
        return;
    }
    try {
        // Generate collision-resistant code with up to 10 retries
        let code = generateCode();
        for (let attempt = 0; attempt < 10; attempt++) {
            const exists = await db_1.db.query(`SELECT id FROM parties WHERE code = $1 AND state != 'done'`, [code]);
            if (!exists.rows[0])
                break;
            code = generateCode();
        }
        const partyResult = await db_1.db.query(`INSERT INTO parties (code, host_id, level_id) VALUES ($1, $2, $3) RETURNING *`, [code, req.userId, level_id]);
        const party = partyResult.rows[0];
        // Add host as first member
        await db_1.db.query(`INSERT INTO party_members (party_id, user_id) VALUES ($1, $2)`, [party.id, req.userId]);
        res.status(201).json(party);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// POST /parties/join — join by code
router.post('/join', auth_1.requireAuth, async (req, res) => {
    const { code } = req.body;
    if (!code) {
        res.status(400).json({ error: 'code is required' });
        return;
    }
    // Use a serializable transaction to prevent race conditions on simultaneous joins
    const client = await db_1.db.connect();
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        const partyResult = await client.query(`SELECT p.*, COUNT(pm.user_id)::int AS member_count
       FROM parties p
       LEFT JOIN party_members pm ON pm.party_id = p.id
       WHERE p.code = $1
       GROUP BY p.id
       FOR UPDATE OF p`, [code.toUpperCase()]);
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
        // Reject if already a member (reconnect after page refresh, etc.)
        const alreadyMember = await client.query(`SELECT 1 FROM party_members WHERE party_id = $1 AND user_id = $2`, [party.id, req.userId]);
        if (alreadyMember.rows[0]) {
            // Idempotent — return the party without error so client can reconnect
            await client.query('COMMIT');
            res.json(party);
            return;
        }
        // Reject if party is already full (2 members)
        if (party.member_count >= 2) {
            await client.query('ROLLBACK');
            res.status(409).json({ error: 'Party is full' });
            return;
        }
        await client.query(`INSERT INTO party_members (party_id, user_id) VALUES ($1, $2)`, [party.id, req.userId]);
        await client.query('COMMIT');
        res.json(party);
    }
    catch (err) {
        await client.query('ROLLBACK').catch(() => { });
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
    finally {
        client.release();
    }
});
exports.default = router;
