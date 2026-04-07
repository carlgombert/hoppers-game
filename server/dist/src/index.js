"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const db_1 = require("./db/db");
const redis_1 = require("./redis/redis");
const auth_1 = __importDefault(require("./routes/auth"));
const levels_1 = __importDefault(require("./routes/levels"));
const parties_1 = __importDefault(require("./routes/parties"));
const saves_1 = __importDefault(require("./routes/saves"));
const PORT = process.env.PORT ?? 3001;
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
    io.on('connection', (socket) => {
        console.log(`Socket connected: ${socket.id}`);
        // Join a party room
        socket.on('party:join', async ({ code }) => {
            socket.join(code);
            const room = io.sockets.adapter.rooms.get(code);
            const count = room?.size ?? 0;
            console.log(`${socket.id} joined room ${code} (${count} members)`);
            if (count >= 2) {
                // Notify all members in the room that game can start
                const playerIds = Array.from(room).map((id) => ({ socketId: id }));
                io.to(code).emit('party:ready', { players: playerIds });
            }
        });
        // Broadcast player position to others in the same room
        socket.on('player:move', (payload) => {
            socket.to(payload.code).emit('player:update', {
                id: socket.id,
                x: payload.x,
                y: payload.y,
                state: payload.state,
            });
        });
        socket.on('player:checkpoint', (payload) => {
            socket.to(payload.code).emit('player:checkpoint', {
                id: socket.id,
                checkpointId: payload.checkpointId,
            });
        });
        socket.on('player:finish', (payload) => {
            io.to(payload.code).emit('party:finished', {
                id: socket.id,
                time: payload.time,
            });
        });
        socket.on('disconnecting', () => {
            // Notify each room the socket was in
            for (const room of socket.rooms) {
                if (room !== socket.id) {
                    socket.to(room).emit('player:left', { id: socket.id });
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
