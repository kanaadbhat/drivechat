import { io } from 'socket.io-client';
import { getMeta, setMeta } from '../db/dexie';

function safeJsonParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export async function createRealtimeClient({
  apiUrl,
  getToken,
  userId,
  deviceId,
  onEvent,
  onStatus,
}) {
  const lastSeenId = await getMeta(userId, 'realtime:lastSeenId');
  console.info('[realtimeClient] lastSeenId loaded', { userId, lastSeenId });

  const token = await getToken();
  if (!token) throw new Error('Missing auth token');
  if (!deviceId) throw new Error('Missing deviceId');

  const socket = io(apiUrl, {
    transports: ['websocket'],
    auth: {
      token,
      deviceId,
      lastSeenId,
    },
  });

  socket.on('connect', () => {
    console.info('[realtimeClient] socket connected', { userId, deviceId, id: socket.id });
    onStatus?.({ connected: true });
  });

  socket.on('disconnect', (reason) => {
    console.warn('[realtimeClient] socket disconnected', { reason });
    onStatus?.({ connected: false });
  });

  socket.on('connect_error', (err) => {
    console.warn('[realtimeClient] connect_error', err?.message);
    onStatus?.({ connected: false, error: err?.message });
  });

  socket.on('reconnect_attempt', (n) => console.info('[realtimeClient] reconnect attempt', n));

  socket.on('realtime:event', async (ev) => {
    const event = {
      ...ev,
      message: safeJsonParse(ev?.message),
      patch: safeJsonParse(ev?.patch),
    };

    console.info('[realtimeClient] received event', {
      userId,
      deviceId,
      type: event.type,
      streamId: event.streamId,
    });

    try {
      await onEvent?.(event);
    } finally {
      if (event?.streamId) {
        try {
          socket.emit('ack', { streamId: event.streamId });
          await setMeta(userId, 'realtime:lastSeenId', event.streamId);
          console.info('[realtimeClient] acked and persisted lastSeenId', {
            userId,
            streamId: event.streamId,
          });
        } catch (ackErr) {
          console.warn('[realtimeClient] ack/persist failed', ackErr?.message);
        }
      }
    }
  });

  return {
    socket,
    disconnect: () => socket.disconnect(),
  };
}
