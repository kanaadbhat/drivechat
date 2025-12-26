import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser, useSession } from '@clerk/clerk-react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { File, ImageIcon, FileText } from 'lucide-react';
import { initializeDevice } from '../utils/deviceManager';
import ChatBody from './chat/ChatBody';
import MessageContextMenu from './chat/MessageContextMenu';
import ChatSidebar from './chat/ChatSidebar';
import ChatHeader from './chat/ChatHeader';
import MessageInput from './chat/MessageInput';
import { EncryptionGate, DeleteConfirmModal } from './chat/ChatModals';
import Skeleton from './ui/Skeleton';
import {
  clearMessages,
  deleteMessage as dexieDeleteMessage,
  loadMessages,
  upsertMessage,
  getMessageById,
} from '../db/dexie';
import { createRealtimeClient } from '../utils/realtimeClient';
import {
  initGisClient,
  hasValidToken,
  uploadFileToDrive,
  deleteFileFromDrive,
  getDriveContentUrl,
  getDriveThumbnailUrl,
  downloadFileFromDrive,
} from '../utils/gisClient';
import {
  buildEncryptionHeader,
  decryptJson,
  encryptJson,
  loadCachedMek,
  loadCachedSalt,
} from '../utils/crypto';
import { formatBytes, extractFirstUrl, buildLinkMeta } from '../utils/messageUtils';
import { useUserChangeGuard } from '../hooks/useUserChangeGuard';
import { cleanupUserSession } from '../utils/sessionCleanup';

const API_URL =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const ENABLE_REALTIME =
  String(import.meta.env.VITE_ENABLE_REALTIME || 'false').toLowerCase() === 'true';
const PRECHAT_KEY_BASE = 'drivechat_prechat_passed';
const buildPrechatKey = (userId) => `${PRECHAT_KEY_BASE}_${userId || 'anon'}`;

