import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import {
  Star,
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  File,
  Video,
  Music,
  Archive,
  Trash2,
  LayoutGrid,
  List,
  ExternalLink,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import dayjs from 'dayjs';
import FilePreview from './FilePreview';
import { getDriveContentUrl, getDriveThumbnailUrl } from '../utils/gisClient';
import Skeleton from './ui/Skeleton';
import { loadMessages, upsertMessage } from '../db/dexie';
import { initializeDevice } from '../utils/deviceManager';
import { createRealtimeClient } from '../utils/realtimeClient';

const urlRegex = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;

const renderTextWithLinks = (text = '') => {
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (!part) return null;
    const isUrl = urlRegex.test(part);
    urlRegex.lastIndex = 0;
    if (isUrl) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a
          key={`link-${idx}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="underline text-blue-200 hover:text-white break-words"
        >
          {part}
        </a>
      );
    }
    return (
      <span key={`text-${idx}`} className="break-words">
        {part}
      </span>
    );
  });
};

const containsUrl = (text = '') => {
  if (!text) return false;
  urlRegex.lastIndex = 0;
  return urlRegex.test(text);
};

const extractFirstUrl = (text = '') => {
  const regex = /(https?:\/\/[^^\s]+)|(www\.[^\s]+)/i;
  const match = text?.match(regex);
  return match ? match[0] : null;
};

const API_URL =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

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
  const realtimeRef = useRef(null);
  const fetchedOnceRef = useRef(false);

  const formatBytes = (bytes = 0, decimals = 1) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  };

  const loadCached = useCallback(async () => {
    if (!user?.id) return;
    const cached = await loadMessages(user.id, 1000);
    const starred = cached.filter((m) => m.starred);
    setStarredMessages(starred);
  }, [user?.id]);

  useEffect(() => {
    loadCached();
  }, [loadCached]);

  // Initialize device once
  useEffect(() => {
    const device = initializeDevice();
    setCurrentDevice(device);
  }, []);

  const fetchStarredMessages = useCallback(async () => {
    try {
      setSyncing(true);
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      const response = await axios.get(`${API_URL}/api/messages/category/starred`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const messages = response.data.messages || [];
      setStarredMessages(messages);
      if (user?.id) {
        for (const msg of messages) {
          await upsertMessage(user.id, msg);
        }
      }
    } catch (error) {
      console.error('Error fetching starred messages:', error);
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [getToken, user?.id]);

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
              if (msg.starred) {
                setStarredMessages((prev) => {
                  const exists = prev.some((m) => m.id === msg.id);
                  const next = exists
                    ? prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
                    : [...prev, msg];
                  return next.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
                });
                if (user?.id) await upsertMessage(user.id, msg);
              } else {
                setStarredMessages((prev) => prev.filter((m) => m.id !== msg.id));
                if (user?.id) await upsertMessage(user.id, msg);
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
  }, [user?.id, currentDevice?.deviceId, getToken]);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) return;
      if (fetchedOnceRef.current) return;
      fetchedOnceRef.current = true;
      await fetchStarredMessages();
    };
    run();
  }, [user?.id, fetchStarredMessages]);

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

  const getFileExtension = (filename) => {
    return filename?.split('.').pop()?.toLowerCase() || '';
  };

  const getHostname = (url = '') => {
    try {
      const u = new URL(url.startsWith('http') ? url : `https://${url}`);
      return u.hostname.replace(/^www\./, '');
    } catch (e) {
      return url;
    }
  };

  const getFileIcon = (filename) => {
    if (!filename) return <File className="w-5 h-5" />;
    const ext = getFileExtension(filename);

    const type = fileTypes.find((t) => t.extensions?.includes(ext));
    const Icon = type?.icon || File;
    return <Icon className="w-5 h-5" />;
  };

  const getFileColor = (filename) => {
    const ext = getFileExtension(filename);
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'text-green-400';
    if (['pdf', 'doc', 'docx', 'txt'].includes(ext)) return 'text-blue-400';
    if (['mp4', 'mov', 'avi'].includes(ext)) return 'text-purple-400';
    if (['mp3', 'wav'].includes(ext)) return 'text-pink-400';
    if (['zip', 'rar', '7z'].includes(ext)) return 'text-yellow-400';
    return 'text-gray-400';
  };

  const filteredMessages = starredMessages.filter((message) => {
    if (selectedType === 'all') return true;
    if (selectedType === 'links') {
      // include explicit link messages and text messages that contain a URL
      return message.type === 'link' || (message.type === 'text' && containsUrl(message.text));
    }
    if (message.type !== 'file' || !message.fileName) return false;

    const ext = getFileExtension(message.fileName);
    const type = fileTypes.find((t) => t.id === selectedType);
    return type?.extensions?.includes(ext);
  });

  const sortedMessages = useMemo(
    () => [...filteredMessages].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
    [filteredMessages]
  );

  const renderFilePreview = (message) => (
    <div className="w-full rounded-md overflow-hidden bg-gray-900/60 border border-gray-800">
      <FilePreview
        message={message}
        getFileUrl={(fileId) => getDriveContentUrl(fileId)}
        getThumbnailUrl={(fileId, size = 400) => getDriveThumbnailUrl(fileId, size)}
        variant="compact"
      />
    </div>
  );

  const renderCard = (message) => (
    <div
      className="bg-gray-900 border border-gray-800 rounded-lg p-3 hover:border-gray-700 transition-colors group shadow-sm"
      onDoubleClick={() =>
        message.fileId &&
        window.open(`https://drive.google.com/file/d/${message.fileId}/view`, '_blank')
      }
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`${getFileColor(message.fileName)}`}>{getFileIcon(message.fileName)}</div>
        <button
          onClick={() => unstarMessage(message.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-yellow-400 hover:text-yellow-500"
          title="Unstar"
        >
          <Star className="w-4 h-4 fill-current" />
        </button>
      </div>

      {message.type === 'file' && renderFilePreview(message)}
      {(message.type === 'link' || (message.type === 'text' && containsUrl(message.text))) &&
        (message.linkUrl || extractFirstUrl(message.text)) &&
        (() => {
          const link = message.linkUrl || extractFirstUrl(message.text);
          const hostname = getHostname(link || '');
          return (
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block rounded-lg overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors bg-black/20"
            >
              <div className="flex items-stretch">
                {message.linkImage || hostname ? (
                  <img
                    src={
                      message.linkImage ||
                      `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`
                    }
                    alt={message.linkTitle || link}
                    className="w-36 h-24 object-cover flex-shrink-0"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-36 h-24 flex-shrink-0 bg-gray-800 flex items-center justify-center text-gray-400">
                    <ExternalLink className="w-5 h-5" />
                  </div>
                )}
                <div className="p-3 space-y-1 min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white line-clamp-2 break-words">
                    {message.linkTitle || hostname}
                  </p>
                  {message.linkDescription && (
                    <p className="text-xs text-gray-300 line-clamp-2 leading-snug">
                      {message.linkDescription}
                    </p>
                  )}
                  <p className="text-xs text-blue-200 underline break-all leading-snug">{link}</p>
                </div>
              </div>
            </a>
          );
        })()}
      {message.type === 'text' && message.text && (
        <p className="text-gray-300 text-sm mb-2 line-clamp-3 leading-snug">
          {renderTextWithLinks(message.text)}
        </p>
      )}

      {message.type === 'file' && message.fileName && (
        <div className="mt-2 space-y-1">
          <p className="text-white font-medium text-sm truncate">{message.fileName}</p>
          <p className="text-gray-500 text-xs">
            {message.fileSize ? formatBytes(message.fileSize) : 'Unknown size'}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-3 mt-3 border-t border-gray-800 text-xs text-gray-500">
        <span>{dayjs(message.timestamp).fromNow()}</span>
        <div className="flex gap-2">
          {message.type === 'file' && (
            <a
              href={message.filePreviewUrl || getDriveContentUrl(message.fileId)}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-white transition-colors"
              title="Open"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={() => unstarMessage(message.id)}
            className="p-1.5 hover:bg-gray-800 rounded text-gray-400 hover:text-red-400 transition-colors"
            title="Unstar"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderListRow = (message) => (
    <div
      key={message.id}
      className="grid grid-cols-12 gap-3 items-center px-3 py-2 hover:bg-gray-900/70 rounded-lg border border-transparent hover:border-gray-800 transition-colors text-sm"
      onDoubleClick={() =>
        message.fileId &&
        window.open(`https://drive.google.com/file/d/${message.fileId}/view`, '_blank')
      }
    >
      <div className="col-span-5 flex items-center gap-3">
        <div className="w-16 h-16 bg-gray-900 border border-gray-800 rounded-lg flex items-center justify-center overflow-hidden">
          {message.type === 'file' ? (
            renderFilePreview(message)
          ) : message.type === 'link' || (message.type === 'text' && containsUrl(message.text)) ? (
            (() => {
              const linkForRow = message.linkUrl || extractFirstUrl(message.text);
              return (
                <a
                  href={linkForRow}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-300 px-2 text-center underline truncate"
                >
                  {linkForRow}
                </a>
              );
            })()
          ) : (
            <div className="text-xs text-gray-400 px-2 text-center">Text</div>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-white font-medium truncate leading-tight">
            {message.fileName || message.text}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {dayjs(message.timestamp).format('MMM D, YYYY h:mm A')}
          </p>
        </div>
      </div>
      <div className="col-span-2 text-gray-300 truncate">
        {message.type === 'file'
          ? getFileExtension(message.fileName) || 'file'
          : message.type === 'link'
            ? 'link'
            : 'text'}
      </div>
      <div className="col-span-2 text-gray-300 truncate">
        {message.type === 'file'
          ? message.fileSize
            ? formatBytes(message.fileSize)
            : 'Unknown'
          : message.type === 'link' || (message.type === 'text' && containsUrl(message.text))
            ? getHostname(message.linkUrl || extractFirstUrl(message.text))
            : '—'}
      </div>
      <div className="col-span-3 flex justify-end gap-2 text-sm">
        {(message.type === 'file' ||
          message.type === 'link' ||
          (message.type === 'text' && containsUrl(message.text))) && (
          <a
            href={
              message.type === 'file'
                ? message.filePreviewUrl || getDriveContentUrl(message.fileId)
                : message.linkUrl || extractFirstUrl(message.text)
            }
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 rounded bg-gray-800 text-gray-200 hover:bg-gray-700 transition-colors"
            title="Open"
          >
            Open
          </a>
        )}
        <button
          onClick={() => unstarMessage(message.id)}
          className="px-2 py-1 rounded bg-gray-800 text-red-300 hover:bg-gray-700 transition-colors"
          title="Unstar"
        >
          Unstar
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-800 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate('/chat')}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-white">Starred Messages</h1>
              <p className="text-sm text-gray-400">
                {filteredMessages.length} items{syncing ? ' · refreshing…' : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg border ${
                  viewMode === 'grid'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                }`}
                title="Grid view"
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg border ${
                  viewMode === 'list'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                }`}
                title="List view"
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* File Type Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {fileTypes.map((type) => {
              const Icon = type.icon;
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    selectedType === type.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {type.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[...Array(6)].map((_, idx) => (
              <div
                key={`starred-skel-${idx}`}
                className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3 animate-fade-in"
              >
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-6 rounded" />
                </div>
                <Skeleton className="h-32 w-full rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-800">
                  <Skeleton className="h-3 w-16" />
                  <div className="flex gap-2">
                    <Skeleton className="h-8 w-16 rounded" />
                    <Skeleton className="h-8 w-12 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-500">
            <Star className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-lg font-medium">No starred messages</p>
            <p className="text-sm">Star important messages to keep them here</p>
          </div>
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
                {renderCard(message)}
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
            {sortedMessages.map((message) => renderListRow(message))}
          </div>
        )}
      </div>
    </div>
  );
}
