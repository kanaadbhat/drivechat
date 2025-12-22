import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  FileText,
  Image as ImageIcon,
  File,
  Video,
  Music,
  Archive,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { loadMessages, upsertMessage } from '../db/dexie';
import { initializeDevice } from '../utils/deviceManager';
import { createRealtimeClient } from '../utils/realtimeClient';
import { decryptJson, loadCachedMek } from '../utils/crypto';
import { containsUrl, extractFirstUrl, getHostname } from '../utils/messageUtils';
import { useUserChangeGuard } from '../hooks/useUserChangeGuard';
import StarredHeader from './starred/StarredHeader';
import FileTypeFilter from './starred/FileTypeFilter';
import StarredCard from './starred/StarredCard';
import StarredListRow from './starred/StarredListRow';
import StarredSkeletons from './starred/StarredSkeletons';
import StarredEmpty from './starred/StarredEmpty';

const API_URL =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const PRECHAT_KEY_BASE = 'drivechat_prechat_passed';
const buildPrechatKey = (userId) => `${PRECHAT_KEY_BASE}_${userId || 'anon'}`;

const fileTypes = [
  { id: 'all', label: 'All Files', icon: File },
  { id: 'links', label: 'Links', icon: ExternalLink },
  {
    id: 'images',
    label: 'Images',
    icon: ImageIcon,
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: FileText,
    extensions: ['pdf', 'doc', 'docx', 'txt', 'xlsx'],
  },
  { id: 'videos', label: 'Videos', icon: Video, extensions: ['mp4', 'mov', 'avi', 'mkv'] },
  { id: 'audio', label: 'Audio', icon: Music, extensions: ['mp3', 'wav', 'ogg'] },
  { id: 'archives', label: 'Archives', icon: Archive, extensions: ['zip', 'rar', '7z', 'tar'] },
];

