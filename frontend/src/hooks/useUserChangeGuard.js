import { useEffect } from 'react';
import { resetDb } from '../db/dexie';
import { clearCurrentDevice } from '../utils/deviceManager';

const LAST_USER_KEY = 'drivechat_last_user_id';

// Clears local caches if the signed-in user changes.
export function useUserChangeGuard(userId) {
  useEffect(() => {
    const run = async () => {
      if (!userId) return;
      const lastUser = localStorage.getItem(LAST_USER_KEY);
      if (lastUser && lastUser !== userId) {
        try {
          await resetDb();
        } catch (err) {
          console.warn('[useUserChangeGuard] Failed to reset Dexie on user change', err?.message);
        }

        try {
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('drivechat_')) localStorage.removeItem(key);
          }
        } catch (err) {
          console.warn(
            '[useUserChangeGuard] Failed to clear drivechat localStorage on user change',
            err?.message
          );
        }

        try {
          sessionStorage.clear();
        } catch (err) {
          console.warn(
            '[useUserChangeGuard] Failed to clear sessionStorage on user change',
            err?.message
          );
        }

        try {
          clearCurrentDevice();
        } catch (err) {
          console.warn('[useUserChangeGuard] Failed to clear device on user change', err?.message);
        }
      }

      try {
        localStorage.setItem(LAST_USER_KEY, userId);
      } catch (err) {
        console.warn('[useUserChangeGuard] Failed to record last user id', err?.message);
      }
    };

    run();
  }, [userId]);
}
