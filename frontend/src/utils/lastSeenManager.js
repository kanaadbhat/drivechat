import axios from 'axios';
import { getMeta, setMeta } from '../db/dexie';

const STORAGE_PREFIX = 'drivechat_last_seen_';
const storageKeyFor = (userId) => `${STORAGE_PREFIX}${userId}`;

export async function setPersistedLastSeenId(userId, streamId) {
  if (!userId || !streamId) return null;
  try {
    await setMeta(userId, 'realtime:lastSeenId', streamId);
  } catch (err) {
    console.warn('[lastSeenManager] failed to set meta', err?.message);
  }

  try {
    localStorage.setItem(storageKeyFor(userId), streamId);
  } catch (err) {
    console.warn('[lastSeenManager] failed to persist to localStorage', err?.message);
  }

  return streamId;
}

export async function getPersistedLastSeenId(userId) {
  if (!userId) return null;
  try {
    const metaValue = await getMeta(userId, 'realtime:lastSeenId');
    if (metaValue) return metaValue;
  } catch (err) {
    console.warn('[lastSeenManager] failed to read meta', err?.message);
  }

  try {
    const stored = localStorage.getItem(storageKeyFor(userId));
    if (stored) return stored;
  } catch (err) {
    console.warn('[lastSeenManager] failed to read localStorage', err?.message);
  }

  return null;
}

export function clearPersistedLastSeenId(userId) {
  if (!userId) return;
  try {
    localStorage.removeItem(storageKeyFor(userId));
  } catch (err) {
    console.warn('[lastSeenManager] failed to clear localStorage', err?.message);
  }
}

export async function ensurePersistedLastSeenId({ userId, apiUrl, getToken }) {
  const existing = await getPersistedLastSeenId(userId);
  if (existing) return existing;
  if (!userId || !apiUrl || !getToken) return null;

  try {
    const token = await getToken();
    if (!token) return null;

    const response = await axios.get(`${apiUrl}/api/messages`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 1 },
    });

    const lastSeen = response.data?.lastSeenId || null;
    if (lastSeen) {
      await setPersistedLastSeenId(userId, lastSeen);
      return lastSeen;
    }
  } catch (err) {
    console.warn('[lastSeenManager] fallback fetch failed', err?.message);
  }

  return null;
}
