import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server as IOServer } from 'socket.io';
import { connectRedis } from './redis/redis';

import authRouter from './routes/auth';
import levelsRouter from './routes/levels';
import partiesRouter from './routes/parties';
import savesRouter from './routes/saves';

const PORT = process.env.PORT ?? 3001;

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

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    // Join a party room
    socket.on('party:join', async ({ code }: { code: string }) => {
      socket.join(code);
      const room = io.sockets.adapter.rooms.get(code);
      const count = room?.size ?? 0;
      console.log(`${socket.id} joined room ${code} (${count} members)`);

      if (count >= 2) {
        // Notify all members in the room that game can start
        const playerIds = Array.from(room!).map((id) => ({ socketId: id }));
        io.to(code).emit('party:ready', { players: playerIds });
      }
    });

    // Broadcast player position to others in the same room
    socket.on(
      'player:move',
      (payload: { code: string; x: number; y: number; state: string }) => {
        socket.to(payload.code).emit('player:update', {
          id: socket.id,
          x: payload.x,
          y: payload.y,
          state: payload.state,
        });
      }
    );

    socket.on(
      'player:checkpoint',
      (payload: { code: string; checkpointId: string }) => {
        socket.to(payload.code).emit('player:checkpoint', {
          id: socket.id,
          checkpointId: payload.checkpointId,
        });
      }
    );

    socket.on(
      'player:finish',
      (payload: { code: string; time: number }) => {
        io.to(payload.code).emit('party:finished', {
          id: socket.id,
          time: payload.time,
        });
      }
    );

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
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
