import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useUser, useSession } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  Star,
  StarOff,
  Menu,
  X,
  Edit,
  Copy,
  Eye,
  Trash2,
  Paperclip,
  Send,
  Settings,
  LogOut,
  Filter,
  Search,
  Clock,
  File,
  ImageIcon,
  FileText,
} from 'lucide-react';
import {
  initializeDevice,
  getCurrentDevice,
  isDeviceRegistered,
  getDeviceIcon,
  DEVICE_TYPES,
} from '../utils/deviceManager';
import FilePreview from './FilePreview';
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
  const fileInputRef = useRef(null);
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
      {/* Sidebar */}
      <div
        className={`${
          showSidebar ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:relative z-40 w-72 bg-gray-900 border-r border-gray-800 transition-transform duration-200 h-full flex flex-col`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-linear-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-xl">💬</span>
            </div>
            <span className="font-bold text-white">DriveChat</span>
          </div>
          <button
            onClick={() => setShowSidebar(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Profile */}
        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3 mb-4">
            <img
              src={user?.imageUrl || 'https://via.placeholder.com/40'}
              alt={user?.fullName || user?.firstName || 'User'}
              className="w-10 h-10 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">
                {user?.fullName || user?.firstName || 'User'}
              </p>
              <p className="text-gray-400 text-sm truncate">
                {user?.primaryEmailAddress?.emailAddress || 'user@email.com'}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/starred')}
            className="w-full px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 rounded-lg transition-colors flex items-center justify-center gap-2 font-medium"
          >
            <Star className="w-4 h-4" />
            View Starred Messages
          </button>
        </div>

        {/* Settings */}
        <div className="flex-1 p-4">
          <div className="space-y-2">
            <button
              onClick={() => navigate('/settings')}
              className="w-full px-4 py-2 text-left text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-3"
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
            <button
              onClick={() => {
                console.log('=== FULL DEBUG INFO ===');
                console.log('User object:', JSON.stringify(user, null, 2));
                console.log('External accounts:', user?.externalAccounts);
                console.log('Session object:', JSON.stringify(session, null, 2));
                console.log('Drive authorized state:', driveAuthorized);

                const clerkGoogle = user?.externalAccounts?.find((a) => a.provider === 'google');
                const statusMsg = driveAuthorized
                  ? '✅ Google Drive is connected for file uploads'
                  : "⚠️ Google Drive authorization needed.\n\nWhen you upload a file, you'll be prompted to sign in.";

                alert(
                  `User: ${user?.firstName || 'Unknown'}\nEmail: ${user?.primaryEmailAddress?.emailAddress || 'N/A'}\n\n${statusMsg}\n\nCheck browser console for full details!`
                );
              }}
              className="w-full px-4 py-2 text-left text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex items-center gap-3 text-xs"
            >
              Debug User Data
            </button>
          </div>
        </div>

        {/* Sign Out */}
        <div className="p-4 border-t border-gray-800">
          <button
            onClick={handleSignOut}
            className="w-full px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full">
        {/* Chat Header */}
        <div className="bg-gray-900 border-b border-gray-800 p-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSidebar(true)}
              className="lg:hidden text-gray-400 hover:text-white"
            >
              <Menu className="w-6 h-6" />
            </button>

            {/* Animated Header Title */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="w-8 h-8 bg-linear-to-br from-blue-500 via-purple-500 to-pink-500 rounded-lg flex items-center justify-center shadow-lg shrink-0">
                <span className="text-lg">💬</span>
              </div>
              {!showSearch ? (
                <div className="flex flex-col min-w-0 flex-1">
                  <h2 className="font-bold text-lg bg-linear-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent truncate">
                    DriveChat
                  </h2>
                  <p className="text-xs text-gray-400 truncate">
                    {showStarredOnly ? 'Starred Messages' : `${messages.length} messages`}
                  </p>
                </div>
              ) : (
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 px-3 py-1.5 bg-gray-800 text-white text-sm rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none min-w-0"
                  autoFocus
                />
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowStarredOnly(!showStarredOnly);
                  if (!showStarredOnly) {
                    // When enabling starred filter, clear search
                    setShowSearch(false);
                    setSearchQuery('');
                  }
                }}
                className={`p-2 ${
                  showStarredOnly
                    ? 'text-yellow-400 bg-yellow-400/10'
                    : 'text-gray-400 hover:bg-gray-800'
                } hover:text-yellow-300 rounded-lg transition-colors`}
                title={showStarredOnly ? 'Show all messages' : 'Show only starred messages'}
              >
                <Filter className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setShowSearch(!showSearch);
                  if (!showSearch) setSearchQuery('');
                }}
                className={`p-2 ${
                  showSearch ? 'text-blue-400 bg-blue-400/10' : 'text-gray-400 hover:bg-gray-800'
                } hover:text-blue-300 rounded-lg transition-colors`}
              >
                <Search className="w-5 h-5" />
              </button>
              <div className="hidden md:flex items-center gap-2 text-sm text-gray-400 px-3 py-1.5 bg-gray-800/50 rounded-lg">
                <Clock className="w-4 h-4" />
                <span>24h</span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {pendingUpload && (
            <div className="flex gap-3 justify-end opacity-90">
              <div className="flex flex-col max-w-md">
                <div className="px-4 py-3 rounded-lg bg-blue-900/60 text-white relative">
                  <div className="flex items-center gap-2 text-sm mb-1">
                    <Paperclip className="w-4 h-4" />
                    <span className="truncate font-semibold">{pendingUpload.fileName}</span>
                  </div>
                  <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-blue-400"
                      style={{ width: `${pendingUpload.progress || 0}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-200">
                    <span>
                      {pendingUpload.status === 'uploading'
                        ? `${pendingUpload.progress || 0}%`
                        : pendingUpload.status === 'error'
                          ? 'Failed'
                          : 'Done'}
                    </span>
                    <span>
                      {pendingUpload.speed ? `${formatBytes(pendingUpload.speed)}/s` : ''}
                    </span>
                  </div>
                  {pendingUpload.error && (
                    <p className="text-xs text-red-200 mt-2">{pendingUpload.error}</p>
                  )}
                </div>
              </div>
            </div>
          )}
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
            messages.map((message) => {
              // Check if the message belongs to the current device
              const isSentByMe = message.sender?.deviceId === currentDevice?.deviceId;
              const isEditing = editingMessage === message.id;
              const deviceType = message.sender?.deviceType || DEVICE_TYPES.GUEST;
              const deviceName = message.sender?.deviceName || 'Guest Device';
              const deviceIcon = getDeviceIcon(deviceType);
              const downloadState = downloadStates[message.id];
              const deleteError = deleteErrors[message.id];

              return (
                <div
                  key={message.id}
                  className={`flex gap-3 ${isSentByMe ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Device Avatar - Left side for others */}
                  {!isSentByMe && (
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center border-2 border-gray-600 shrink-0">
                        <img src={deviceIcon} alt={deviceType} className="w-5 h-5 text-gray-300" />
                      </div>
                    </div>
                  )}

                  {/* Message Content */}
                  <div className="flex flex-col max-w-md">
                    {/* Device Name */}
                    <div
                      className={`text-xs text-gray-400 mb-1 px-1 ${isSentByMe ? 'text-right' : 'text-left'}`}
                    >
                      {deviceName}
                    </div>

                    <div
                      className={`px-4 py-3 rounded-lg ${
                        isSentByMe ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-100'
                      } relative group`}
                      onContextMenu={(e) => handleContextMenu(e, message)}
                    >
                      {message.type === 'text' && message.text && (
                        <>
                          {isEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleEditMessage();
                                  if (e.key === 'Escape') {
                                    setEditingMessage(null);
                                    setEditText('');
                                  }
                                }}
                                className="w-full px-2 py-1 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={handleEditMessage}
                                  className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white text-xs rounded"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => {
                                    setEditingMessage(null);
                                    setEditText('');
                                  }}
                                  className="px-2 py-1 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="wrap-break-word">
                              {message.text}
                              {message.edited && (
                                <span className="text-xs opacity-60 ml-2">(edited)</span>
                              )}
                            </p>
                          )}
                        </>
                      )}
                      {message.type === 'file' && message.fileName && (
                        <div
                          className="flex flex-col gap-2"
                          onDoubleClick={() =>
                            message.fileId &&
                            window.open(
                              `https://drive.google.com/file/d/${message.fileId}/view`,
                              '_blank'
                            )
                          }
                        >
                          <FilePreview
                            message={message}
                            getFileUrl={getFileDisplayUrl}
                            getThumbnailUrl={getThumbnailUrl}
                          />

                          {/* File info */}
                          <div className="flex items-center gap-2 text-sm">
                            {getFileIcon(message.fileName)}
                            <span className="truncate font-medium">{message.fileName}</span>
                          </div>
                          {message.fileSize && (
                            <p className="text-xs opacity-75">{formatBytes(message.fileSize)}</p>
                          )}

                          {downloadState && (
                            <div className="mt-1 text-xs">
                              {downloadState.status === 'downloading' && (
                                <div className="space-y-1">
                                  <div className="w-full h-1.5 bg-black/20 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-blue-400"
                                      style={{ width: `${downloadState.progress || 0}%` }}
                                    />
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-gray-200">
                                    <span>
                                      {downloadState.progress
                                        ? `${downloadState.progress}%`
                                        : '...'}
                                    </span>
                                    <span>
                                      {downloadState.speed
                                        ? `${formatBytes(downloadState.speed)}/s`
                                        : ''}
                                    </span>
                                  </div>
                                </div>
                              )}
                              {downloadState.status === 'error' && (
                                <div className="text-red-300 flex items-center justify-between gap-2">
                                  <span>{downloadState.error || 'Download failed'}</span>
                                  <button
                                    onClick={() => handleDownloadFile(message)}
                                    className="px-2 py-1 bg-red-500/20 rounded text-white text-[11px]"
                                  >
                                    Retry
                                  </button>
                                </div>
                              )}
                              {downloadState.status === 'done' && (
                                <span className="text-green-300">Downloaded</span>
                              )}
                            </div>
                          )}

                          {deleteError && (
                            <div className="text-xs text-red-300 mt-1">{deleteError}</div>
                          )}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2 text-xs opacity-75">
                        <span>{dayjs(message.timestamp).fromNow()}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={() => toggleStar(message.id, message.starred)}
                            className="hover:scale-110 transition-transform"
                          >
                            {message.starred ? (
                              <Star className="w-3 h-3 fill-current" />
                            ) : (
                              <StarOff className="w-3 h-3" />
                            )}
                          </button>
                          {isSentByMe && (
                            <button
                              onClick={() => {
                                setConfirmDelete(message);
                                closeContextMenu();
                              }}
                              className="hover:scale-110 transition-transform text-red-400"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        {deleteError && (
                          <div className="text-xs text-red-300 mt-1">{deleteError}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Device Avatar - Right side for own messages */}
                  {isSentByMe && (
                    <div className="flex flex-col items-center gap-1 mt-1">
                      <div className="w-10 h-10 rounded-full bg-blue-700 flex items-center justify-center border-2 border-blue-500 shrink-0">
                        <img src={deviceIcon} alt={deviceType} className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 z-50"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={() => {
                toggleStar(contextMenu.message.id, contextMenu.message.starred);
                closeContextMenu();
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
            >
              {contextMenu.message.starred ? (
                <>
                  <StarOff className="w-4 h-4" /> Unstar
                </>
              ) : (
                <>
                  <Star className="w-4 h-4" /> Star
                </>
              )}
            </button>
            {contextMenu.message.type === 'text' && (
              <button
                onClick={() => startEdit(contextMenu.message)}
                className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
              >
                <Edit className="w-4 h-4" /> Edit
              </button>
            )}
            <button
              onClick={() => handleCopyMessage(contextMenu.message)}
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
            >
              <Copy className="w-4 h-4" /> Copy
            </button>
            {contextMenu.message.type === 'file' && contextMenu.message.fileId && (
              <>
                <button
                  onClick={() => handleViewFile(contextMenu.message)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                >
                  <Eye className="w-4 h-4" /> View
                </button>
                <button
                  onClick={() => handleDownloadFile(contextMenu.message)}
                  className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download
                </button>
              </>
            )}
            <button
              onClick={() => {
                setConfirmDelete(contextMenu.message);
                closeContextMenu();
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-gray-700 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          </div>
        )}

        {/* Input Area */}
        <div className="bg-gray-900 border-t border-gray-800 p-4">
          {selectedFile && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg text-sm text-gray-300">
                {getFileIcon(selectedFile.name)}
                <span className="truncate max-w-xs">{selectedFile.name}</span>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-gray-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 px-4 py-3 bg-gray-800 text-white rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={sendMessage}
              disabled={(!inputMessage.trim() && !selectedFile) || isSending}
              className="p-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center"
            >
              {isSending ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
