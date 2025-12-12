import redis from '../config/redis.js';

function lastSeenKey(userId, deviceId) {
  return `device:${userId}:${deviceId}:lastSeen`;
}

function presenceKey(userId, deviceId) {
  return `presence:${userId}:${deviceId}`;
}

export async function getDeviceLastSeenId(userId, deviceId) {
  if (!userId || !deviceId) return null;
  const value = await redis.get(lastSeenKey(userId, deviceId));
  return value || null;
}

export async function setDeviceLastSeenId(userId, deviceId, streamId) {
  if (!userId || !deviceId || !streamId) return;
  await redis.set(lastSeenKey(userId, deviceId), String(streamId));
}

export async function touchPresence(userId, deviceId, ttlSeconds = 60) {
  if (!userId || !deviceId) return;
  await redis.set(presenceKey(userId, deviceId), 'online', 'EX', ttlSeconds);
}

export async function clearPresence(userId, deviceId) {
  if (!userId || !deviceId) return;
  await redis.del(presenceKey(userId, deviceId));
}
