import redis from '../config/redis.js';

export const REALTIME_STREAM_MAXLEN = parseInt(process.env.REALTIME_STREAM_MAXLEN || '10000');

export function userStreamKey(userId) {
  return `stream:user:${userId}`;
}

export async function xaddUserEvent(userId, fields) {
  const key = userStreamKey(userId);
  const flat = [];

  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    flat.push(String(k), String(v));
  }

  if (flat.length === 0) {
    throw new Error('xaddUserEvent: no fields');
  }

  // Trim stream approximately to keep memory bounded
  const streamId = await redis.xadd(
    key,
    'MAXLEN',
    '~',
    String(REALTIME_STREAM_MAXLEN),
    '*',
    ...flat
  );

  console.info('[realtime][streams] xaddUserEvent', {
    key,
    streamId,
    fieldsSummary: Object.keys(fields),
  });

  return { streamId, key };
}

export function parseStreamFields(flatArray) {
  const obj = {};
  for (let i = 0; i < flatArray.length; i += 2) {
    obj[flatArray[i]] = flatArray[i + 1];
  }
  return obj;
}

export async function xreadUserEvents(userId, fromId, count = 200) {
  const key = userStreamKey(userId);
  const id = fromId || '0-0';

  console.debug('[realtime][streams] xreadUserEvents', { key, fromId: id, count });

  const result = await redis.xread('COUNT', String(count), 'STREAMS', key, id);
  if (!result || result.length === 0) return [];

  const [, entries] = result[0];
  if (!entries) return [];

  return entries.map(([streamId, fields]) => ({
    streamId,
    ...parseStreamFields(fields),
  }));
}
