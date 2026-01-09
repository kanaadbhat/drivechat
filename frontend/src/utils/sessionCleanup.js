import { clearAllUserData, deleteDb, db } from '../db/dexie';
import { clearCachedMek, clearCachedSalt } from './crypto';
import { revokeToken, clearStoredToken } from './gisClient';
import {
  getPersistedLastSeenId,
  setPersistedLastSeenId,
  clearPersistedLastSeenId,
} from './lastSeenManager';

const CLEANUP_KEY_PREFIX = 'drivechat_';

function clearDrivechatLocalStorage() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CLEANUP_KEY_PREFIX)) {
        if (key === 'drivechat_device') continue;
        localStorage.removeItem(key);
      }
    }
  } catch (err) {
    console.warn('[sessionCleanup] clearing drivechat localStorage failed', err?.message);
  }
}

function clearSessionStorageSilently() {
  try {
    sessionStorage.clear();
  } catch (err) {
    console.warn('[sessionCleanup] clearing sessionStorage failed', err?.message);
  }
}

export async function cleanupUserSession(userId, options = {}) {
  const { preserveLastSeen = true } = options;
  let preservedLastSeen = null;
  if (userId && preserveLastSeen) {
    preservedLastSeen = await getPersistedLastSeenId(userId);
  }

  if (userId) {
    try {
      await clearAllUserData(userId);
    } catch (err) {
      console.warn('[sessionCleanup] clearing Dexie data failed', err?.message);
    }
  }

  try {
    clearCachedMek(userId);
  } catch (err) {
    console.warn('[sessionCleanup] clearing cached MEK failed', err?.message);
  }

  try {
    clearCachedSalt(userId);
  } catch (err) {
    console.warn('[sessionCleanup] clearing cached salt failed', err?.message);
  }

  try {
    revokeToken();
    clearStoredToken();
  } catch (err) {
    console.warn('[sessionCleanup] clearing GIS token state failed', err?.message);
  }

  clearDrivechatLocalStorage();
  clearSessionStorageSilently();

  try {
    await deleteDb();
  } catch (err) {
    console.warn('[sessionCleanup] deleting Dexie database failed', err?.message);
  }

  if (userId && preserveLastSeen && preservedLastSeen) {
    try {
      await db.open();
      await setPersistedLastSeenId(userId, preservedLastSeen);
    } catch (err) {
      console.warn('[sessionCleanup] restoring lastSeenId failed', err?.message);
    }
  }

  if (userId && !preserveLastSeen) {
    clearPersistedLastSeenId(userId);
  }
}
