import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import axios from 'axios';
import {
  initGisClient,
  hasValidToken,
  getAccessToken,
  deleteFileFromDrive,
} from '../utils/gisClient';

const API_URL =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function PreChat() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [status, setStatus] = useState('checking'); // checking | deleting | consenting | success | error
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(null);

  const ensureDriveAccess = useCallback(async () => {
    setStatus('consenting');
    const loginHint = user?.primaryEmailAddress?.emailAddress;
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('popup_closed_or_blocked')), 25000)
    );

    await Promise.race([getAccessToken({ prompt: 'consent', login_hint: loginHint }), timeout]);
    window?.focus?.();
  }, [user?.primaryEmailAddress?.emailAddress]);

  const syncPendingDeletions = useCallback(async () => {
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
      const fileId = item.fileId;
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
  }, [getToken]);

  const runPreChat = useCallback(async () => {
    setError('');
    setStatus('checking');

    try {
      if (!isSignedIn) {
        navigate('/signin', { replace: true });
        return;
      }

      initGisClient();
      if (!hasValidToken()) {
        await ensureDriveAccess();
      }
      await syncPendingDeletions();

      setStatus('success');
      navigate('/chat', { replace: true });
    } catch (err) {
      const msg =
        err?.message === 'popup_closed_or_blocked'
          ? 'The Google window was closed or blocked. Allow popups and retry.'
          : err?.message || 'Drive access failed. Please retry.';
      setError(msg);
      setStatus('error');
    }
  }, [ensureDriveAccess, isSignedIn, navigate, syncPendingDeletions]);

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

  const subtitle =
    status === 'checking'
      ? 'Reviewing your DriveChat setup and any pending cleanup tasks.'
      : status === 'consenting'
        ? 'Completing Google Drive consent. Keep this tab open until it finishes.'
        : status === 'deleting'
          ? pendingCount === 0
            ? 'No pending deletions found. Moving ahead.'
            : `Cleaning up ${pendingCount} pending deletion${pendingCount === 1 ? '' : 's'}...`
          : error || '';

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-xl w-full text-center space-y-5 shadow-2xl">
        {(status === 'checking' || status === 'consenting' || status === 'deleting') && (
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
          </ul>
        </div>

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
