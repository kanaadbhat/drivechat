import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
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
  const redirectTo = location.state?.redirect || '/chat';

  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const userId = user?.id;
  const primaryEmailAddress = user?.primaryEmailAddress?.emailAddress;

  const [status, setStatus] = useState('checking');
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(null);
  const pendingCountRef = useRef(0);
  const runRef = useRef(false);

  const [encryptionSalt, setEncryptionSalt] = useState(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [keyError, setKeyError] = useState('');
  const [isFirstSetup, setIsFirstSetup] = useState(false);

  const cachedSalt = useMemo(() => loadCachedSalt(user?.id || ''), [user?.id]);

  /* ================= DRIVE ACCESS ================= */

  const ensureDriveAccess = useCallback(async () => {
    console.log('[PreChat][STEP 2] Requesting Google Drive access');
    setStatus('consenting');

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('popup_closed_or_blocked')), 25000)
    );

    await Promise.race([
      getAccessToken({ prompt: 'consent', login_hint: primaryEmailAddress }),
      timeout,
    ]);

    console.log('[PreChat][STEP 2 ✓] Google Drive access granted');
    window?.focus?.();
  }, [primaryEmailAddress]);

  /* ================= PENDING DELETIONS ================= */

  const syncPendingDeletions = useCallback(
    async (mekBytes) => {
      console.log('[PreChat][STEP 3] Checking pending deletions');
      setStatus('deleting');

      const token = await getToken();
      if (!token) throw new Error('Auth failed');

      const res = await axios.get(`${API_URL}/api/messages/pending-deletions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const pending = res.data?.pending || [];
      setPendingCount(pending.length);

      if (!pending.length) {
        console.log('[PreChat][STEP 3 ✓] No pending deletions');
        return;
      }

      const acknowledged = [];
      const failed = [];

      for (const item of pending) {
        let fileId = item.fileId;
        if (!fileId && item.fileCiphertext && mekBytes) {
          const decrypted = await decryptJson(mekBytes, {
            ciphertext: item.fileCiphertext,
            iv: item.encryption?.iv,
          });
          fileId = decrypted?.fileId;
        }
        if (!fileId) continue;

        try {
          await deleteFileFromDrive(fileId);
          acknowledged.push(item.id || fileId);
        } catch {
          failed.push(fileId);
        }
      }

      if (acknowledged.length) {
        await axios.post(
          `${API_URL}/api/messages/pending-deletions/ack`,
          { messageIds: acknowledged },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      if (failed.length) throw new Error('Some deletions failed');

      setPendingCount(0);
      console.log('[PreChat][STEP 3 ✓] Pending deletions completed');
    },
    [getToken]
  );

  /* ================= ENCRYPTION KEY ================= */

  const fetchEncryptionSalt = useCallback(async () => {
    const token = await getToken();
    if (!token) return null;

    const res = await axios.get(`${API_URL}/api/users/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const salt = res.data?.user?.encryptionSalt || null;
    if (salt) {
      cacheSalt(user?.id, salt);
      setEncryptionSalt(salt);
    }
    return salt;
  }, [getToken, user?.id]);

  const saveEncryptionSalt = useCallback(
    async (salt) => {
      const token = await getToken();
      await axios.patch(
        `${API_URL}/api/users/me`,
        { encryptionSalt: salt, encryptionVersion: 'v1' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      cacheSalt(user?.id, salt);
      setEncryptionSalt(salt);
    },
    [getToken, user?.id]
  );

  const ensureKey = useCallback(async () => {
    console.log('[PreChat][STEP 1] Ensuring encryption key');

    const mek = loadCachedMek(user?.id || '');
    const salt = loadCachedSalt(user?.id || '') || cachedSalt;

    if (mek) {
      console.log('[PreChat][STEP 1 ✓] Encryption key available');
      return { mek, salt };
    }

    const serverSalt = salt || (await fetchEncryptionSalt());
    setIsFirstSetup(!serverSalt);
    setStatus('awaiting-key');

    // 🔑 CRITICAL FIX
    runRef.current = false;

    console.log('[PreChat][STEP 1 ⏸] Waiting for password');
    return null;
  }, [cachedSalt, fetchEncryptionSalt, user?.id]);

  /* ================= MESSAGE SYNC ================= */

  const decryptMessagePayload = useCallback(async (msg, mek) => {
    if (!msg?.ciphertext && !msg?.fileCiphertext) return msg;
    const payload = await decryptJson(mek, {
      ciphertext: msg.fileCiphertext || msg.ciphertext,
      iv: msg.encryption?.iv,
    });
    return { ...msg, ...payload };
  }, []);

  const syncMessagesWithBackend = useCallback(
    async (mek) => {
      console.log('[PreChat][STEP 4] Syncing messages');
      setStatus('syncing');

      const token = await getToken();
      const lastSeenId = await ensurePersistedLastSeenId({
        userId,
        apiUrl: API_URL,
        getToken,
      });

      const params = lastSeenId ? { sinceId: lastSeenId } : {};
      if (!lastSeenId) await clearMessages(userId);

      const res = await axios.get(`${API_URL}/api/messages`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });

      for (const msg of res.data?.messages || []) {
        const decrypted = await decryptMessagePayload(msg, mek);
        await upsertMessage(userId, decrypted);
      }

      for (const id of res.data?.deletedIds || []) {
        await deleteMessage(userId, id);
      }

      if (res.data?.lastSeenId) {
        await setPersistedLastSeenId(userId, res.data.lastSeenId);
      }

      console.log('[PreChat][STEP 4 ✓] Messages synced');
    },
    [decryptMessagePayload, getToken, userId]
  );

  /* ================= MAIN ORCHESTRATOR ================= */

  const runPreChat = useCallback(async () => {
    if (runRef.current) {
      console.log('[PreChat] run already in progress');
      return;
    }
    if (!userId || !isSignedIn) return;

    // Double-check localStorage (effect handles this too, but be safe)
    const prechatKey = buildPrechatKey(userId);
    if (localStorage.getItem(prechatKey)) {
      console.log('[PreChat] already completed earlier');
      return; // Don't set status here - let effect handle it
    }

    runRef.current = true;
    setError('');
    console.log('[PreChat] Starting prechat flow');

    try {
      const keyResult = await ensureKey();
      if (!keyResult) return;

      initGisClient();
      if (!hasValidToken()) await ensureDriveAccess();

      await Promise.race([
        syncPendingDeletions(keyResult.mek),
        new Promise((r) => setTimeout(r, 3000)),
      ]);

      await syncMessagesWithBackend(keyResult.mek);

      localStorage.setItem(buildPrechatKey(userId), String(Date.now()));
      console.log('[PreChat][STEP 5 ✓] PreChat completed');

      runRef.current = false; // 🔓 release
      setStatus('success'); // ✅ final state
    } catch (err) {
      console.error('[PreChat][ERROR]', err);
      setError(err?.message || 'PreChat failed');
      setStatus('error');
      runRef.current = false;
    }
  }, [
    ensureDriveAccess,
    ensureKey,
    isSignedIn,
    syncMessagesWithBackend,
    syncPendingDeletions,
    userId,
  ]);

  /* ================= EFFECTS ================= */

  useEffect(() => {
    pendingCountRef.current = pendingCount ?? 0;
  }, [pendingCount]);

  // Single-run effect: only triggers when status is "checking"
  const hasStartedRef = useRef(false);
  const hasNavigatedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;

    // Only initiate while we're in the "checking" state
    if (status !== 'checking') return;

    // Already completed in localStorage? Mark success once and stop.
    const prechatKey = buildPrechatKey(userId);
    if (localStorage.getItem(prechatKey)) {
      if (status !== 'success') setStatus('success');
      return;
    }

    // Prevent duplicate starts
    if (hasStartedRef.current) return;

    hasStartedRef.current = true;
    runPreChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, userId, status]); // Intentionally exclude runPreChat to prevent loops

  // Navigate away once success is reached (single fire)
  useEffect(() => {
    if (status !== 'success') return;
    if (hasNavigatedRef.current) return;
    hasNavigatedRef.current = true;
    navigate(redirectTo, { replace: true });
  }, [status, navigate, redirectTo]);

  /* ================= PASSWORD SUBMIT ================= */

  const handleKeySubmit = async (e) => {
    e.preventDefault();
    setKeyError('');

    if (!password.trim()) return setKeyError('Password required');
    if (isFirstSetup && password !== confirmPassword) return setKeyError('Passwords do not match');

    const salt = encryptionSalt || cachedSalt || generateSalt();
    const mek = await deriveMek(password, salt);
    cacheMek(userId, mek);
    cacheSalt(userId, salt);
    if (!encryptionSalt) await saveEncryptionSalt(salt);

    setPassword('');
    setConfirmPassword('');
    runRef.current = false;
    hasStartedRef.current = false; // Allow a new run after password submit
    setStatus('checking');
  };

  const subtitle =
    status === 'awaiting-key'
      ? isFirstSetup
        ? 'First-time setup: choose an encryption password you will use on every login. We cannot recover it.'
        : 'Enter your encryption password to unlock your data on this device.'
      : status === 'checking'
        ? 'Preparing secure chat session.'
        : status === 'consenting'
          ? 'Requesting Google Drive access.'
          : status === 'deleting'
            ? `Cleaning up pending deletions${pendingCount ? ` (${pendingCount})` : ''}.`
            : status === 'syncing'
              ? 'Syncing and decrypting your messages.'
              : error || '';

  const retry = () => {
    console.log('[PreChat] Manual retry triggered');
    runRef.current = false;
    runPreChat();
  };

  return (
    <div
      className="min-h-screen bg-gray-950 flex items-center justify-center p-6"
      style={{
        backgroundImage: "url('/dark-blue-bg.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: 'rgba(0,0,0,0.45)',
        backgroundBlendMode: 'overlay',
      }}
    >
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

        <div className="flex flex-col sm:flex-row items-center gap-2 justify-center text-xs text-gray-400">
          <span>Having trouble unlocking chat?</span>
          <button
            type="button"
            onClick={() => navigate('/learn-more')}
            className="text-blue-400 hover:text-blue-300 underline"
          >
            Read how access works
          </button>
        </div>

        <div className="bg-gray-800/60 border border-gray-700 rounded-xl text-left p-4 space-y-3">
          <p className="text-gray-200 font-semibold text-sm">What we are doing:</p>
          <ul className="space-y-2 text-sm text-gray-300">
            <li>🔐 Step 1: Unlocking encryption key</li>
            <li>📁 Step 2: Verifying Google Drive access</li>
            <li>🧹 Step 3: Cleaning up pending deletions</li>
            <li>🔄 Step 4: Syncing and decrypting messages</li>
            <li>✅ Step 5: Finalizing secure session</li>
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
                  : 'ReEnter the password you set during your first DriveChat login on this device.'}
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
