import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth, useUser, useSession } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { File, ImageIcon, FileText } from 'lucide-react';
import {
  initializeDevice,
  getCurrentDevice,
  isDeviceRegistered,
  getDeviceIcon,
  DEVICE_TYPES,
} from '../utils/deviceManager';
import MessageItem from './chat/MessageItem';
import MessageContextMenu from './chat/MessageContextMenu';
import ChatSidebar from './chat/ChatSidebar';
import ChatHeader from './chat/ChatHeader';
import PendingUploadBanner from './chat/PendingUploadBanner';
import MessageInput from './chat/MessageInput';
import {
  clearMessages,
  deleteMessage as dexieDeleteMessage,
  loadMessages,
  upsertMessage,
  clearAllUserData,
} from '../db/dexie';
import { createRealtimeClient } from '../utils/realtimeClient';
import {
  initGisClient,
  getAccessToken,
  hasValidToken,
  uploadFileToDrive,
  deleteFileFromDrive,
  getDriveContentUrl,
  getDriveThumbnailUrl,
  revokeToken,
  clearStoredToken,
  downloadFileFromDrive,
} from '../utils/gisClient';

dayjs.extend(relativeTime);

const API_URL =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';
const ENABLE_REALTIME =
  String(import.meta.env.VITE_ENABLE_REALTIME || 'false').toLowerCase() === 'true';

