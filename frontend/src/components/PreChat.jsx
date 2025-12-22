import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import axios from 'axios';
import { Eye, EyeOff } from 'lucide-react';
import {
  initGisClient,
  hasValidToken,
  getAccessToken,
  deleteFileFromDrive,
} from '../utils/gisClient';
import {
  cacheMek,
  cacheSalt,
  clearCachedMek,
  clearCachedSalt,
  decryptJson,
  deriveMek,
  generateSalt,
  loadCachedMek,
  loadCachedSalt,
} from '../utils/crypto';
import { ensurePersistedLastSeenId, setPersistedLastSeenId } from '../utils/lastSeenManager';
import {
  getMeta,
  setMeta,
  resetDb,
  upsertMessage,
  deleteMessage,
  clearMessages,
} from '../db/dexie';

const API_URL =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const PRECHAT_KEY_BASE = 'drivechat_prechat_passed';
const buildPrechatKey = (userId) => `${PRECHAT_KEY_BASE}_${userId || 'anon'}`;
const DB_OWNER_KEY = 'ownerUserId';

export default function PreChat() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const userId = user?.id;
  const primaryEmailAddress = user?.primaryEmailAddress?.emailAddress;
  const [status, setStatus] = useState('checking'); // checking | deleting | consenting | syncing | success | error
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(null);
  const [encryptionSalt, setEncryptionSalt] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [isFirstSetup, setIsFirstSetup] = useState(false);
  const redirectTo = location.state?.redirect || '/chat';

  const cachedSalt = useMemo(() => loadCachedSalt(user?.id || ''), [user?.id]);
  const cachedMek = useMemo(() => loadCachedMek(user?.id || ''), [user?.id]);

  const ensureDriveAccess = useCallback(async () => {
    setStatus('consenting');
    const loginHint = primaryEmailAddress;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('popup_closed_or_blocked')), 25000)
    );

    await Promise.race([getAccessToken({ prompt: 'consent', login_hint: loginHint }), timeout]);
    window?.focus?.();
  }, [primaryEmailAddress]);

  const syncPendingDeletions = useCallback(
    async (mekBytes) => {
      setStatus('deleting');
      const token = await getToken();
      if (!token) throw new Error('Could not authenticate with the backend. Please retry.');

      const res = await axios.get(`${API_URL}/api/messages/pending-deletions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const pending = res.data?.pending || [];
      setPendingCount(pending.length);
      if (!pending.length) return;

      const acknowledged = [];
      const failed = [];

      for (const item of pending) {
        let fileId = item.fileId;
        if (!fileId && item.fileCiphertext && item.encryption && mekBytes) {
          try {
            const decrypted = await decryptJson(mekBytes, {
              ciphertext: item.fileCiphertext,
              iv: item.encryption.iv,
            });
            fileId = decrypted?.fileId || decrypted?.id || null;
          } catch (cryptoErr) {
            console.warn('[PreChat] Failed to decrypt pending deletion item', cryptoErr?.message);
          }
        }
        if (!fileId) continue;
        try {
          await deleteFileFromDrive(fileId);
          acknowledged.push(item.id || item.messageId || fileId);
        } catch (err) {
          console.warn('[PreChat] Failed to delete Drive file', fileId, err?.message);
          failed.push(fileId);
        }
      }

      if (acknowledged.length) {
        try {
          await axios.post(
            `${API_URL}/api/messages/pending-deletions/ack`,
            { messageIds: acknowledged },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        } catch (err) {
          console.warn('[PreChat] Failed to acknowledge pending deletions', err?.message);
        }
      }

      if (failed.length) {
        setPendingCount(failed.length);
        throw new Error('Some Drive files could not be cleaned up. Please retry.');
      }

      setPendingCount(0);
    },
    [getToken]
  );

  const fetchEncryptionSalt = useCallback(async () => {
    const token = await getToken();
    if (!token) return null;

    const profile = await axios.get(`${API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const serverSalt = profile.data?.user?.encryptionSalt || null;
    if (serverSalt) {
      cacheSalt(user?.id, serverSalt);
      setEncryptionSalt(serverSalt);
    }
    return serverSalt;
  }, [getToken, user?.id]);

  const saveEncryptionSalt = useCallback(
    async (saltB64) => {
      const token = await getToken();
      if (!token) throw new Error('Missing auth token');
      await axios.patch(
        `${API_URL}/api/users/me`,
        {
          encryptionSalt: saltB64,
          encryptionVersion: 'v1',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      cacheSalt(user?.id, saltB64);
      setEncryptionSalt(saltB64);
    },
    [getToken, user?.id]
  );

  const ensureKey = useCallback(async () => {
    const localMek = loadCachedMek(user?.id || '');
    const localSalt = loadCachedSalt(user?.id || '') || cachedSalt;

    if (localMek) {
      return { mek: localMek, salt: localSalt };
    }

    const salt = localSalt || (await fetchEncryptionSalt());
    if (salt) {
      setIsFirstSetup(false);
      setStatus('awaiting-key');
      return null;
    }

    setIsFirstSetup(true);
    setStatus('awaiting-key');
    return null;
  }, [cachedSalt, fetchEncryptionSalt, user?.id]);

  const decryptMessagePayload = useCallback(async (message, mekBytes) => {
    if (!message) return message;
    if (!message.ciphertext && !message.fileCiphertext) return message;
    if (!mekBytes) return { ...message, decryptionError: 'missing-key' };

    try {
      if (message.type === 'file' && message.fileCiphertext) {
        const payload = await decryptJson(mekBytes, {
          ciphertext: message.fileCiphertext,
          iv: message.encryption?.iv,
        });
        return {
          ...message,
          ...payload,
          fileId: payload?.fileId,
          fileName: payload?.fileName,
          fileSize: payload?.fileSize,
          mimeType: payload?.mimeType,
          fileCategory: payload?.fileCategory,
          filePreviewUrl: payload?.filePreviewUrl,
        };
      }

      if (message.ciphertext) {
        const payload = await decryptJson(mekBytes, {
          ciphertext: message.ciphertext,
          iv: message.encryption?.iv,
        });
        return { ...message, ...payload };
      }
    } catch (err) {
      console.warn('[PreChat] decrypt failed', err?.message);
      return { ...message, decryptionError: err?.message || 'Decrypt failed' };
    }

    return message;
  }, []);

  const syncMessagesWithBackend = useCallback(
    async (mekBytes) => {
      if (!userId) return;
      if (!mekBytes) return;
      setStatus('syncing');
      const token = await getToken();
      if (!token) throw new Error('Could not authenticate to sync messages.');

      const lastSeenId = await ensurePersistedLastSeenId({ userId, apiUrl: API_URL, getToken });
      const params = {};
      if (lastSeenId) params.sinceId = lastSeenId;

      // If we have no lastSeenId, treat this as a full fresh sync and wipe old cached messages
      if (!lastSeenId) {
        try {
          await clearMessages(userId);
        } catch (err) {
          console.warn('[PreChat] failed to clear Dexie before full sync', err?.message);
        }
      }

      let response;
      try {
        response = await axios.get(`${API_URL}/api/messages`, {
          headers: { Authorization: `Bearer ${token}` },
          params,
        });
      } catch (err) {
        console.warn('[PreChat] delta fetch failed, retrying full sync', err?.message);
        response = await axios.get(`${API_URL}/api/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      const messages = response.data?.messages || [];
      const deletedIds = response.data?.deletedIds || response.data?.deleted || [];
      const nextLastSeen = response.data?.lastSeenId || null;

      for (const msg of messages) {
        const decrypted = await decryptMessagePayload(msg, mekBytes);
        await upsertMessage(userId, decrypted);
      }

      for (const delId of deletedIds) {
        await deleteMessage(userId, delId);
      }

      if (nextLastSeen) {
        await setPersistedLastSeenId(userId, nextLastSeen);
      }
    },
    [
      deleteMessage,
      decryptMessagePayload,
      ensurePersistedLastSeenId,
      getToken,
      setPersistedLastSeenId,
      upsertMessage,
      userId,
    ]
  );

  // Verify Dexie belongs to this user; if not, reset to avoid stale data
  useEffect(() => {
    const verifyDbOwner = async () => {
      if (!userId) return;
      try {
        const owner = await getMeta('global', DB_OWNER_KEY);
        if (owner && owner !== userId) {
          await resetDb();
        }
        await setMeta('global', DB_OWNER_KEY, userId);
      } catch (err) {
        console.warn('[PreChat] Failed to verify db owner', err?.message);
      }
    };
    verifyDbOwner();
  }, [userId]);

  const runPreChat = useCallback(async () => {
    setError('');
    setStatus('checking');

    try {
      if (!isSignedIn) {
        navigate('/signin', { replace: true });
        return;
      }

      if (!userId) {
        return; // wait for user details before proceeding so stored key is scoped correctly
      }

      const keyResult = await ensureKey();
      if (!keyResult) {
        return;
      }

      const mekBytes = keyResult.mek;

      initGisClient();
      if (!hasValidToken()) {
        await ensureDriveAccess();
      }

      // Try to complete pending deletions, but if they don't finish within 3s,
      // allow the user to pass while cleanup continues in the background.
      const deletionPromise = syncPendingDeletions(mekBytes);
      const deletionTimeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 3000));
      const deletionResult = await Promise.race([
        deletionPromise.then(() => 'ok'),
        deletionTimeout,
      ]);

      if (deletionResult === 'timeout') {
        console.warn(
          '[PreChat] syncPendingDeletions timed out after 3s — proceeding while cleanup continues'
        );
        // Ensure we don't leave unhandled rejection if the background deletion fails later
        deletionPromise.catch((err) =>
          console.warn('[PreChat] background syncPendingDeletions failed', err)
        );
      }

      await syncMessagesWithBackend(mekBytes);

      localStorage.setItem(buildPrechatKey(userId), String(Date.now()));
      setStatus('success');
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const msg =
        err?.message === 'popup_closed_or_blocked'
          ? 'The Google window was closed or blocked. Allow popups and retry.'
          : err?.message || 'Drive access failed. Please retry.';
      setError(msg);
      setStatus('error');
      if (userId) {
        localStorage.removeItem(buildPrechatKey(userId));
      }
      if (pendingCount && pendingCount > 0) {
        navigate('/', { replace: true });
      }
    }
  }, [
    ensureDriveAccess,
    ensureKey,
    isSignedIn,
    navigate,
    redirectTo,
    pendingCount,
    syncMessagesWithBackend,
    syncPendingDeletions,
    userId,
  ]);

  useEffect(() => {
    if (!isLoaded) return;
    // Defer execution to avoid synchronous setState inside the effect
    const id = setTimeout(() => {
      runPreChat();
    }, 0);
    return () => clearTimeout(id);
  }, [isLoaded, runPreChat]);

  const retry = () => {
    runPreChat();
  };

  const handleKeySubmit = async (e) => {
    e?.preventDefault?.();
    setKeyError('');
    try {
      if (!password.trim()) {
        setKeyError('Password is required');
        return;
      }
      if (isFirstSetup && password !== confirmPassword) {
        setKeyError('Passwords do not match');
        return;
      }
      const saltToUse = encryptionSalt || cachedSalt || generateSalt();
      const derived = await deriveMek(password, saltToUse);
      cacheMek(user?.id, derived);
      cacheSalt(user?.id, saltToUse);
      if (!encryptionSalt) {
        await saveEncryptionSalt(saltToUse);
      }
      setStatus('checking');
      setPassword('');
      setConfirmPassword('');
      await runPreChat();
    } catch (err) {
      const msg = err?.message || 'Failed to derive key. Please try again.';
      setKeyError(msg);
    }
  };

  const subtitle =
    status === 'awaiting-key'
      ? isFirstSetup
        ? 'First-time setup: choose an encryption password you will use on every login. We cannot recover it.'
        : 'Enter your encryption password to unlock your data on this device.'
      : status === 'checking'
        ? 'Reviewing your DriveChat setup and any pending cleanup tasks.'
        : status === 'consenting'
          ? 'Completing Google Drive consent. Keep this tab open until it finishes.'
          : status === 'deleting'
            ? pendingCount === 0
              ? 'No pending deletions found. Moving ahead.'
              : `Cleaning up ${pendingCount} pending deletion${pendingCount === 1 ? '' : 's'}...`
            : status === 'syncing'
              ? 'Syncing your messages and cleanup state to this device.'
              : error || '';

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-xl w-full text-center space-y-5 shadow-2xl">
        {(status === 'checking' ||
          status === 'consenting' ||
          status === 'deleting' ||
          status === 'syncing') && (
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
        )}
        {status === 'error' && (
          <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto">
            <span className="text-red-400 text-xl">!</span>
          </div>
        )}
        <h1 className="text-2xl font-bold text-white">Preparing DriveChat</h1>
        <p className="text-gray-300 text-sm whitespace-pre-wrap">{subtitle}</p>

        <div className="bg-gray-800/60 border border-gray-700 rounded-xl text-left p-4 space-y-3">
          <p className="text-gray-200 font-semibold text-sm">What we are doing:</p>
          <ul className="space-y-2 text-sm text-gray-300">
            <li
              className={`flex items-start gap-2 ${status !== 'checking' ? 'text-gray-400' : ''}`}
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-blue-400" />
              Verifying your sign-in and loading DriveChat.
            </li>
            <li
              className={`flex items-start gap-2 ${status === 'deleting' || status === 'success' ? 'text-gray-200' : 'text-gray-400'}`}
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-emerald-400" />
              Cleaning up pending deletions{pendingCount !== null ? ` (${pendingCount} left)` : ''}.
            </li>
            <li
              className={`flex items-start gap-2 ${status === 'consenting' || status === 'success' ? 'text-gray-200' : 'text-gray-400'}`}
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-indigo-400" />
              Requesting Google Drive consent if needed (popups may appear).
            </li>
            <li
              className={`flex items-start gap-2 ${status === 'syncing' || status === 'success' ? 'text-gray-200' : 'text-gray-400'}`}
            >
              <span className="mt-1 h-2 w-2 rounded-full bg-amber-400" />
              Syncing messages and applying changes to this device.
            </li>
          </ul>
        </div>

        {status === 'awaiting-key' && (
          <form
            onSubmit={handleKeySubmit}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3 text-left"
          >
            <div className="flex items-center justify-between">
              <p className="text-white font-semibold text-sm">
                {isFirstSetup ? 'Set encryption password' : 'Enter encryption password'}
              </p>
              <span className="text-[11px] text-gray-400">
                Zero-knowledge. Password not stored.
              </span>
            </div>
            <div className="space-y-2">
              <label className="block text-xs text-gray-400">Password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                placeholder={isFirstSetup ? 'Create a strong passphrase' : 'Enter your passphrase'}
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
                >
                  {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              {isFirstSetup && (
                <div className="space-y-1">
                  <label className="block text-xs text-gray-400">Confirm password</label>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                    placeholder="Re-enter your passphrase"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowConfirm((prev) => !prev)}
                      className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
                    >
                      {showConfirm ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      {showConfirm ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              )}
              <p className="text-xs text-gray-400">
                {isFirstSetup
                  ? 'We derive a device-only key via scrypt and store only a salt remotely. Keep this password safe for every future login.'
                  : 'Your cached key was missing; re-enter to unlock existing data.'}
              </p>
              {keyError && <p className="text-xs text-red-400">{keyError}</p>}
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Continue
            </button>
          </form>
        )}

        {status === 'error' && (
          <div className="flex gap-2 justify-center">
            <button
              onClick={retry}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Retry
            </button>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg"
            >
              Go Home
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