export default function StarredMessages() {
  const { getToken } = useAuth();
  const { user } = useUser();
  const navigate = useNavigate();
  const [starredMessages, setStarredMessages] = useState([]);
  const [selectedType, setSelectedType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('grid'); // grid | list
  const [syncing, setSyncing] = useState(false);
  const [currentDevice, setCurrentDevice] = useState(null);
  const [mek, setMek] = useState(null);
  const [encryptionError, setEncryptionError] = useState('');
  const [decrypting, setDecrypting] = useState(true);
  const realtimeRef = useRef(null);
  const fetchedOnceRef = useRef(false);
  const cachedLoadedRef = useRef(false);
  const fetchInFlightRef = useRef(false);

  useUserChangeGuard(user?.id);

  useEffect(() => {
    if (!user?.id) return;
    const prechatPassed = localStorage.getItem(buildPrechatKey(user.id));
    if (!prechatPassed) {
      console.info('[StarredMessages] redirecting to prechat because key missing');
      navigate('/prechat', { state: { redirect: '/starred' } });
    }
  }, [user?.id, navigate]);

  const decryptMessages = useCallback(
    async (messages = []) => {
      if (!mek) {
        setDecrypting(false);
        return [];
      }
      setDecrypting(true);
      const results = await Promise.all(
        messages.map(async (message) => {
          if (!message) return message;
          if (!message.ciphertext && !message.fileCiphertext) return message;
          try {
            if (message.type === 'file' && message.fileCiphertext) {
              const payload = await decryptJson(mek, {
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
              const payload = await decryptJson(mek, {
                ciphertext: message.ciphertext,
                iv: message.encryption?.iv,
              });
              return { ...message, ...payload };
            }
          } catch (err) {
            console.warn('[StarredMessages] decrypt failed', err?.message);
            return { ...message, decryptionError: err?.message || 'Decrypt failed' };
          }
          return message;
        })
      );
      setDecrypting(false);
      return results;
    },
    [mek]
  );

  const loadCached = useCallback(async () => {
    if (!user?.id) return;
    if (!mek) {
      setLoading(false);
      return;
    }
    if (cachedLoadedRef.current) return;
    cachedLoadedRef.current = true;
    setLoading(true);
    const cached = await loadMessages(user.id, 1000);
    console.info('[StarredMessages] loaded cached', { count: cached.length });
    const starred = cached.filter((m) => m.starred);
    console.info('[StarredMessages] cached starred', { count: starred.length });
    const decrypted = await decryptMessages(starred);
    setStarredMessages(decrypted);
    setLoading(false);
  }, [user?.id, mek, decryptMessages]);

  useEffect(() => {
    loadCached();
  }, [loadCached]);

  useEffect(() => {
    cachedLoadedRef.current = false;
    fetchedOnceRef.current = false;
    setStarredMessages([]);
  }, [user?.id]);

  // Initialize device once
  useEffect(() => {
    const device = initializeDevice();
    setCurrentDevice(device);
  }, []);

  // Load cached MEK for decryption
  useEffect(() => {
    if (!user?.id) return;
    const cached = loadCachedMek(user.id);
    if (cached) {
      setMek(cached);
      setEncryptionError('');
    }
  }, [user?.id]);

  useEffect(() => {
    if (!mek) return;
    setEncryptionError('');
  }, [mek]);

  const fetchStarredMessages = useCallback(async () => {
    if (!mek) return;
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      setSyncing(true);
      setLoading((prev) => prev || true);
      const token = await getToken();
      if (!token) return;

      const response = await axios.get(`${API_URL}/api/messages/category/starred`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const messages = response.data.messages || [];
      console.info('[StarredMessages] fetch response', { count: messages.length });
      const decrypted = await decryptMessages(messages);
      setStarredMessages(decrypted);
      if (user?.id) {
        const cached = await loadMessages(user.id, 2000);
        const fetchedIds = new Set(decrypted.map((m) => m.id));
        const staleStarred = (cached || []).filter((m) => m.starred && !fetchedIds.has(m.id));
        if (staleStarred.length) {
          console.info('[StarredMessages] clearing stale starred entries', {
            staleCount: staleStarred.length,
          });
          for (const stale of staleStarred) {
            await upsertMessage(user.id, { ...stale, starred: false });
          }
        }
        for (const msg of decrypted) {
          await upsertMessage(user.id, msg);
        }
      }
    } catch (error) {
      console.error('Error fetching starred messages:', error);
    } finally {
      setLoading(false);
      setSyncing(false);
      fetchInFlightRef.current = false;
    }
  }, [getToken, user?.id, decryptMessages]);

  // Realtime starred sync
  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      if (!currentDevice?.deviceId) return;
      if (realtimeRef.current) return;

      try {
        realtimeRef.current = await createRealtimeClient({
          apiUrl: API_URL,
          getToken,
          userId: user.id,
          deviceId: currentDevice.deviceId,
          onStatus: () => {},
          onEvent: async (event) => {
            if (!event?.type) return;

            // Add/update starred on create/update if flagged
            if (event.type === 'message.created' || event.type === 'message.updated') {
              const msg = event.message;
              if (!msg?.id) return;
              const decrypted = await decryptMessages([msg]);
              const finalMsg = decrypted?.[0] || msg;
              if (finalMsg.starred) {
                setStarredMessages((prev) => {
                  const exists = prev.some((m) => m.id === finalMsg.id);
                  const next = exists
                    ? prev.map((m) => (m.id === finalMsg.id ? { ...m, ...finalMsg } : m))
                    : [...prev, finalMsg];
                  return next.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                });
                if (user?.id) await upsertMessage(user.id, finalMsg);
              } else {
                setStarredMessages((prev) => prev.filter((m) => m.id !== finalMsg.id));
                if (user?.id) await upsertMessage(user.id, finalMsg);
              }
              return;
            }

            if (event.type === 'message.deleted') {
              const mid = event.messageId;
              if (!mid) return;
              setStarredMessages((prev) => prev.filter((m) => m.id !== mid));
              return;
            }

            if (event.type === 'messages.cleared') {
              setStarredMessages([]);
              return;
            }

            if (event.type === 'preview.ready') {
              const { messageId, patch } = event;
              if (!messageId || !patch) return;
              let patched = null;
              setStarredMessages((prev) => {
                const next = prev.map((m) => (m.id === messageId ? { ...m, ...patch } : m));
                patched = next.find((m) => m.id === messageId) || null;
                return next;
              });
              if (user?.id && patched) {
                await upsertMessage(user.id, patched);
              }
            }
          },
        });
      } catch (err) {
        console.warn('[StarredMessages] realtime failed', err?.message);
      }
    };

    run();

    return () => {
      try {
        realtimeRef.current?.disconnect?.();
      } catch (e) {
        console.warn('[StarredMessages] realtime cleanup failed', e);
      }
      realtimeRef.current = null;
    };
  }, [user?.id, currentDevice?.deviceId]);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      if (!mek) return;
      if (fetchedOnceRef.current) return;
      fetchedOnceRef.current = true;
      await fetchStarredMessages();
    };
    run();
  }, [user?.id, mek, fetchStarredMessages]);

  // Re-decrypt starred messages once a MEK arrives
  useEffect(() => {
    const run = async () => {
      if (!mek) return;
      if (!starredMessages.length) return;
      setLoading(true);
      const decrypted = await decryptMessages(starredMessages);
      setStarredMessages(decrypted);
      setLoading(false);
    };
    run();
  }, [mek]);

  const unstarMessage = async (messageId) => {
    try {
      const token = await getToken();
      if (!token) return;

      await axios.patch(
        `${API_URL}/api/messages/${messageId}`,
        {
          starred: false,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      let removed = null;
      setStarredMessages((prev) => {
        removed = prev.find((m) => m.id === messageId) || null;
        return prev.filter((m) => m.id !== messageId);
      });
      if (user?.id && removed) {
        await upsertMessage(user.id, { ...removed, starred: false });
      }
    } catch (error) {
      console.error('Error unstarring message:', error);
    }
  };

  const filteredMessages = starredMessages.filter((message) => {
    if (selectedType === 'all') return true;
    if (selectedType === 'links') {
      // include explicit link messages and text messages that contain a URL
      return message.type === 'link' || (message.type === 'text' && containsUrl(message.text));
    }
    if (message.type !== 'file' || !message.fileName) return false;

    const ext = message.fileName?.split('.').pop()?.toLowerCase() || '';
    const type = fileTypes.find((t) => t.id === selectedType);
    return type?.extensions?.includes(ext);
  });

  const sortedMessages = useMemo(
    () => [...filteredMessages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [filteredMessages]
  );

  const keyMissing = !mek;
  const warningMessage = keyMissing
    ? 'Encryption key missing. Open PreChat to unlock starred items.'
    : encryptionError;

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <StarredHeader
            count={filteredMessages.length}
            syncing={syncing}
            viewMode={viewMode}
            onViewChange={setViewMode}
            onBack={() => navigate('/chat')}
          />
          <FileTypeFilter
            fileTypes={fileTypes}
            selectedType={selectedType}
            onSelect={setSelectedType}
          />
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {warningMessage && (
          <div className="mb-4 p-3 rounded-lg border border-yellow-600 bg-yellow-500/10 text-yellow-200 text-sm">
            {warningMessage}
          </div>
        )}
        {loading || decrypting ? (
          <StarredSkeletons />
        ) : filteredMessages.length === 0 ? (
          <StarredEmpty />
        ) : viewMode === 'grid' ? (
          <div
            className="masonry w-full"
            style={{
              columnWidth: 320,
              columnGap: 16,
            }}
          >
            {sortedMessages.map((message) => (
              <div
                key={message.id}
                className="break-inside-avoid-column inline-block w-full mb-4"
                style={{ width: '100%' }}
              >
                <StarredCard message={message} fileTypes={fileTypes} onUnstar={unstarMessage} />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-3 px-3 text-xs text-gray-500">
              <span className="col-span-5">Name</span>
              <span className="col-span-2">Type</span>
              <span className="col-span-2">Size</span>
              <span className="col-span-3 text-right">Actions</span>
            </div>
            {sortedMessages.map((message) => (
              <StarredListRow key={message.id} message={message} onUnstar={unstarMessage} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
