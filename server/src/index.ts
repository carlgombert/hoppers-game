import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as IOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { db } from './db/db';
import { connectRedis, disconnectRedis } from './redis/redis';

import authRouter from './routes/auth';
import levelsRouter from './routes/levels';
import partiesRouter from './routes/parties';
import savesRouter from './routes/saves';

const PORT = process.env.PORT ?? 3001;
const JWT_SECRET = process.env.JWT_SECRET ?? 'hoppers_dev_secret';

function closeHttpServer(server: http.Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

/** Track per-room finish state: roomCode → Set of socket IDs that finished */
const roomFinished = new Map<string, Set<string>>();

/** Verify JWT and return userId or null */
function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    return payload.userId ?? null;
  } catch {
    return null;
  }
}

async function main() {
  await connectRedis();

  const app = express();

  app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' }));
  app.use(express.json({ limit: '10mb' })); // 10mb for base64 thumbnails

  // Routes
  app.use('/auth', authRouter);
  app.use('/levels', levelsRouter);
  app.use('/parties', partiesRouter);
  app.use('/saves', savesRouter);

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // HTTP + Socket.io
  const httpServer = http.createServer(app);
  const io = new IOServer(httpServer, {
    cors: { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173' },
  });

  // ── Socket auth middleware ───────────────────────────────────────────────
  // Clients must pass { auth: { token: '<JWT>' } } in the socket.io options.
  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      return next(new Error('Unauthorized: no token'));
    }
    const userId = verifyToken(token);
    if (!userId) {
      return next(new Error('Unauthorized: invalid token'));
    }
    // Attach userId to socket for later use
    (socket as Socket & { userId: string }).userId = userId;
    next();
  });

  io.on('connection', (socket: Socket & { userId?: string }) => {
    const userId = socket.userId ?? '';
    console.log(`Socket connected: ${socket.id} (user ${userId})`);

    // ── party:join ───────────────────────────────────────────────────────
    socket.on('party:join', async ({ code }: { code: string }) => {
      if (!code || typeof code !== 'string') {
        socket.emit('party:error', { message: 'Invalid party code' });
        return;
      }
      const upperCode = code.toUpperCase();

      // Verify party exists and user is a member
      try {
        const partyResult = await db.query(
          `SELECT p.id, p.state FROM parties p
           JOIN party_members pm ON pm.party_id = p.id
           WHERE p.code = $1 AND pm.user_id = $2`,
          [upperCode, userId]
        );
        if (!partyResult.rows[0]) {
          socket.emit('party:error', { message: 'Party not found or you are not a member' });
          return;
        }
        const party = partyResult.rows[0];
        if (party.state === 'done') {
          socket.emit('party:error', { message: 'Party has already ended' });
          return;
        }

        // Record socket_id for this member (handles reconnect: updates existing row)
        await db.query(
          `UPDATE party_members SET socket_id = $1 WHERE party_id = $2 AND user_id = $3`,
          [socket.id, party.id, userId]
        );

        // Check if socket is already in this room (reconnect guard)
        if (socket.rooms.has(upperCode)) {
          return;
        }

        socket.join(upperCode);

        const room = io.sockets.adapter.rooms.get(upperCode);
        const count = room?.size ?? 0;
        console.log(`${socket.id} (user ${userId}) joined room ${upperCode} (${count} members)`);

        // party:ready fires only when exactly 2 sockets are in the room
        if (count >= 2) {
          const playerIds = Array.from(room!).map((id) => ({ socketId: id }));
          io.to(upperCode).emit('party:ready', { players: playerIds });

          // Transition party to active state
          await db.query(
            `UPDATE parties SET state = 'active' WHERE code = $1 AND state = 'waiting'`,
            [upperCode]
          );
        }
      } catch (err) {
        console.error('party:join error', err);
        socket.emit('party:error', { message: 'Server error joining party' });
      }
    });

    // ── player:move ──────────────────────────────────────────────────────
    // Server stamps the userId from the verified JWT; client cannot spoof it.
    socket.on(
      'player:move',
      (payload: { code: string; x: number; y: number; state: string }) => {
        if (!payload.code) return;
        socket.to(payload.code).emit('player:update', {
          id: socket.id,
          userId,
          x: payload.x,
          y: payload.y,
          state: payload.state,
        });
      }
    );

    // ── player:checkpoint ────────────────────────────────────────────────
    // Checkpoint events are private — they do NOT affect the other player.
    socket.on(
      'player:checkpoint',
      (payload: { code: string; checkpointId: string }) => {
        // Intentionally not forwarded — each player manages their own checkpoints.
        void payload; // suppress unused warning
      }
    );

    // ── player:finish ────────────────────────────────────────────────────
    socket.on(
      'player:finish',
      async (payload: { code: string; time: number }) => {
        if (!payload.code) return;
        const code = payload.code;

        // Deduplicate: ignore if this socket already finished in this room
        if (!roomFinished.has(code)) {
          roomFinished.set(code, new Set());
        }
        const finishedSet = roomFinished.get(code)!;
        if (finishedSet.has(socket.id)) return;
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
            await db.query(
              `UPDATE parties SET state = 'done' WHERE code = $1`,
              [code]
            );
          } catch (err) {
            console.error('Failed to mark party done', err);
          }
        }
      }
    );

    // ── disconnecting ────────────────────────────────────────────────────
    socket.on('disconnecting', async () => {
      for (const room of socket.rooms) {
        if (room === socket.id) continue; // skip the socket's own room

        // Notify others in the room
        socket.to(room).emit('player:left', { id: socket.id, userId });

        // If room will be empty after this socket leaves, mark party done
        const roomObj = io.sockets.adapter.rooms.get(room);
        const remaining = roomObj ? roomObj.size - 1 : 0;
        if (remaining <= 0) {
          roomFinished.delete(room);
          try {
            await db.query(
              `UPDATE parties SET state = 'done'
               WHERE code = $1 AND state != 'done'`,
              [room]
            );
          } catch (err) {
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
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received, shutting down...`);

    try {
      io.close();
      await closeHttpServer(httpServer);
      await db.end();
      await disconnectRedis();
      process.exit(0);
    } catch (err) {
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