export default function ChatInterface() {
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const { session } = useSession();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
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
  const messagesEndRef = useRef(null);
  const realtimeRef = useRef(null);
  const [showDrivePrompt, setShowDrivePrompt] = useState(false);
  const [authState, setAuthState] = useState({ status: 'idle', message: '' });

  const formatBytes = (bytes = 0, decimals = 1) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const getDayLabel = (dateKey) => {
    const date = dayjs(dateKey, 'YYYY-MM-DD');
    const today = dayjs().startOf('day');
    const yesterday = today.subtract(1, 'day');

    if (date.isSame(today, 'day')) return 'Today';
    if (date.isSame(yesterday, 'day')) return 'Yesterday';
    if (date.isSame(today, 'year')) return date.format('MMMM D');
    return date.format('MMMM D, YYYY');
  };
  // Initialize GIS on mount
  useEffect(() => {
    initGisClient();
    const authorized = hasValidToken();
    setDriveAuthorized(authorized);
    setShowDrivePrompt(!authorized);
  }, []);

  useEffect(() => {
    console.info('[ChatInterface] realtime config', {
      ENABLE_REALTIME,
      userId: user?.id || 'not-signed-in',
      deviceId: currentDevice?.deviceId || 'no-device',
    });
  }, [ENABLE_REALTIME, user?.id, currentDevice?.deviceId]);

  // Helper functions - defined before useEffect hooks that use them
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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

      let url = `${API_URL}/api/messages`;

      // If showing starred only, fetch from starred endpoint
      if (showStarredOnly) {
        url = `${API_URL}/api/messages/category/starred`;
        console.log('Fetching starred messages from:', url);
      } else if (searchQuery.trim()) {
        url = `${API_URL}/api/messages/search?q=${encodeURIComponent(searchQuery)}`;
        console.log('Searching messages:', searchQuery);
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      console.log('Received messages:', response.data.messages?.length, 'messages');

      // Reverse the order so newest messages appear at the bottom
      const sortedMessages = (response.data.messages || []).sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );

      setMessages(sortedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setMessages([]);
      // If starred filter fails, try client-side filtering instead
      if (showStarredOnly && error.response?.status === 500) {
        console.log('Falling back to client-side starred filtering');
        try {
          const token = await getToken();
          if (!token) return;

          const response = await axios.get(`${API_URL}/api/messages`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const allMessages = response.data.messages || [];
          const starredMessages = allMessages.filter((msg) => msg.starred === true);
          const sortedMessages = starredMessages.sort(
            (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
          );
          setMessages(sortedMessages);
        } catch (fallbackError) {
          console.error('Fallback also failed:', fallbackError);
        }
      }
    }
  }, [getToken, showStarredOnly, searchQuery]);

  // useEffect hooks

  useEffect(() => {
    const fetch = async () => {
      await fetchMessages();
    };
    fetch();
  }, [searchQuery, showStarredOnly, fetchMessages]);

  // On sign-in / app load, reconcile any pending Drive deletions (offline sync)
  useEffect(() => {
    if (!user?.id) return;
    syncPendingDeletions();
  }, [user?.id, syncPendingDeletions]);

  // Load cached messages early (realtime mode)
  useEffect(() => {
    const run = async () => {
      if (!ENABLE_REALTIME) return;
      if (!user?.id) return;
      try {
        const cached = await loadMessages(user.id, 1000);
        if (cached?.length) {
          const sorted = cached.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
          setMessages(sorted);
        }
      } catch (e) {
        console.warn('Failed to load cached messages:', e?.message);
      }
    };
    run();
  }, [user?.id]);

  useEffect(() => {
    console.info('[ChatInterface] realtimeConnected changed', realtimeConnected);
    const interval = setInterval(() => {
      // Only auto-refresh if: not searching, not filtering starred, and document is visible
      const usingPolling = !ENABLE_REALTIME || !realtimeConnected;
      if (
        usingPolling &&
        !searchQuery &&
        !showStarredOnly &&
        document.visibilityState === 'visible'
      ) {
        console.info('[ChatInterface] polling triggered', {
          usingPolling,
          realtimeConnected,
          searchQuery: searchQuery || 'empty',
          showStarredOnly,
        });
        fetchMessages();
      }
    }, 2000); // Poll every 2 seconds for faster preview updates
    return () => clearInterval(interval);
  }, [searchQuery, showStarredOnly, realtimeConnected, fetchMessages]);

  // Connect realtime (Socket.IO + Redis Streams)
  useEffect(() => {
    const run = async () => {
      if (!ENABLE_REALTIME) return;
      if (!user?.id) return;
      if (!currentDevice?.deviceId) return;
      if (realtimeRef.current) return;

      console.info('[ChatInterface] realtime effect start', {
        userId: user.id,
        deviceId: currentDevice.deviceId,
        realtimeRefExists: Boolean(realtimeRef.current),
      });

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
              await upsertMessage(user.id, msg);
              setMessages((prev) => {
                const exists = prev.some((m) => m.id === msg.id);
                const next = exists ? prev.map((m) => (m.id === msg.id ? msg : m)) : [...prev, msg];
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
              console.info('[ChatInterface] drive.delete.request received:', driveFileId);
              try {
                await deleteFileFromDrive(driveFileId);
                console.info('[ChatInterface] Drive file deleted:', driveFileId);
                // ACK the deletion to the server
                realtimeRef.current?.socket?.emit('ack-drive-delete', { driveFileId });
              } catch (err) {
                console.warn('[ChatInterface] Failed to delete Drive file:', err?.message);
              }
              return;
            }
          },
        });
        console.info('[ChatInterface] realtime client initialized', {
          userId: user.id,
          deviceId: currentDevice.deviceId,
          socketId: realtimeRef.current?.socket?.id,
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
  }, [user?.id, currentDevice?.deviceId, getToken]);

  // Initialize device on mount
  useEffect(() => {
    const device = initializeDevice();
    setCurrentDevice(device);
    console.log('Device initialized:', device);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const sendMessage = async () => {
    if (!inputMessage.trim() && !selectedFile) return;
    if (isSending) return; // Prevent double-sending

    setIsSending(true);

    try {
      const token = await getToken();
      if (!token) {
        alert('Authentication required');
        setIsSending(false);
        return;
      }

      console.log('\n💬 [sendMessage] Starting message send...');

      // Get device info from currentDevice state
      const device = currentDevice || initializeDevice();
      if (!currentDevice) setCurrentDevice(device);

      // If file is selected, upload to Google Drive (client-side)
      let driveFileId = null;
      let fileName = null;
      let fileSize = null;
      let mimeType = null;
      let fileCategory = null;
      let webViewLink = null;
      let webContentLink = null;

      if (selectedFile) {
        console.log('   - 📎 File selected:', selectedFile.name);
        setPendingUpload({
          fileName: selectedFile.name,
          progress: 0,
          speed: 0,
          status: 'uploading',
          error: null,
        });
        try {
          console.log('   - 📤 Uploading file to Google Drive (client-side)...');

          const uploadResult = await uploadFileToDrive(selectedFile, (progressPayload) => {
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
          });

          console.log('   - ✅ File uploaded successfully:', uploadResult.fileName);
          setDriveAuthorized(true);

          driveFileId = uploadResult.driveFileId;
          fileName = uploadResult.fileName;
          fileSize = uploadResult.size;
          mimeType = uploadResult.mimeType;
          webViewLink = uploadResult.webViewLink;
          webContentLink = uploadResult.webContentLink;

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

          setSelectedFile(null);

          setIsSending(false);
          return;
        }
      }

      // Send text message if there's text
      if (inputMessage.trim()) {
        await axios.post(
          `${API_URL}/api/messages`,
          {
            type: 'text',
            text: inputMessage.trim(),
            sender: {
              deviceId: device.deviceId,
              deviceName: device.name,
              deviceType: device.type,
            },
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
        await axios.post(
          `${API_URL}/api/messages`,
          {
            type: 'file',
            // Store Drive file ID directly (no encryption for now)
            fileId: driveFileId,
            fileName,
            fileSize,
            mimeType,
            fileCategory,
            // Store direct Drive URLs
            filePreviewUrl: getDriveContentUrl(driveFileId),
            sender: {
              deviceId: device.deviceId,
              deviceName: device.name,
              deviceType: device.type,
            },
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

  const performDelete = async (messageId) => {
    try {
      const token = await getToken();
      if (!token) return;

      await axios.delete(`${API_URL}/api/messages/${messageId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteErrors((prev) => {
        const next = { ...prev };
        delete next[messageId];
        return next;
      });
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

      console.log(
        'Toggling star:',
        messageId,
        'Current starred:',
        isStarred,
        'New starred:',
        !isStarred
      );

      await axios.patch(
        `${API_URL}/api/messages/${messageId}`,
        {
          starred: !isStarred,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // Refetch messages to update the UI
      await fetchMessages();
    } catch (error) {
      console.error('Error toggling star:', error);
      alert('Failed to toggle star');
    }
  };

  const handleSignOut = async () => {
    try {
      await clearAllUserData(user?.id);
    } catch (err) {
      console.warn('Failed to clear Dexie on sign-out', err?.message);
    }

    try {
      revokeToken();
      clearStoredToken();
    } catch (err) {
      console.warn('Failed to clear GIS token on sign-out', err?.message);
    }

    try {
      localStorage.removeItem('drivechat_prechat_passed');
    } catch (err) {
      console.warn('Failed to clear prechat flag on sign-out', err?.message);
    }

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

  const timelineItems = useMemo(() => {
    const items = [];
    let lastDate = null;

    messages.forEach((message) => {
      const dateKey = dayjs(message.timestamp).format('YYYY-MM-DD');
      if (dateKey !== lastDate) {
        items.push({ type: 'separator', date: dateKey });
        lastDate = dateKey;
      }
      items.push({ type: 'message', message });
    });

    return items;
  }, [messages]);

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

    try {
      const token = await getToken();
      if (!token) return;

      await axios.patch(
        `${API_URL}/api/messages/${editingMessage}`,
        { text: editText.trim() },
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

  const requestDriveAccess = async () => {
    try {
      setDriveAuthorized(false);
      setShowDrivePrompt(false);
      setAuthState({ status: 'authorizing', message: 'Requesting Google Drive access...' });

      const loginHint = user?.primaryEmailAddress?.emailAddress;
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('popup_closed_or_blocked')), 25000)
      );

      await Promise.race([getAccessToken({ prompt: 'consent', login_hint: loginHint }), timeout]);

      setDriveAuthorized(true);
      setAuthState({ status: 'done', message: '' });
      window?.focus?.();
    } catch (err) {
      console.warn('Drive consent failed:', err?.type || err?.message || err);
      const humanMessage =
        err?.message === 'popup_closed_or_blocked'
          ? 'The Google window was closed or blocked. Please allow popups and try again.'
          : err?.message || 'Drive access failed. Please try again.';
      setAuthState({ status: 'error', message: humanMessage });
      setShowDrivePrompt(true);
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

  if (authState.status === 'authorizing' || authState.status === 'error') {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-md w-full text-center space-y-4">
          {authState.status === 'authorizing' ? (
            <>
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-white text-lg font-semibold">Connecting Google Drive...</p>
              <p className="text-gray-400 text-sm">
                Keep this window open while we complete Drive consent. The popup will close when
                finished.
              </p>
            </>
          ) : (
            <>
              <p className="text-red-400 text-lg font-semibold">Drive access failed</p>
              <p className="text-gray-300 text-sm whitespace-pre-wrap">{authState.message}</p>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={requestDriveAccess}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  Retry
                </button>
                <button
                  onClick={() => setAuthState({ status: 'idle', message: '' })}
                  className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-950 flex overflow-hidden">
      {confirmDelete && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-sm shadow-xl text-center space-y-4">
            <p className="text-white text-lg font-semibold">Delete this message?</p>
            <p className="text-gray-300 text-sm">
              This will remove the message and its file (if any) from DriveChat.
            </p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => performDelete(confirmDelete.id)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {showDrivePrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-white text-lg font-semibold mb-2">Connect Google Drive</h3>
            <p className="text-gray-300 text-sm mb-4">
              DriveChat needs Drive access to upload and delete your files. Click below to grant
              access. This should appear once right after sign-in.
            </p>
            <div className="space-y-3">
              <button
                onClick={requestDriveAccess}
                className="w-full py-2 px-4 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors"
              >
                Grant Drive Access
              </button>
              <p className="text-xs text-gray-400 text-center">
                If a popup is blocked or auto-closed, allow popups for this site and try again.
              </p>
            </div>
          </div>
        </div>
      )}
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
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <PendingUploadBanner pendingUpload={pendingUpload} formatBytes={formatBytes} />
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <p className="text-lg mb-2">
                  {showStarredOnly ? 'No starred messages' : 'No messages yet'}
                </p>
                <p className="text-sm">
                  {showStarredOnly
                    ? 'Star messages to see them here'
                    : 'Send your first message below'}
                </p>
              </div>
            </div>
          ) : (
            timelineItems.map((item) =>
              item.type === 'separator' ? (
                <div key={`separator-${item.date}`} className="flex justify-center">
                  <span className="px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 bg-gray-900/70 border border-gray-800 rounded-full shadow-sm">
                    {getDayLabel(item.date)}
                  </span>
                </div>
              ) : (
                <MessageItem
                  key={item.message.id}
                  message={item.message}
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
                  formatBytes={formatBytes}
                  downloadState={downloadStates[item.message.id]}
                  deleteError={deleteErrors[item.message.id]}
                  getFileDisplayUrl={getFileDisplayUrl}
                  getThumbnailUrl={getThumbnailUrl}
                  getFileIcon={getFileIcon}
                />
              )
            )
          )}
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
