import { io } from 'socket.io-client';
import { ensurePersistedLastSeenId, setPersistedLastSeenId } from './lastSeenManager';

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
  const lastSeenId = await ensurePersistedLastSeenId({ userId, apiUrl, getToken });

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

  socket.on('realtime:event', async (ev) => {
    const event = {
      ...ev,
      message: safeJsonParse(ev?.message),
      patch: safeJsonParse(ev?.patch),
    };

    try {
      await onEvent?.(event);
    } finally {
      if (event?.streamId) {
        try {
          socket.emit('ack', { streamId: event.streamId });
          await setPersistedLastSeenId(userId, event.streamId);
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
