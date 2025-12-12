import { Server as SocketIOServer } from 'socket.io';
import clerk from '../config/clerk.js';
import logger from '../utils/logger.js';
import {
  clearPresence,
  getDeviceLastSeenId,
  setDeviceLastSeenId,
  touchPresence,
} from './deviceStore.js';
import { xaddUserEvent, xreadUserEvents } from './streams.js';

let io = null;

function isEnabled() {
  return String(process.env.ENABLE_REALTIME || '').toLowerCase() === 'true';
}

function roomForUser(userId) {
  return `user:${userId}`;
}

function pickMaxStreamId(a, b) {
  // Stream IDs are comparable lexicographically for our purposes in the same redis instance.
  if (!a) return b || null;
  if (!b) return a || null;
  return a > b ? a : b;
}

async function replayBacklogToSocket({ userId, socket, fromId }) {
  // Read in batches until empty
  let cursor = fromId || '0-0';
  while (true) {
    const events = await xreadUserEvents(userId, cursor, 200);
    if (!events.length) break;
    for (const ev of events) {
      console.info('[realtime] replay event', { userId, streamId: ev.streamId, type: ev.type });
      socket.emit('realtime:event', ev);
      cursor = ev.streamId;
    }
    if (events.length < 200) break;
  }
}

export function initRealtime(httpServer) {
  if (!isEnabled()) {
    logger.info('[realtime] ENABLE_REALTIME is false; skipping Socket.IO init');
    return null;
  }

  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const deviceId = socket.handshake.auth?.deviceId;
      if (!token) return next(new Error('Missing auth token'));
      if (!deviceId) return next(new Error('Missing deviceId'));

      const payload = await clerk.verifyToken(token, { clockSkewInMs: 10000 });
      if (!payload?.sub) return next(new Error('Invalid token'));

      socket.data.userId = payload.sub;
      socket.data.deviceId = deviceId;
      return next();
    } catch {
      return next(new Error('Authentication failed'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.data.userId;
    const deviceId = socket.data.deviceId;
    const clientLastSeen = socket.handshake.auth?.lastSeenId || null;

    socket.join(roomForUser(userId));
    logger.info(`[realtime] socket connected`, { userId, deviceId, sid: socket.id });
    console.debug('[realtime] handshake details', { userId, deviceId, clientLastSeen });

    try {
      await touchPresence(userId, deviceId);
      const storedLastSeen = await getDeviceLastSeenId(userId, deviceId);
      const startId = pickMaxStreamId(storedLastSeen, clientLastSeen);
      console.debug('[realtime] replay range', { storedLastSeen, clientLastSeen, startId });
      await replayBacklogToSocket({ userId, socket, fromId: startId });
    } catch (e) {
      logger.warn('[realtime] replay failed', e?.message);
    }

    socket.on('ack', async (payload) => {
      try {
        const streamId = payload?.streamId;
        if (!streamId) return;
        await setDeviceLastSeenId(userId, deviceId, streamId);
        await touchPresence(userId, deviceId);
        console.debug('[realtime] ack persisted', { userId, deviceId, streamId });
      } catch (e) {
        logger.warn('[realtime] ack failed', e?.message);
      }
    });

    socket.on('disconnect', async () => {
      try {
        await clearPresence(userId, deviceId);
      } catch {
        // ignore
      }
      logger.info(`[realtime] socket disconnected`, { userId, deviceId, sid: socket.id });
    });
  });

  logger.success('[realtime] Socket.IO initialized');
  return io;
}

export async function publishUserEvent(userId, event) {
  if (!isEnabled()) return { published: false };

  const now = Date.now();
  const base = {
    type: event?.type || 'unknown',
    ts: event?.ts || String(now),
    messageId: event?.messageId,
    firestorePath: event?.firestorePath,
    conversationId: event?.conversationId,
    senderId: event?.senderId,
  };

  if (event?.message) base.message = JSON.stringify(event.message);
  if (event?.patch) base.patch = JSON.stringify(event.patch);

  const { streamId } = await xaddUserEvent(userId, base);
  const payload = { streamId, ...base };

  console.info('[realtime] publishUserEvent', { userId, payload, hasIo: Boolean(io) });

  if (io) {
    try {
      io.to(roomForUser(userId)).emit('realtime:event', payload);
      console.debug('[realtime] emitted event to Socket.IO room', {
        userId,
        streamId: payload.streamId,
        type: payload.type,
      });
    } catch (emitErr) {
      console.warn('[realtime] emit failed', emitErr?.message);
    }
  }

  return { published: true, streamId };
}
