"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const db_1 = require("./db/db");
const redis_1 = require("./redis/redis");
const auth_1 = __importDefault(require("./routes/auth"));
const levels_1 = __importDefault(require("./routes/levels"));
const parties_1 = __importDefault(require("./routes/parties"));
const saves_1 = __importDefault(require("./routes/saves"));
const PORT = process.env.PORT ?? 3001;
const JWT_SECRET = process.env.JWT_SECRET ?? 'hoppers_dev_secret';
function closeHttpServer(server) {
    return new Promise((resolve, reject) => {
        server.close((err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
}
/** Track per-room finish state: roomCode → Set of socket IDs that finished */
const roomFinished = new Map();
/** Active countdown timers: roomCode → timeout handle */
const roomCountdowns = new Map();
/** Stalled-ready-check timers: roomCode → timeout handle */
const roomReadyTimeouts = new Map();
/** How long (ms) to wait before auto-cancelling a stalled ready-check */
const READY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
/** Verify JWT and return userId or null */
function verifyToken(token) {
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return payload.userId ?? null;
    }
    catch {
        return null;
    }
}
/**
 * Fetch all party members from DB and broadcast party:state_update to the room.
 * `isConnected` is derived by checking whether the member's socket_id is still
 * present in the Socket.io room adapter.
 */
async function broadcastPartyState(io, code, partyId, hostId) {
    const membersResult = await db_1.db.query(`SELECT pm.user_id, pm.is_ready, pm.socket_id, u.display_name
     FROM party_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.party_id = $1`, [partyId]);
    const room = io.sockets.adapter.rooms.get(code);
    const members = membersResult.rows.map((m) => ({
        userId: m.user_id,
        displayName: m.display_name,
        isReady: m.is_ready,
        isConnected: m.socket_id ? (room?.has(m.socket_id) ?? false) : false,
    }));
    io.to(code).emit('party:state_update', { members, hostId });
}
/**
 * Cancel an active countdown for a room and notify all clients.
 * Idempotent — safe to call even if no countdown is running.
 */
function cancelCountdown(io, code) {
    const t = roomCountdowns.get(code);
    if (t !== undefined) {
        clearTimeout(t);
        roomCountdowns.delete(code);
        io.to(code).emit('party:countdown_cancelled', {});
    }
}
/**
 * Recursively schedule countdown ticks (count → 1) and then emit party:launch.
 * Any in-progress countdown can be cancelled via cancelCountdown().
 */
function scheduleCountdown(io, code, partyId, count) {
    if (count === 0) {
        roomCountdowns.delete(code);
        // Cancel any stalled-ready-check timeout
        const rt = roomReadyTimeouts.get(code);
        if (rt !== undefined) {
            clearTimeout(rt);
            roomReadyTimeouts.delete(code);
        }
        // Emit launch to all room members
        const room = io.sockets.adapter.rooms.get(code);
        const players = Array.from(room ?? []).map((id) => ({ socketId: id }));
        io.to(code).emit('party:launch', { players });
        // Transition party state to active
        db_1.db.query(`UPDATE parties SET state = 'active' WHERE id = $1 AND state = 'waiting'`, [partyId]).catch((err) => console.error('Failed to mark party active', err));
        return;
    }
    io.to(code).emit('party:countdown', { count });
    const t = setTimeout(() => {
        scheduleCountdown(io, code, partyId, count - 1);
    }, 1000);
    roomCountdowns.set(code, t);
}
async function main() {
    await (0, redis_1.connectRedis)();
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
    app.use(express_1.default.json({ limit: '10mb' })); // 10mb for base64 thumbnails
    // Routes
    app.use('/auth', auth_1.default);
    app.use('/levels', levels_1.default);
    app.use('/parties', parties_1.default);
    app.use('/saves', saves_1.default);
    app.get('/health', (_req, res) => res.json({ ok: true }));
    // HTTP + Socket.io
    const httpServer = http_1.default.createServer(app);
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' },
    });
    // ── Socket auth middleware ───────────────────────────────────────────────
    // Clients must pass { auth: { token: '<JWT>' } } in the socket.io options.
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) {
            return next(new Error('Unauthorized: no token'));
        }
        const userId = verifyToken(token);
        if (!userId) {
            return next(new Error('Unauthorized: invalid token'));
        }
        // Attach userId to socket for later use
        socket.userId = userId;
        next();
    });
    io.on('connection', (socket) => {
        const userId = socket.userId ?? '';
        console.log(`Socket connected: ${socket.id} (user ${userId})`);
        // ── party:join ───────────────────────────────────────────────────────
        socket.on('party:join', async ({ code }) => {
            if (!code || typeof code !== 'string') {
                socket.emit('party:error', { message: 'Invalid party code' });
                return;
            }
            const upperCode = code.toUpperCase();
            // Verify party exists and user is a member
            try {
                const partyResult = await db_1.db.query(`SELECT p.id, p.host_id, p.state FROM parties p
           JOIN party_members pm ON pm.party_id = p.id
           WHERE p.code = $1 AND pm.user_id = $2`, [upperCode, userId]);
                if (!partyResult.rows[0]) {
                    socket.emit('party:error', { message: 'Party not found or you are not a member' });
                    return;
                }
                const party = partyResult.rows[0];
                if (party.state === 'done') {
                    socket.emit('party:error', { message: 'Party has already ended' });
                    return;
                }
                // Record socket_id and reset ready state for this member.
                // Resetting is_ready on join covers reconnect scenarios so that a
                // player cannot preserve an old ready toggle across disconnects.
                await db_1.db.query(`UPDATE party_members
           SET socket_id = $1, is_ready = FALSE
           WHERE party_id = $2 AND user_id = $3`, [socket.id, party.id, userId]);
                // Check if socket is already in this room (reconnect guard)
                if (socket.rooms.has(upperCode)) {
                    // Still broadcast updated state so all clients reconcile
                    await broadcastPartyState(io, upperCode, party.id, party.host_id);
                    return;
                }
                socket.join(upperCode);
                const room = io.sockets.adapter.rooms.get(upperCode);
                const count = room?.size ?? 0;
                console.log(`${socket.id} (user ${userId}) joined room ${upperCode} (${count} members)`);
                // If a countdown was running (e.g. member rejoined mid-countdown), cancel it.
                if (roomCountdowns.has(upperCode)) {
                    cancelCountdown(io, upperCode);
                }
                // Broadcast updated member list with ready statuses to the whole room.
                await broadcastPartyState(io, upperCode, party.id, party.host_id);
                // Once all DB members are in the socket room, start the stalled-ready-check
                // timeout so the lobby doesn't hang forever if the host never launches.
                const dbMembersResult = await db_1.db.query(`SELECT COUNT(*) AS cnt FROM party_members WHERE party_id = $1`, [party.id]);
                const expectedCount = Number(dbMembersResult.rows[0]?.cnt ?? 0);
                if (count >= expectedCount && expectedCount >= 2) {
                    if (!roomReadyTimeouts.has(upperCode)) {
                        const rt = setTimeout(async () => {
                            roomReadyTimeouts.delete(upperCode);
                            try {
                                await db_1.db.query(`UPDATE party_members SET is_ready = FALSE WHERE party_id = $1`, [party.id]);
                                await broadcastPartyState(io, upperCode, party.id, party.host_id);
                                io.to(upperCode).emit('party:timeout', {
                                    message: 'Ready-check timed out. Please toggle ready again.',
                                });
                            }
                            catch (err) {
                                console.error('Ready-check timeout error', err);
                            }
                        }, READY_TIMEOUT_MS);
                        roomReadyTimeouts.set(upperCode, rt);
                    }
                }
            }
            catch (err) {
                console.error('party:join error', err);
                socket.emit('party:error', { message: 'Server error joining party' });
            }
        });
        // ── party:ready_toggle ───────────────────────────────────────────────
        // Any party member may call this to toggle their own ready state.
        socket.on('party:ready_toggle', async ({ code }) => {
            if (!code || typeof code !== 'string')
                return;
            const upperCode = code.toUpperCase();
            try {
                const partyResult = await db_1.db.query(`SELECT p.id, p.host_id, p.state
           FROM parties p
           JOIN party_members pm ON pm.party_id = p.id
           WHERE p.code = $1 AND pm.user_id = $2`, [upperCode, userId]);
                if (!partyResult.rows[0])
                    return;
                const party = partyResult.rows[0];
                if (party.state !== 'waiting')
                    return;
                // Ignore toggle if a countdown is already running
                if (roomCountdowns.has(upperCode))
                    return;
                await db_1.db.query(`UPDATE party_members
           SET is_ready = NOT is_ready
           WHERE party_id = $1 AND user_id = $2`, [party.id, userId]);
                await broadcastPartyState(io, upperCode, party.id, party.host_id);
            }
            catch (err) {
                console.error('party:ready_toggle error', err);
            }
        });
        // ── party:start ──────────────────────────────────────────────────────
        // Host-only. Validates all connected members are ready, then starts the
        // synchronized 3-second countdown before emitting party:launch to all.
        socket.on('party:start', async ({ code }) => {
            if (!code || typeof code !== 'string')
                return;
            const upperCode = code.toUpperCase();
            try {
                const partyResult = await db_1.db.query(`SELECT p.id, p.host_id, p.state FROM parties p WHERE p.code = $1`, [upperCode]);
                if (!partyResult.rows[0])
                    return;
                const party = partyResult.rows[0];
                // Only the host may trigger the launch
                if (party.host_id !== userId) {
                    socket.emit('party:error', { message: 'Only the host can start the game' });
                    return;
                }
                if (party.state !== 'waiting')
                    return;
                // Require at least two sockets in the room
                const room = io.sockets.adapter.rooms.get(upperCode);
                if (!room || room.size < 2) {
                    socket.emit('party:error', { message: 'Waiting for all players to connect' });
                    return;
                }
                // Verify all party members are ready
                const membersResult = await db_1.db.query(`SELECT pm.is_ready
           FROM party_members pm
           WHERE pm.party_id = $1`, [party.id]);
                const allReady = membersResult.rows.length > 0 &&
                    membersResult.rows.every((m) => m.is_ready);
                if (!allReady) {
                    socket.emit('party:error', { message: 'Not all players are ready' });
                    return;
                }
                // Ignore if a countdown is already in progress
                if (roomCountdowns.has(upperCode))
                    return;
                // Start the 3-second countdown
                scheduleCountdown(io, upperCode, party.id, 3);
            }
            catch (err) {
                console.error('party:start error', err);
                socket.emit('party:error', { message: 'Server error starting game' });
            }
        });
        // ── player:move ──────────────────────────────────────────────────────
        // Server stamps the userId from the verified JWT; client cannot spoof it.
        socket.on('player:move', (payload) => {
            if (!payload.code)
                return;
            socket.to(payload.code).emit('player:update', {
                id: socket.id,
                userId,
                x: payload.x,
                y: payload.y,
                state: payload.state,
            });
        });
        // ── player:checkpoint ────────────────────────────────────────────────
        // Checkpoint events are private — they do NOT affect the other player.
        socket.on('player:checkpoint', (payload) => {
            // Intentionally not forwarded — each player manages their own checkpoints.
            void payload; // suppress unused warning
        });
        // ── player:finish ────────────────────────────────────────────────────
        socket.on('player:finish', async (payload) => {
            if (!payload.code)
                return;
            const code = payload.code;
            // Deduplicate: ignore if this socket already finished in this room
            if (!roomFinished.has(code)) {
                roomFinished.set(code, new Set());
            }
            const finishedSet = roomFinished.get(code);
            if (finishedSet.has(socket.id))
                return;
            finishedSet.add(socket.id);
            // Emit party:finished to all players in the room with server-stamped userId
            io.to(code).emit('party:finished', {
                id: socket.id,
                userId,
                time: payload.time,
            });
            // If all room members have finished, transition party to done
            const room = io.sockets.adapter.rooms.get(code);
            const roomSize = room?.size ?? 0;
            if (finishedSet.size >= roomSize && roomSize > 0) {
                roomFinished.delete(code);
                try {
                    await db_1.db.query(`UPDATE parties SET state = 'done' WHERE code = $1`, [code]);
                }
                catch (err) {
                    console.error('Failed to mark party done', err);
                }
            }
        });
        // ── disconnecting ────────────────────────────────────────────────────
        socket.on('disconnecting', async () => {
            for (const room of socket.rooms) {
                if (room === socket.id)
                    continue; // skip the socket's own room
                // Notify others in the room
                socket.to(room).emit('player:left', { id: socket.id, userId });
                // Cancel any active countdown so the remaining player isn't launched
                // into a game without their opponent.
                if (roomCountdowns.has(room)) {
                    cancelCountdown(io, room);
                }
                // Clear the stalled-ready-check timeout for this room
                const rt = roomReadyTimeouts.get(room);
                if (rt !== undefined) {
                    clearTimeout(rt);
                    roomReadyTimeouts.delete(room);
                }
                // Clear the disconnecting member's socket_id and reset their ready flag.
                // Resetting is_ready ensures that after a reconnect the ready-check
                // starts fresh for that member.
                try {
                    await db_1.db.query(`UPDATE party_members
             SET socket_id = NULL, is_ready = FALSE
             WHERE socket_id = $1`, [socket.id]);
                    // Broadcast updated state to the remaining connected members
                    const partyResult = await db_1.db.query(`SELECT p.id, p.host_id, p.state FROM parties p WHERE p.code = $1`, [room]);
                    if (partyResult.rows[0]) {
                        const party = partyResult.rows[0];
                        if (party.state === 'waiting') {
                            await broadcastPartyState(io, room, party.id, party.host_id);
                        }
                    }
                }
                catch (err) {
                    console.error('Error updating member state on disconnect', err);
                }
                // If room will be empty after this socket leaves, mark party done
                const roomObj = io.sockets.adapter.rooms.get(room);
                const remaining = roomObj ? roomObj.size - 1 : 0;
                if (remaining <= 0) {
                    roomFinished.delete(room);
                    try {
                        await db_1.db.query(`UPDATE parties SET state = 'done'
               WHERE code = $1 AND state != 'done'`, [room]);
                    }
                    catch (err) {
                        console.error('Failed to mark party done on disconnect', err);
                    }
                }
            }
        });
    });
    httpServer.listen(PORT, () => {
        console.log(`Hoppers server running on http://localhost:${PORT}`);
    });
    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        console.log(`${signal} received, shutting down...`);
        try {
            io.close();
            await closeHttpServer(httpServer);
            await db_1.db.end();
            await (0, redis_1.disconnectRedis)();
            process.exit(0);
        }
        catch (err) {
            console.error('Shutdown failed:', err);
            process.exit(1);
        }
    };
    process.on('SIGINT', () => {
        void shutdown('SIGINT');
    });
    process.on('SIGTERM', () => {
        void shutdown('SIGTERM');
    });
}
main().catch((err) => {
    console.error('Failed to start server:', err);
    process.exit(1);
});