export default function ChatInterface() {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const { session } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [messages, setMessages] = useState([]);
  const [mek, setMek] = useState(null);
  const [encryptionSalt, setEncryptionSalt] = useState(null);
  const [encryptionReady, setEncryptionReady] = useState(false);
  const [encryptionError, setEncryptionError] = useState('');
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [driveAuthorized, setDriveAuthorized] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editText, setEditText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [downloadStates, setDownloadStates] = useState({});
  const [deleteErrors, setDeleteErrors] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [currentDevice, setCurrentDevice] = useState(null);
  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const messagesEndRef = useRef(null);
  const realtimeRef = useRef(null);

  useUserChangeGuard(user?.id);

  useEffect(() => {
    if (!user?.id) return;
    const prechatPassed = localStorage.getItem(buildPrechatKey(user.id));
    if (!prechatPassed) {
      navigate('/prechat', { state: { redirect: location.pathname || '/chat' } });
      return;
    }
    setMessages([]);
    setHasLoadedOnce(false);
  }, [user?.id, navigate, location.pathname]);

  useEffect(() => {
    if (!user?.id) return;
    const cachedMek = loadCachedMek(user.id);
    const cachedSalt = loadCachedSalt(user.id);
    if (cachedSalt) setEncryptionSalt(cachedSalt);
    if (cachedMek) {
      setMek(cachedMek);
      setEncryptionReady(true);
      setEncryptionError('');
    } else {
      setEncryptionReady(false);
      setEncryptionError('Encryption key missing. Return to PreChat to unlock.');
    }
  }, [user?.id]);

  useEffect(() => {
    if (mek) {
      setEncryptionReady(true);
      setEncryptionError('');
    }
  }, [mek]);

  const decryptMessagePayload = useCallback(
    async (message) => {
      if (!message) return message;
      if (!message.ciphertext && !message.fileCiphertext) return message;
      if (!mek) return { ...message, decryptionError: 'missing-key' };

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
          return {
            ...message,
            ...payload,
          };
        }
      } catch (err) {
        console.warn('[ChatInterface] decrypt failed', err?.message);
        return { ...message, decryptionError: err?.message || 'Decrypt failed' };
      }

      return message;
    },
    [mek]
  );

  const encryptPayload = useCallback(
    async (payload) => {
      if (!mek) throw new Error('Encryption key missing');
      const envelope = await encryptJson(mek, payload);
      const encryption = buildEncryptionHeader(envelope, encryptionSalt);
      return { envelope, encryption };
    },
    [mek, encryptionSalt]
  );
  // Initialize GIS on mount
  useEffect(() => {
    initGisClient();
    const authorized = hasValidToken();
    setDriveAuthorized(authorized);
  }, []);

  // Helper functions - defined before useEffect hooks that use them
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  const syncPendingDeletions = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await axios.get(`${API_URL}/api/messages/pending-deletions`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const pending = res.data?.pending || [];
      if (!pending.length) return;

      const acknowledged = [];

      for (const item of pending) {
        const fileId = item.fileId;
        if (!fileId) continue;
        try {
          await deleteFileFromDrive(fileId);
          acknowledged.push(item.id || item.messageId || fileId);
        } catch (err) {
          console.warn('[syncPendingDeletions] Failed to delete Drive file', fileId, err?.message);
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
          console.warn('[syncPendingDeletions] Failed to ACK pending deletions', err?.message);
        }
      }
    } catch (error) {
      console.warn('[syncPendingDeletions] Error', error?.message);
    }
  }, [getToken]);

  const fetchMessages = useCallback(async () => {
    try {
      const token = await getToken();
      if (!token) return;

      if (!mek) {
        setEncryptionReady(false);
        setEncryptionError('Encryption key missing. Return to PreChat to unlock.');
        return;
      }

      let url = `${API_URL}/api/messages`;

      if (showStarredOnly) {
        url = `${API_URL}/api/messages/category/starred`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Reverse the order so newest messages appear at the bottom
      const sortedMessages = (response.data.messages || []).sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      if (user?.id) {
        try {
          await clearMessages(user.id);
        } catch (err) {
          console.warn('[ChatInterface] failed to clear Dexie before upsert', err?.message);
        }
      }

      const decryptedMessages = [];
      for (const msg of sortedMessages) {
        const decrypted = await decryptMessagePayload(msg);
        if (user?.id) {
          await upsertMessage(user.id, decrypted);
        }
        decryptedMessages.push(decrypted);
      }

      console.debug('[ChatInterface] decrypted + stored', {
        decryptedCount: decryptedMessages.length,
      });

      setMessages(decryptedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setMessages([]);
    }
  }, [decryptMessagePayload, getToken, mek, showStarredOnly, user?.id]);

  // useEffect hooks

  useEffect(() => {
    if (searchQuery.trim()) return;
    const fetch = async () => {
      if (!hasLoadedOnce) setIsLoadingMessages(true);
      await fetchMessages();
      setIsLoadingMessages(false);
      setHasLoadedOnce(true);
    };
    fetch();
  }, [searchQuery, showStarredOnly, fetchMessages, hasLoadedOnce]);

  useEffect(() => {
    const runSearch = async () => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return;
      if (!user?.id) return;
      try {
        setIsLoadingMessages(true);
        const cached = await loadMessages(user.id, 2000);
        const filtered = cached.filter((msg) => {
          const haystack = [
            msg.text,
            msg.fileName,
            msg.linkTitle,
            msg.linkUrl,
            msg.linkDescription,
            msg.sender?.deviceName,
            msg.sender?.deviceType,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(query);
        });
        const final = showStarredOnly ? filtered.filter((msg) => msg.starred) : filtered;
        setMessages(final);
      } catch (err) {
        console.warn('[ChatInterface] Dexie search failed', err?.message);
      }
      setIsLoadingMessages(false);
    };
    runSearch();
  }, [searchQuery, showStarredOnly, user?.id]);

  // On sign-in / app load, reconcile any pending Drive deletions (offline sync)
  useEffect(() => {
    if (!user?.id) return;
    syncPendingDeletions();
  }, [user?.id, syncPendingDeletions]);

  // Load cached messages early (before network)
  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      try {
        const cached = await loadMessages(user.id, 1000);
        if (cached?.length) {
          const sorted = cached.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          setMessages(sorted);
          setIsLoadingMessages(false);
          setHasLoadedOnce(true);
        }
      } catch (e) {
        console.warn('Failed to load cached messages:', e?.message);
      }
    };
    run();
  }, [user?.id]);

  useEffect(() => {
    // Keeping this effect silent until we need to diagnose realtime issues
    const interval = setInterval(() => {
      const usingPolling = !ENABLE_REALTIME || !realtimeConnected;
      if (
        usingPolling &&
        !searchQuery &&
        !showStarredOnly &&
        document.visibilityState === 'visible'
      ) {
        fetchMessages();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [searchQuery, showStarredOnly, realtimeConnected, fetchMessages]);

  // Connect realtime (Socket.IO + Redis Streams)
  useEffect(() => {
    const run = async () => {
      if (!ENABLE_REALTIME) return;
      if (!user?.id) return;
      if (!currentDevice?.deviceId) return;
      if (realtimeRef.current) return;

      try {
        realtimeRef.current = await createRealtimeClient({
          apiUrl: API_URL,
          getToken,
          userId: user.id,
          deviceId: currentDevice.deviceId,
          onStatus: ({ connected }) => setRealtimeConnected(Boolean(connected)),
          onEvent: async (event) => {
            if (!event?.type) return;
            if (event.type === 'messages.cleared') {
              await clearMessages(user.id);
              setMessages([]);
              return;
            }

            if (event.type === 'message.deleted') {
              const mid = event.messageId;
              await dexieDeleteMessage(user.id, mid);
              setMessages((prev) => prev.filter((m) => m.id !== mid));
              return;
            }

            if (event.type === 'message.created' || event.type === 'message.updated') {
              const msg = event.message;
              if (!msg?.id) return;
              if (event.type === 'message.created' && (await getMessageById(user.id, msg.id))) {
                return;
              }
              const decrypted = await decryptMessagePayload(msg);
              await upsertMessage(user.id, decrypted);
              setMessages((prev) => {
                const exists = prev.some((m) => m.id === decrypted.id);
                const next = exists
                  ? prev.map((m) => (m.id === decrypted.id ? decrypted : m))
                  : [...prev, decrypted];
                return next.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
              });
              return;
            }

            if (event.type === 'preview.ready') {
              const patch = event.patch;
              const mid = event.messageId;
              if (!mid || !patch) return;
              setMessages((prev) => {
                const next = prev.map((m) => (m.id === mid ? { ...m, ...patch } : m));
                const updated = next.find((m) => m.id === mid);
                if (updated) upsertMessage(user.id, updated);
                return next;
              });
              return;
            }

            // Handle Drive delete requests - delete files from user's Drive
            if (event.type === 'drive.delete.request') {
              const driveFileId = event.driveFileId;
              if (!driveFileId) return;
              try {
                await deleteFileFromDrive(driveFileId);
                // ACK the deletion to the server
                realtimeRef.current?.socket?.emit('ack-drive-delete', { driveFileId });
              } catch (err) {
                console.warn('[ChatInterface] Failed to delete Drive file:', err?.message);
              }
              return;
            }
          },
        });
      } catch (e) {
        console.warn('Realtime connection failed:', e?.message);
        setRealtimeConnected(false);
      }
    };

    run();

    return () => {
      try {
        realtimeRef.current?.disconnect?.();
      } catch {
        // ignore
      }
      realtimeRef.current = null;
      setRealtimeConnected(false);
    };
  }, [decryptMessagePayload, user?.id, currentDevice?.deviceId, getToken]);

  // Initialize device on mount
  useEffect(() => {
    const device = initializeDevice();
    setCurrentDevice(device);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() && !selectedFile) return;
    if (isSending) return; // Prevent double-sending

    if (!mek) {
      setEncryptionError('Encryption key missing. Return to PreChat to unlock.');
      return;
    }

    setIsSending(true);

    try {
      const token = await getToken();
      if (!token) {
        alert('Authentication required');
        setIsSending(false);
        return;
      }

      // Get device info from currentDevice state
      const device = currentDevice || initializeDevice();
      if (!currentDevice) setCurrentDevice(device);

      const senderPayload = {
        deviceId: device.deviceId,
        deviceName: device.name,
        deviceType: device.type,
      };

      // If file is selected, upload to Google Drive (client-side)
      let driveFileId = null;
      let fileName = null;
      let fileSize = null;
      let mimeType = null;
      let fileCategory = null;
      if (selectedFile) {
        setPendingUpload({
          fileName: selectedFile.name,
          progress: 0,
          speed: 0,
          status: 'uploading',
          error: null,
          abort: null,
        });
        try {
          const uploadResult = await uploadFileToDrive(
            selectedFile,
            (progressPayload) => {
              if (!progressPayload) return;
              setPendingUpload((prev) =>
                prev
                  ? {
                      ...prev,
                      progress: progressPayload.percent ?? prev.progress,
                      speed: progressPayload.speedBps ?? prev.speed,
                    }
                  : prev
              );
            },
            (abortFn) => {
              setPendingUpload((prev) => (prev ? { ...prev, abort: abortFn } : prev));
            }
          );

          setDriveAuthorized(true);

          driveFileId = uploadResult.driveFileId;
          fileName = uploadResult.fileName;
          fileSize = uploadResult.size;
          mimeType = uploadResult.mimeType;
          // Determine file category
          if (mimeType?.startsWith('image/')) {
            fileCategory = 'image';
          } else if (mimeType?.startsWith('video/')) {
            fileCategory = 'video';
          } else if (mimeType?.startsWith('audio/')) {
            fileCategory = 'audio';
          } else if (mimeType === 'application/pdf') {
            fileCategory = 'document';
          } else {
            fileCategory = 'file';
          }

          setPendingUpload(null);
        } catch (uploadError) {
          if (uploadError?.name === 'AbortError' || uploadError?.code === 'abort') {
            setPendingUpload((prev) =>
              prev ? { ...prev, status: 'cancelled', error: null } : null
            );
          } else {
            console.error('❌ File upload failed:', uploadError.message);
            if (uploadError?.type) {
              console.warn('GIS popup error type:', uploadError.type, uploadError);
            }

            setPendingUpload((prev) =>
              prev
                ? {
                    ...prev,
                    status: 'error',
                    error: uploadError.message || 'Upload failed',
                  }
                : null
            );
          }

          setSelectedFile(null);

          setIsSending(false);
          return;
        }
      }

      // Send text/link message if there's text
      const trimmed = inputMessage.trim();
      if (trimmed) {
        const foundUrl = extractFirstUrl(trimmed);
        const isLink = Boolean(foundUrl);
        const linkMeta = isLink ? buildLinkMeta(foundUrl, trimmed) : null;

        const { envelope, encryption } = await encryptPayload({
          type: isLink ? 'link' : 'text',
          text: trimmed,
          linkUrl: linkMeta?.linkUrl || null,
          linkTitle: linkMeta?.linkTitle || null,
          linkDescription: linkMeta?.linkDescription || null,
          linkImage: linkMeta?.linkImage || null,
        });

        await axios.post(
          `${API_URL}/api/messages`,
          {
            type: isLink ? 'link' : 'text',
            ciphertext: envelope.ciphertext,
            encryption,
            sender: senderPayload,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      // Send file message metadata if there's a file
      if (driveFileId) {
        const { envelope, encryption } = await encryptPayload({
          type: 'file',
          fileId: driveFileId,
          fileName,
          fileSize,
          mimeType,
          fileCategory,
          filePreviewUrl: getDriveContentUrl(driveFileId),
        });

        await axios.post(
          `${API_URL}/api/messages`,
          {
            type: 'file',
            fileCiphertext: envelope.ciphertext,
            encryption,
            sender: senderPayload,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
      }

      setInputMessage('');
      setSelectedFile(null);
      fetchMessages();
    } catch (error) {
      console.error('Error sending message:', error);
      alert(`Failed to send message: ${error.response?.data?.message || error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  const handlePauseUpload = useCallback(() => {
    if (pendingUpload?.abort) {
      pendingUpload.abort();
    }
  }, [pendingUpload]);

  const handleCancelUpload = useCallback(() => {
    if (pendingUpload?.abort) {
      pendingUpload.abort();
    }
    setPendingUpload(null);
    setSelectedFile(null);
    setIsSending(false);
  }, [pendingUpload]);

  const performDelete = async (message) => {
    const messageId = typeof message === 'string' ? message : message?.id;
    try {
      const token = await getToken();
      if (!token) return;

      const fileId = typeof message === 'object' ? message?.fileId : null;
      if (fileId) {
        try {
          await deleteFileFromDrive(fileId);
        } catch (driveErr) {
          console.warn('Drive delete during message removal failed', driveErr?.message);
        }
      }

      await axios.delete(`${API_URL}/api/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await dexieDeleteMessage(user?.id, messageId);
      setDeleteErrors((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
      fetchMessages();
    } catch (error) {
      console.error('Error deleting message:', error);
      setDeleteErrors((prev) => ({ ...prev, [messageId]: error.message || 'Delete failed' }));
    } finally {
      setConfirmDelete(null);
    }
  };

  const toggleStar = async (messageId, isStarred) => {
    try {
      const token = await getToken();
      if (!token) return;

      await axios.patch(
        `${API_URL}/api/messages/${messageId}`,
        {
          starred: !isStarred,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setMessages((prev) => {
        const next = prev
          .map((m) => (m.id === messageId ? { ...m, starred: !isStarred, expiresAt: null } : m))
          .filter((m) => (showStarredOnly && isStarred ? m.starred : true));
        const updated = next.find((m) => m.id === messageId);
        if (updated) {
          upsertMessage(user?.id, updated);
        }
        return next;
      });
    } catch (error) {
      console.error('Error toggling star:', error);
      alert('Failed to toggle star');
    }
  };

  const handleSignOut = async () => {
    await cleanupUserSession(user?.id, { preserveLastSeen: true });
    await signOut();
    navigate('/');
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const getFileIcon = (filename) => {
    if (!filename) return <File className="w-4 h-4" />;
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      return <ImageIcon className="w-4 h-4" />;
    }
    return <FileText className="w-4 h-4" />;
  };

  const handleContextMenu = (e, message) => {
    e.preventDefault();

    // Calculate position with boundary checks
    const menuWidth = 200; // Approximate context menu width
    const menuHeight = 200; // Approximate context menu height
    const padding = 10;

    let x = e.clientX;
    let y = e.clientY;

    // Adjust if too close to right edge
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - padding;
    }

    // Adjust if too close to bottom edge
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - padding;
    }

    // Ensure not too close to left/top edges
    x = Math.max(padding, x);
    y = Math.max(padding, y);

    setContextMenu({
      x,
      y,
      message,
    });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleDownloadFile = async (message) => {
    if (!message.fileId) return;

    setDownloadStates((prev) => ({
      ...prev,
      [message.id]: { status: 'downloading', progress: 0, speed: 0, error: null },
    }));

    try {
      const blob = await downloadFileFromDrive(message.fileId, message.mimeType, (progress) => {
        setDownloadStates((prev) => ({
          ...prev,
          [message.id]: {
            status: 'downloading',
            progress: progress.percent,
            speed: progress.speedBps,
            error: null,
          },
        }));
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = message.fileName || 'download';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setDownloadStates((prev) => ({
        ...prev,
        [message.id]: { status: 'done', progress: 100, speed: 0, error: null },
      }));
      setTimeout(() => {
        setDownloadStates((prev) => {
          const next = { ...prev };
          delete next[message.id];
          return next;
        });
      }, 1500);
    } catch (error) {
      console.error('Download error:', error);
      setDownloadStates((prev) => ({
        ...prev,
        [message.id]: { status: 'error', progress: null, speed: 0, error: error.message },
      }));
    }

    closeContextMenu();
  };

  // Helper to get Drive URL for display (files are public via "anyone with link")
  const getFileDisplayUrl = useCallback((fileId) => {
    return getDriveContentUrl(fileId);
  }, []);

  // Helper to get thumbnail URL for images
  const getThumbnailUrl = useCallback((fileId, size = 200) => {
    return getDriveThumbnailUrl(fileId, size);
  }, []);

  const handleEditMessage = async () => {
    if (!editText.trim() || !editingMessage) return;

    if (!mek) {
      setEncryptionError('Encryption key missing. Return to PreChat to unlock.');
      return;
    }

    try {
      const token = await getToken();
      if (!token) return;

      const target = messages.find((m) => m.id === editingMessage);
      if (!target) return;

      const { envelope, encryption } = await encryptPayload({
        type: target.type,
        text: editText.trim(),
        linkUrl: target.linkUrl || null,
        linkTitle: target.linkTitle || null,
        linkDescription: target.linkDescription || null,
        linkImage: target.linkImage || null,
      });

      await axios.patch(
        `${API_URL}/api/messages/${editingMessage}`,
        { ciphertext: envelope.ciphertext, encryption },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setEditingMessage(null);
      setEditText('');
      fetchMessages();
    } catch (error) {
      console.error('Error editing message:', error);
      alert('Failed to edit message');
    }
  };

  const handleCopyMessage = async (message) => {
    const writeTextSafe = async (text) => {
      const value = text || '';
      if (navigator.clipboard?.writeText) {
        try {
          window?.focus?.();
          await navigator.clipboard.writeText(value);
          return true;
        } catch (clipboardErr) {
          console.warn('Clipboard writeText blocked, falling back', clipboardErr?.message);
        }
      }
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
      return true;
    };

    try {
      const fileLink = message.fileId ? getDriveContentUrl(message.fileId) : '';

      if (
        message.type === 'file' &&
        message.fileId &&
        navigator.clipboard?.write &&
        typeof ClipboardItem !== 'undefined'
      ) {
        try {
          const blob = await downloadFileFromDrive(message.fileId, message.mimeType);
          if (blob?.type) {
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
            closeContextMenu();
            return;
          }
        } catch (binaryErr) {
          console.warn('Binary clipboard write failed, falling back to link', binaryErr?.message);
        }

        await writeTextSafe(fileLink || message.fileName || message.text || '');
        closeContextMenu();
        return;
      }

      // Non-file or no clipboard write support: always copy a link/text
      const textToCopy =
        message.type === 'file' && message.fileId
          ? fileLink
          : message.text || message.fileName || '';
      await writeTextSafe(textToCopy || '');
    } catch (err) {
      console.warn('Copy failed, final fallback to link/text', err?.message);
      const fileLink = message.fileId ? getDriveContentUrl(message.fileId) : '';
      await writeTextSafe(fileLink || message.text || message.fileName || '');
    } finally {
      closeContextMenu();
    }
  };

  const handleViewFile = (message) => {
    if (message.filePreviewUrl) {
      window.open(message.filePreviewUrl, '_blank');
    }
    closeContextMenu();
  };

  const startEdit = (message) => {
    setEditingMessage(message.id);
    setEditText(message.text || '');
    closeContextMenu();
  };

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu]);

  if (!encryptionReady) {
    return (
      <EncryptionGate
        ready={encryptionReady}
        error={encryptionError}
        onReenter={() => navigate('/prechat', { replace: false })}
        onHome={() => navigate('/', { replace: true })}
      />
    );
  }

  return (
    <div className="h-screen bg-gray-950 flex overflow-hidden">
      <DeleteConfirmModal
        confirmDelete={confirmDelete}
        onConfirm={() => performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
      <ChatSidebar
        user={user}
        session={session}
        driveAuthorized={driveAuthorized}
        showSidebar={showSidebar}
        setShowSidebar={setShowSidebar}
        navigate={navigate}
        onSignOut={handleSignOut}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full">
        <ChatHeader
          messagesCount={messages.length}
          showStarredOnly={showStarredOnly}
          setShowStarredOnly={setShowStarredOnly}
          showSearch={showSearch}
          setShowSearch={setShowSearch}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setShowSidebar={setShowSidebar}
        />

        {/* Messages Area */}
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4"
          style={{
            backgroundImage: "url('/minimalist-bg.jpg')",
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundColor: 'rgba(0,0,0,0.35)',
            backgroundBlendMode: 'overlay',
          }}
        >
          <ChatBody
            messages={messages}
            isLoading={isLoadingMessages}
            showStarredOnly={showStarredOnly}
            pendingUpload={pendingUpload}
            formatBytes={formatBytes}
            handlePauseUpload={handlePauseUpload}
            handleCancelUpload={handleCancelUpload}
            currentDevice={currentDevice}
            editingMessage={editingMessage}
            editText={editText}
            setEditText={setEditText}
            setEditingMessage={setEditingMessage}
            handleEditMessage={handleEditMessage}
            handleContextMenu={handleContextMenu}
            handleDownloadFile={handleDownloadFile}
            toggleStar={toggleStar}
            setConfirmDelete={setConfirmDelete}
            closeContextMenu={closeContextMenu}
            downloadStates={downloadStates}
            deleteErrors={deleteErrors}
            getFileDisplayUrl={getFileDisplayUrl}
            getThumbnailUrl={getThumbnailUrl}
            getFileIcon={getFileIcon}
          />
          <div ref={messagesEndRef} />
        </div>

        <MessageContextMenu
          contextMenu={contextMenu}
          onToggleStar={(id, starred) => {
            toggleStar(id, starred);
            closeContextMenu();
          }}
          onEdit={(msg) => startEdit(msg)}
          onCopy={(msg) => handleCopyMessage(msg)}
          onView={(msg) => handleViewFile(msg)}
          onDownload={(msg) => handleDownloadFile(msg)}
          onDelete={(msg) => {
            setConfirmDelete(msg);
            closeContextMenu();
          }}
        />

        <MessageInput
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          inputMessage={inputMessage}
          setInputMessage={setInputMessage}
          sendMessage={sendMessage}
          isSending={isSending}
          handleFileSelect={handleFileSelect}
          getFileIcon={getFileIcon}
        />
      </div>
    </div>
  );
}
